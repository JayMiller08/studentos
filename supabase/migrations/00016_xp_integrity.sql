-- ============================================================================
-- StudentOS — XP, streaks and badges are earned, never written
--
-- Phase 2 made quiz *grading* trustworthy. Probing every migration against a
-- real Postgres, as a student holding their own JWT, showed that what grading
-- feeds into was not:
--
--   * `profiles_update_own` (00003) freezes only `role` and `plan`, so a student
--     could PATCH their own `xp`, `level` or `current_streak` to any number.
--   * `quiz_questions` was owner-writable (00014). A student could insert a quiz
--     of fifty questions whose answers they chose, or overwrite `correct_index`
--     on a generated quiz without ever reading it — and quiz-grade then paid
--     full marks against an answer key the student had written.
--   * `achievements` was owner-writable, and a badge's XP was paid by the
--     client that inserted it.
--
-- Weekly quests pay XP and leagues will rank on it, so all of this closes first.
--
-- After this migration a client cannot change XP, level or any streak field
-- (a trigger refuses with SQLSTATE XP001), cannot write a quiz question, and
-- cannot write an achievement. Everything that pays goes through one of:
--
--   record_activity(event, source)    tasks, focus, habits, notes, assignments
--   unlock_badge(badge)               a badge, if the database agrees it is earned
--   award_xp / touch_streak           quiz grading (service role only)
--
-- Amounts live in `xp_rewards`: a client names an event, never its value. Each
-- source pays once (completing, un-ticking and re-ticking a task pays once),
-- each event at most `daily_cap` times a day, and only for a row that exists
-- and is in the state the event claims — `task_completed` needs a task of
-- yours marked done.
--
-- What remains: activity is still reported by the student, and the rows that
-- prove it (a task, a habit log) are theirs to write. So activity XP can still
-- be farmed — inside the daily caps, which is what the caps are for. Quiz XP is
-- the uncapped source because it is now the verified one: questions are
-- written only by quiz-generate, and their answers are read only by quiz-grade.
--
-- Idempotent.
-- ============================================================================

-- ── 1. What each activity pays — owned by the database ─────────────────────

create table if not exists public.xp_rewards (
  event           text primary key,
  amount          integer not null check (amount >= 0),
  -- Payouts per student per local day. Further occurrences are still recorded
  -- (at 0) and still count for the streak.
  daily_cap       integer not null check (daily_cap >= 0),
  -- Whether this activity counts as studying for the daily streak.
  advances_streak boolean not null default false
);

alter table public.xp_rewards enable row level security;

drop policy if exists "xp_rewards_read" on public.xp_rewards;
create policy "xp_rewards_read" on public.xp_rewards
  for select using (auth.role() = 'authenticated');

revoke insert, update, delete on public.xp_rewards from anon, authenticated;

-- Mirrors ACTIVITY_RULES in src/services/gamification-service.ts;
-- src/services/__tests__/xp-integrity-sql.test.ts fails if they drift.
insert into public.xp_rewards (event, amount, daily_cap, advances_streak) values
  ('task_completed',        3, 20, true),
  ('pomodoro_completed',    5, 12, true),
  ('study_session',         0,  0, true),
  ('habit_completed',       5, 10, false),
  ('note_created',          5,  5, false),
  ('assignment_created',    5,  5, false),
  ('assignment_submitted', 50,  2, false)
on conflict (event) do update
  set amount          = excluded.amount,
      daily_cap       = excluded.daily_cap,
      advances_streak = excluded.advances_streak;

-- The daily-cap count reads a student's rows for one event since midnight.
create index if not exists xp_ledger_user_event_created_idx
  on public.xp_ledger (user_id, event, created_at desc);

-- ── 2. The streak, advanced on the server, on the student's own calendar ────
--
-- A port of advanceStreak() in src/lib/streak.ts. "Today" is the student's
-- local date from `profiles.timezone`: the server runs in UTC, and a session at
-- 01:00 in Johannesburg belongs to that day, not the one before.

