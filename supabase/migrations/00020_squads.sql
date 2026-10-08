-- ============================================================================
-- StudentOS — squads
--
-- A small group of students (3 to 6) working through the same week: the same
-- three quests, one table of who earned what. The first place in StudentOS
-- where one student sees anything about another, so the design is narrow on
-- purpose:
--
--   * Squad mates see a handle chosen for the squad, XP earned this week, the
--     current streak and which of this week's quests were claimed. Never a
--     name, an email, a university, modules, grades or notes.
--   * Nothing shown is stored on the squad. Weekly XP and streaks are read, at
--     the moment they are asked for, from `xp_ledger` and `profiles` — columns
--     no client can write since 00016. A copy on the membership row would have
--     had to be written by the client, and so could have been made up.
--   * The tables have row level security and no client policies at all, and
--     their privileges are revoked: every read and write is one of the
--     functions below, which take the student from the JWT.
--   * Squads pay nothing. They rank XP already earned, so they open no new way
--     to earn it.
--
-- Mirrored by src/lib/squads.ts (limits, handle and code rules) and by demo
-- mode in src/services/squad-service.ts; src/lib/__tests__/squads-sql.test.ts
-- fails if they drift.
--
-- Idempotent.
-- ============================================================================

-- ── 1. Tables ───────────────────────────────────────────────────────────────