create or replace function public.touch_streak(p_user_id uuid)
returns table (
  streak        integer,
  best_streak   integer,
  freezes       integer,
  active_on     date,
  used_freeze   boolean,
  earned_freeze boolean,
  changed       boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_today   date;
  v_days    integer;
  v_current integer;
  v_next    integer := 1;
  v_freezes integer;
  v_used    boolean := false;
  v_earned  boolean := false;
begin
  -- Locked, so two activities finishing together cannot both read yesterday's
  -- streak and both write "+1".
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    return;
  end if;

  begin
    v_today := (now() at time zone coalesce(nullif(v_profile.timezone, ''), 'UTC'))::date;
  exception when others then
    -- An unrecognised timezone must not cost the student their streak.
    v_today := (now() at time zone 'UTC')::date;
  end;

  v_days := v_today - v_profile.last_active_date;

  -- Already counted today — or a last-active date ahead of today, after flying
  -- west. Moving the date backwards, or resetting over a clock difference,
  -- would both be wrong, so nothing changes.
  if v_days is not null and v_days <= 0 then
    return query select v_profile.current_streak, v_profile.longest_streak,
      v_profile.streak_freezes, v_profile.last_active_date, false, false, false;
    return;
  end if;

  v_current := greatest(0, v_profile.current_streak);
  -- Clamped to 0..MAX_STREAK_FREEZES (2), as heldFreezes() does.
  v_freezes := least(2, greatest(0, coalesce(v_profile.streak_freezes, 0)));

  if v_days = 1 then
    v_next := v_current + 1;
  elsif v_days = 2 and v_current > 0 and v_freezes > 0 then
    -- One missed day, covered by a freeze.
    v_next := v_current + 1;
    v_used := true;
  end if;

  if v_used then
    v_freezes := v_freezes - 1;
  end if;
  -- One more for every STREAK_FREEZE_EVERY_DAYS (7) in a row, up to the cap.
  if v_next % 7 = 0 and v_freezes < 2 then
    v_freezes := v_freezes + 1;
    v_earned := true;
  end if;

  update public.profiles
     set current_streak   = v_next,
         longest_streak   = greatest(v_profile.longest_streak, v_next),
         last_active_date = v_today,
         streak_freezes   = v_freezes
   where id = p_user_id;

  return query select v_next, greatest(v_profile.longest_streak, v_next), v_freezes,
    v_today, v_used, v_earned, true;
end;
$$;

-- For quiz-grade (service role) and the functions below; never a client, which
-- could otherwise count any day it liked.
revoke all on function public.touch_streak(uuid) from public;
revoke all on function public.touch_streak(uuid) from anon;
revoke all on function public.touch_streak(uuid) from authenticated;

-- ── 3. Did the activity happen? ─────────────────────────────────────────────
--
-- The row an event names must exist, be the caller's, and be in the state the
-- event claims. This is what stops `record_activity('assignment_submitted',
-- '<anything>')` from paying: there has to be a submitted assignment.

create or replace function public.activity_happened(p_user_id uuid, p_event text, p_source_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v_date date;
begin
  if p_event = 'habit_completed' then
    -- "<habit id>:<yyyy-mm-dd>": one habit, one day.
    begin
      v_id   := split_part(p_source_id, ':', 1)::uuid;
      v_date := split_part(p_source_id, ':', 2)::date;
    exception when others then
      return false;
    end;
    return exists (
      select 1 from public.habit_logs l
       where l.user_id = p_user_id and l.habit_id = v_id and l.log_date = v_date
    );
  end if;

  begin
    v_id := p_source_id::uuid;
  exception when others then
    return false;
  end;

  return case p_event
    when 'task_completed' then exists (
      select 1 from public.tasks t
       where t.id = v_id and t.user_id = p_user_id and t.status = 'done')
    when 'study_session' then exists (
      select 1 from public.study_sessions s
       where s.id = v_id and s.user_id = p_user_id and s.minutes > 0)
    -- Keyed on the study session, which a pomodoro row points back to.
    when 'pomodoro_completed' then exists (
      select 1 from public.pomodoro_sessions p
       where p.study_session_id = v_id and p.user_id = p_user_id
         and p.kind = 'focus' and p.completed)
    when 'note_created' then exists (
      select 1 from public.notes n
       where n.id = v_id and n.user_id = p_user_id)
    when 'assignment_created' then exists (
      select 1 from public.assignments a
       where a.id = v_id and a.user_id = p_user_id)
    when 'assignment_submitted' then exists (
      select 1 from public.assignments a
       where a.id = v_id and a.user_id = p_user_id and a.status in ('submitted', 'graded'))
    else false
  end;
end;
$$;

revoke all on function public.activity_happened(uuid, text, text) from public;
revoke all on function public.activity_happened(uuid, text, text) from anon;
revoke all on function public.activity_happened(uuid, text, text) from authenticated;

-- ── 4. record_activity: the one way a client earns ─────────────────────────

create or replace function public.record_activity(p_event text, p_source_id text)
returns table (
  awarded        integer,
  total_xp       integer,
  new_level      integer,
  streak         integer,
  best_streak    integer,
  freezes        integer,
  active_on      date,
  used_freeze    boolean,
  earned_freeze  boolean,
  streak_changed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- From the verified JWT, never a parameter: a caller cannot choose whose XP.
  v_user       uuid := auth.uid();
  v_reward     public.xp_rewards%rowtype;
  v_tz         text;
  v_day_start  timestamptz;
  v_paid_today integer;
  v_amount     integer;
  v_awarded    integer;
  v_total      integer;
  v_level      integer;
  v_streak     integer;
  v_best       integer;
  v_freezes    integer;
  v_active     date;
  v_used       boolean;
  v_earned     boolean;
  v_changed    boolean;
begin
  if v_user is null then
    raise exception 'Sign in to record activity.' using errcode = '42501';
  end if;

  select * into v_reward from public.xp_rewards r where r.event = p_event;
  if not found then
    raise exception 'Unknown activity "%".', p_event using errcode = '22023';
  end if;

  if coalesce(length(p_source_id), 0) not between 1 and 128
     or not public.activity_happened(v_user, p_event, p_source_id) then
    raise exception 'There is nothing to record for that.' using errcode = '22023';
  end if;

  -- One activity at a time per student, so two requests cannot both pass the
  -- daily cap with one slot left.
  select coalesce(nullif(p.timezone, ''), 'UTC') into v_tz
    from public.profiles p where p.id = v_user for update;
  if not found then
    raise exception 'Finish setting up your profile first.' using errcode = 'P0002';
  end if;

  begin
    v_day_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  exception when others then
    v_day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  end;

  select count(*) into v_paid_today
    from public.xp_ledger l
   where l.user_id = v_user
     and l.event = p_event
     and l.amount > 0
     and l.created_at >= v_day_start;

  v_amount := case when v_paid_today >= v_reward.daily_cap then 0 else v_reward.amount end;

  -- Recorded even at 0, so a source that was capped today cannot pay tomorrow.
  select a.awarded, a.total_xp, a.new_level into v_awarded, v_total, v_level
    from public.award_xp(v_user, p_event, p_source_id, v_amount) a;

  if v_reward.advances_streak then
    select s.streak, s.best_streak, s.freezes, s.active_on, s.used_freeze, s.earned_freeze, s.changed
      into v_streak, v_best, v_freezes, v_active, v_used, v_earned, v_changed
      from public.touch_streak(v_user) s;
  end if;

  return query select v_awarded, v_total, v_level, v_streak, v_best, v_freezes, v_active,
    coalesce(v_used, false), coalesce(v_earned, false), coalesce(v_changed, false);
end;
$$;

revoke all on function public.record_activity(text, text) from public;
revoke all on function public.record_activity(text, text) from anon;
grant execute on function public.record_activity(text, text) to authenticated;

-- ── 5. Badges: earned when the database agrees ──────────────────────────────
--
-- Mirrors the badge checks in gamificationService.award(). Streak and level
-- badges read columns only the server writes now, so those are fully verified;
-- the rest count rows the student owns, and are as honest as those rows. A
-- badge with no rule here (early-bird) cannot be unlocked by a client at all.

create or replace function public.badge_earned(p_user_id uuid, p_badge_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(case p_badge_id
    when 'first-assignment' then exists (
      select 1 from public.assignments a where a.user_id = p_user_id)
    when 'first-submission' then exists (
      select 1 from public.assignments a
       where a.user_id = p_user_id and a.status in ('submitted', 'graded'))
    when 'first-pomodoro' then exists (
      select 1 from public.pomodoro_sessions p
       where p.user_id = p_user_id and p.kind = 'focus' and p.completed)
    when 'focus-10h' then (
      select coalesce(sum(s.minutes), 0) from public.study_sessions s where s.user_id = p_user_id) >= 600
    when 'focus-50h' then (
      select coalesce(sum(s.minutes), 0) from public.study_sessions s where s.user_id = p_user_id) >= 3000
    when 'habit-builder' then (
      select count(*) from public.habit_logs l where l.user_id = p_user_id) >= 21
    when 'note-taker' then (
      select count(*) from public.notes n where n.user_id = p_user_id) >= 10
    when 'streak-7' then (
      select p.longest_streak from public.profiles p where p.id = p_user_id) >= 7
    when 'streak-30' then (
      select p.longest_streak from public.profiles p where p.id = p_user_id) >= 30
    when 'level-5' then (
      select p.level from public.profiles p where p.id = p_user_id) >= 5
    when 'level-10' then (
      select p.level from public.profiles p where p.id = p_user_id) >= 10
    else false
  end, false)
$$;

revoke all on function public.badge_earned(uuid, text) from public;
revoke all on function public.badge_earned(uuid, text) from anon;
revoke all on function public.badge_earned(uuid, text) from authenticated;

create or replace function public.unlock_badge(p_badge_id text)
returns table (unlocked boolean, awarded integer, total_xp integer, new_level integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_reward   integer;
  v_inserted boolean;
  v_awarded  integer;
  v_total    integer;
  v_level    integer;
begin
  if v_user is null then
    raise exception 'Sign in to unlock badges.' using errcode = '42501';
  end if;

  -- The reward comes from the catalogue, never the caller.
  select b.xp_reward into v_reward from public.badges b where b.id = p_badge_id;
  if not found then
    raise exception 'Unknown badge "%".', p_badge_id using errcode = '22023';
  end if;

  if not public.badge_earned(v_user, p_badge_id) then
    -- Not earned (yet). Nothing is written; the caller learns where it stands.
    select p.xp, p.level into v_total, v_level from public.profiles p where p.id = v_user;
    return query select false, 0, coalesce(v_total, 0), coalesce(v_level, 1);
    return;
  end if;

  insert into public.achievements (user_id, badge_id, unlocked_at)
  values (v_user, p_badge_id, now())
  on conflict (user_id, badge_id) do nothing;
  v_inserted := found;

  -- Keyed on the badge: unlocking twice, or a badge held from before this
  -- migration, pays nothing more.
  select a.awarded, a.total_xp, a.new_level into v_awarded, v_total, v_level
    from public.award_xp(v_user, 'badge_unlocked', p_badge_id,
                         case when v_inserted then v_reward else 0 end) a;

  return query select v_inserted, v_awarded, v_total, v_level;
end;
$$;

revoke all on function public.unlock_badge(text) from public;
revoke all on function public.unlock_badge(text) from anon;
grant execute on function public.unlock_badge(text) to authenticated;

-- Achievements are written by unlock_badge alone. Students keep read access;
-- the owner write policies 00003 gave every user table are removed for this one.
drop policy if exists "achievements_insert_own" on public.achievements;
drop policy if exists "achievements_update_own" on public.achievements;
drop policy if exists "achievements_delete_own" on public.achievements;
revoke insert, update, delete on public.achievements from anon, authenticated;

-- ── 6. The progress columns, frozen for clients ─────────────────────────────
--
-- A trigger rather than more `WITH CHECK` subqueries on profiles_update_own: it
-- covers inserts and upserts as well as updates, applies to the admin update
-- policy too, and can say what it refused. `current_user` decides: a PostgREST
-- request runs as `anon` or `authenticated`; the functions above run as their
-- owner; the service role and the SQL editor run as themselves.

create or replace function public.guard_profile_progress()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A client may create its own profile, but it starts from nothing. One
    -- freeze is the starting grant (00013, STARTING_STREAK_FREEZES).
    new.xp               := 0;
    new.level            := 1;
    new.current_streak   := 0;
    new.longest_streak   := 0;
    new.last_active_date := null;
    new.streak_freezes   := 1;
    return new;
  end if;

  if new.xp               is distinct from old.xp
  or new.level            is distinct from old.level
  or new.current_streak   is distinct from old.current_streak
  or new.longest_streak   is distinct from old.longest_streak
  or new.last_active_date is distinct from old.last_active_date
  or new.streak_freezes   is distinct from old.streak_freezes then
    raise exception 'XP and streaks can''t be edited. They grow as you study.'
      using errcode = 'XP001',
            hint = 'They change only through record_activity, unlock_badge and quiz grading.';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_progress on public.profiles;
create trigger profiles_guard_progress
  before insert or update on public.profiles
  for each row execute function public.guard_profile_progress();

-- ── 7. Quiz content is written by the server ────────────────────────────────
--
-- Quizzes are created by quiz-generate, with the service role, and nothing in
-- the client writes a question. The owner write policies 00014 added served a
-- manual-authoring screen that was never built, and they were the hole: an
-- answer key you wrote is not a test of anything. Students keep reading their
-- quizzes, renaming them and filing them under a module, and deleting them
-- (questions and attempts go with the quiz, by cascade).

drop policy if exists "quizzes_insert_own" on public.quizzes;
revoke insert on public.quizzes from anon, authenticated;
-- Kind and source decide the XP a quiz pays, so only these two may change.
revoke update on public.quizzes from anon, authenticated;
grant update (title, module_id) on public.quizzes to authenticated;

drop policy if exists "quiz_questions_insert_own" on public.quiz_questions;
drop policy if exists "quiz_questions_update_own" on public.quiz_questions;
drop policy if exists "quiz_questions_delete_own" on public.quiz_questions;
revoke insert, update, delete on public.quiz_questions from anon, authenticated;