create table if not exists public.squads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 40),
  -- 8 characters from an alphabet without 0/O, 1/I/L, read aloud or typed
  -- from a phone screen without guessing.
  join_code  text not null unique check (join_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.squad_members (
  squad_id  uuid not null references public.squads(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  handle    text not null check (handle ~ '^[A-Za-z0-9_]{3,20}$'),
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (squad_id, user_id),
  -- One squad per student.
  constraint squad_members_one_squad unique (user_id)
);

create unique index if not exists squad_members_handle_idx on public.squad_members (squad_id, lower(handle));
create index if not exists squad_members_joined_idx on public.squad_members (squad_id, joined_at);

-- Wrong join codes, so a code cannot be found by guessing.
create table if not exists public.squad_join_failures (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now()
);

create index if not exists squad_join_failures_user_idx on public.squad_join_failures (user_id, at);

alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.squad_join_failures enable row level security;

revoke all on public.squads from anon, authenticated;
revoke all on public.squad_members from anon, authenticated;
revoke all on public.squad_join_failures from anon, authenticated;

-- ── 2. The size cap, whoever writes ─────────────────────────────────────────
--
-- join_squad checks too, but the trigger is what holds for every writer. The
-- squad row is locked first, so two students joining a squad of five at the
-- same moment are counted one after the other: the second sees six.

create or replace function public.enforce_squad_size()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  perform 1 from public.squads s where s.id = new.squad_id for update;
  select count(*)::integer into v_count from public.squad_members m where m.squad_id = new.squad_id;
  if v_count >= 6 then
    raise exception 'That squad is full (6 of 6).' using errcode = 'SQ001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_squad_size() from public;
revoke all on function public.enforce_squad_size() from anon;
revoke all on function public.enforce_squad_size() from authenticated;

drop trigger if exists squad_members_enforce_size on public.squad_members;
create trigger squad_members_enforce_size
  before insert on public.squad_members
  for each row execute function public.enforce_squad_size();

-- ── 3. Someone leaves ───────────────────────────────────────────────────────
--
-- However they go (leave_squad, removed by the owner, or their account
-- deleted), the squad keeps an owner: the longest-standing member takes over.
-- The last one out closes the squad.

create or replace function public.settle_squad_after_leave()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next uuid;
begin
  -- The squad itself is being deleted, and its members with it.
  if not exists (select 1 from public.squads s where s.id = old.squad_id) then
    return null;
  end if;

  if not exists (select 1 from public.squad_members m where m.squad_id = old.squad_id) then
    delete from public.squads s where s.id = old.squad_id;
    return null;
  end if;

  if not exists (select 1 from public.squad_members m where m.squad_id = old.squad_id and m.role = 'owner') then
    select m.user_id into v_next
      from public.squad_members m
     where m.squad_id = old.squad_id
     order by m.joined_at, m.user_id
     limit 1;
    update public.squad_members m set role = 'owner'
     where m.squad_id = old.squad_id and m.user_id = v_next;
  end if;
  return null;
end;
$$;

revoke all on function public.settle_squad_after_leave() from public;
revoke all on function public.settle_squad_after_leave() from anon;
revoke all on function public.settle_squad_after_leave() from authenticated;

drop trigger if exists squad_members_settle_after_leave on public.squad_members;
create trigger squad_members_settle_after_leave
  after delete on public.squad_members
  for each row execute function public.settle_squad_after_leave();

-- ── 4. Helpers (not callable by clients) ────────────────────────────────────

-- A fresh join code. Randomness from gen_random_uuid() (a strong source, and
-- core Postgres, so no extension schema to find): the two bytes carrying the
-- UUID version and variant are skipped, and bytes of 248 or more are rejected
-- so each of the 31 characters is equally likely.
create or replace function public.squad_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_byte  integer;
  v_code  text;
begin
  loop
    v_code := '';
    while char_length(v_code) < 8 loop
      v_bytes := uuid_send(gen_random_uuid());
      for i in 0..15 loop
        continue when i in (6, 8);
        v_byte := get_byte(v_bytes, i);
        continue when v_byte >= 248;
        v_code := v_code || substr(v_alphabet, (v_byte % 31) + 1, 1);
        exit when char_length(v_code) = 8;
      end loop;
    end loop;
    exit when not exists (select 1 from public.squads s where s.join_code = v_code);
  end loop;
  return v_code;
end;
$$;

revoke all on function public.squad_code() from public;
revoke all on function public.squad_code() from anon;
revoke all on function public.squad_code() from authenticated;

-- A streak as of now, not as of its last write: effectiveStreak() in
-- src/lib/streak.ts. Alive through today and yesterday on the student's own
-- calendar, through the day before that if a freeze covers the gap, else 0.
create or replace function public.effective_streak(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile record;
  v_today   date;
  v_days    integer;
begin
  select p.current_streak, p.last_active_date, p.streak_freezes,
         coalesce(nullif(p.timezone, ''), 'UTC') as tz
    into v_profile
    from public.profiles p
   where p.id = p_user_id;
  if not found or coalesce(v_profile.current_streak, 0) <= 0 or v_profile.last_active_date is null then
    return 0;
  end if;
  begin
    v_today := (now() at time zone v_profile.tz)::date;
  exception when others then
    v_today := (now() at time zone 'UTC')::date;
  end;
  v_days := v_today - v_profile.last_active_date;
  if v_days <= 1 then
    return v_profile.current_streak;
  end if;
  if v_days = 2 and coalesce(v_profile.streak_freezes, 0) > 0 then
    return v_profile.current_streak;
  end if;
  return 0;
end;
$$;

revoke all on function public.effective_streak(uuid) from public;
revoke all on function public.effective_streak(uuid) from anon;
revoke all on function public.effective_streak(uuid) from authenticated;

-- XP earned in the student's own quest week (Monday 00:00 in their timezone),
-- every source included: nothing in a squad pays, so nothing here can loop.
create or replace function public.squad_week_xp(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(l.amount), 0)::integer
    from public.xp_ledger l, public.quest_week(p_user_id) w
   where l.user_id = p_user_id and l.created_at >= w.starts_at and l.created_at < w.ends_at
$$;

revoke all on function public.squad_week_xp(uuid) from public;
revoke all on function public.squad_week_xp(uuid) from anon;
revoke all on function public.squad_week_xp(uuid) from authenticated;

-- The checks every handle and name pass, with sentences for the student.
create or replace function public.squad_check_handle(p_handle text)
returns text
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_handle text := btrim(coalesce(p_handle, ''));
begin
  if v_handle !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'A handle is 3 to 20 letters, numbers or underscores.' using errcode = '22023';
  end if;
  return v_handle;
end;
$$;

revoke all on function public.squad_check_handle(text) from public;
revoke all on function public.squad_check_handle(text) from anon;
revoke all on function public.squad_check_handle(text) from authenticated;

create or replace function public.squad_check_name(p_name text)
returns text
language plpgsql
immutable
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'A squad name is 2 to 40 characters.' using errcode = '22023';
  end if;
  return v_name;
end;
$$;

revoke all on function public.squad_check_name(text) from public;
revoke all on function public.squad_check_name(text) from anon;
revoke all on function public.squad_check_name(text) from authenticated;

-- ── 5. What a student may call ──────────────────────────────────────────────

-- The caller's squad, or no rows.
create or replace function public.my_squad()
returns table (squad_id uuid, name text, join_code text, role text, handle text, member_count integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to see your squad.' using errcode = '42501';
  end if;
  return query
    select s.id, s.name, s.join_code, m.role, m.handle,
           (select count(*)::integer from public.squad_members c where c.squad_id = s.id)
      from public.squad_members m
      join public.squads s on s.id = m.squad_id
     where m.user_id = v_user;
end;
$$;

revoke all on function public.my_squad() from public;
revoke all on function public.my_squad() from anon;
grant execute on function public.my_squad() to authenticated;

-- This week's table for the caller's squad: the handle, never the account.
create or replace function public.squad_board()
returns table (handle text, is_me boolean, role text, weekly_xp integer, streak integer, quests_claimed text[])
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_squad uuid;
begin
  if v_user is null then
    raise exception 'Sign in to see your squad.' using errcode = '42501';
  end if;
  select m.squad_id into v_squad from public.squad_members m where m.user_id = v_user;
  if v_squad is null then
    return;
  end if;
  return query
    select m.handle,
           m.user_id = v_user,
           m.role,
           public.squad_week_xp(m.user_id),
           public.effective_streak(m.user_id),
           coalesce((
             select array_agg(substr(l.source_id, 12) order by l.source_id)
               from public.xp_ledger l, public.quest_week(m.user_id) w
              where l.user_id = m.user_id and l.event = 'quest_claimed'
                and l.source_id like w.week_start::text || ':%'
           ), '{}'::text[])
      from public.squad_members m
     where m.squad_id = v_squad
     order by 4 desc, lower(m.handle);
end;
$$;

revoke all on function public.squad_board() from public;
revoke all on function public.squad_board() from anon;
grant execute on function public.squad_board() to authenticated;

create or replace function public.create_squad(p_name text, p_handle text)
returns table (squad_id uuid, join_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_name   text;
  v_handle text;
  v_code   text;
  v_squad  uuid;
begin
  if v_user is null then
    raise exception 'Sign in to start a squad.' using errcode = '42501';
  end if;
  if exists (select 1 from public.squad_members m where m.user_id = v_user) then
    raise exception 'You''re already in a squad. Leave it before starting another.' using errcode = '22023';
  end if;
  v_name := public.squad_check_name(p_name);
  v_handle := public.squad_check_handle(p_handle);
  v_code := public.squad_code();

  insert into public.squads (name, join_code, created_by) values (v_name, v_code, v_user)
  returning id into v_squad;
  insert into public.squad_members (squad_id, user_id, handle, role) values (v_squad, v_user, v_handle, 'owner');

  return query select v_squad, v_code;
end;
$$;

revoke all on function public.create_squad(text, text) from public;
revoke all on function public.create_squad(text, text) from anon;
grant execute on function public.create_squad(text, text) to authenticated;

-- A wrong code is answered with a row, not an error: an error would roll back
-- the failure it records, and the guessing limit would never count anything.
create or replace function public.join_squad(p_code text, p_handle text)
returns table (joined boolean, squad_id uuid, name text, message text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_code   text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_handle text;
  v_squad  public.squads%rowtype;
begin
  if v_user is null then
    raise exception 'Sign in to join a squad.' using errcode = '42501';
  end if;

  delete from public.squad_join_failures f where f.user_id = v_user and f.at < now() - interval '1 day';
  if (select count(*) from public.squad_join_failures f
       where f.user_id = v_user and f.at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many wrong codes. Try again in an hour.' using errcode = '22023';
  end if;

  if exists (select 1 from public.squad_members m where m.user_id = v_user) then
    raise exception 'You''re already in a squad. Leave it before joining another.' using errcode = '22023';
  end if;
  v_handle := public.squad_check_handle(p_handle);

  select * into v_squad from public.squads s where s.join_code = v_code for update;
  if not found then
    insert into public.squad_join_failures (user_id) values (v_user);
    return query select false, null::uuid, null::text, 'No squad has that code. Check it with whoever sent it.'::text;
    return;
  end if;

  if exists (select 1 from public.squad_members m
              where m.squad_id = v_squad.id and lower(m.handle) = lower(v_handle)) then
    raise exception 'Someone in that squad already goes by "%". Pick another handle.', v_handle using errcode = '22023';
  end if;

  -- The size trigger raises SQ001, "That squad is full (6 of 6).", at six.
  insert into public.squad_members (squad_id, user_id, handle, role) values (v_squad.id, v_user, v_handle, 'member');

  return query select true, v_squad.id, v_squad.name, null::text;
end;
$$;

revoke all on function public.join_squad(text, text) from public;
revoke all on function public.join_squad(text, text) from anon;
grant execute on function public.join_squad(text, text) to authenticated;

create or replace function public.leave_squad()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to leave a squad.' using errcode = '42501';
  end if;
  delete from public.squad_members m where m.user_id = v_user;
  if not found then
    raise exception 'You''re not in a squad.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.leave_squad() from public;
revoke all on function public.leave_squad() from anon;
grant execute on function public.leave_squad() to authenticated;

-- The owner's squad, or a refusal: what every owner-only function starts with.
create or replace function public.owned_squad(p_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_squad uuid;
  v_role  text;
begin
  select m.squad_id, m.role into v_squad, v_role from public.squad_members m where m.user_id = p_user_id;
  if v_squad is null then
    raise exception 'You''re not in a squad.' using errcode = '22023';
  end if;
  if v_role <> 'owner' then
    raise exception 'Only the squad''s owner can do that.' using errcode = '22023';
  end if;
  return v_squad;
end;
$$;

revoke all on function public.owned_squad(uuid) from public;
revoke all on function public.owned_squad(uuid) from anon;
revoke all on function public.owned_squad(uuid) from authenticated;

create or replace function public.remove_squad_member(p_handle text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_squad uuid;
  v_who   uuid;
begin
  if v_user is null then
    raise exception 'Sign in to manage your squad.' using errcode = '42501';
  end if;
  v_squad := public.owned_squad(v_user);
  select m.user_id into v_who
    from public.squad_members m
   where m.squad_id = v_squad and lower(m.handle) = lower(btrim(coalesce(p_handle, '')));
  if v_who is null then
    raise exception 'Nobody in your squad goes by that handle.' using errcode = '22023';
  end if;
  if v_who = v_user then
    raise exception 'To go yourself, leave the squad.' using errcode = '22023';
  end if;
  delete from public.squad_members m where m.squad_id = v_squad and m.user_id = v_who;
end;
$$;

revoke all on function public.remove_squad_member(text) from public;
revoke all on function public.remove_squad_member(text) from anon;
grant execute on function public.remove_squad_member(text) to authenticated;

create or replace function public.rename_squad(p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_squad uuid;
  v_name  text;
begin
  if v_user is null then
    raise exception 'Sign in to manage your squad.' using errcode = '42501';
  end if;
  v_squad := public.owned_squad(v_user);
  v_name := public.squad_check_name(p_name);
  update public.squads s set name = v_name where s.id = v_squad;
  return v_name;
end;
$$;

revoke all on function public.rename_squad(text) from public;
revoke all on function public.rename_squad(text) from anon;
grant execute on function public.rename_squad(text) to authenticated;

-- A new code, for when the old one was shared too widely: the old one stops
-- working at once. Members already in stay in.
create or replace function public.new_squad_code()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_squad uuid;
  v_code  text;
begin
  if v_user is null then
    raise exception 'Sign in to manage your squad.' using errcode = '42501';
  end if;
  v_squad := public.owned_squad(v_user);
  v_code := public.squad_code();
  update public.squads s set join_code = v_code where s.id = v_squad;
  return v_code;
end;
$$;

revoke all on function public.new_squad_code() from public;
revoke all on function public.new_squad_code() from anon;
grant execute on function public.new_squad_code() to authenticated;
