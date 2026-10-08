-- ============================================================================
-- StudentOS — quizzes from the student's own material
--
-- A student uploads what they actually study from — a lecture PDF, photos of
-- handwritten notes — or picks a note, and gets a quiz written from exactly
-- that, every question citing the page it came from.
--
-- This migration is the data side:
--
--   * `study-resources`, a private bucket that refuses anything but PDFs and
--     photos, and anything over 20 MB, whatever a client sends.
--   * `study_resources`, the student's library of uploaded files. The student
--     names and files them; the outline (topics, page ranges) and the status
--     are written by the `resource-outline` function only.
--   * `quiz_generations`, one row per quiz being written. The work happens in
--     the background inside `quiz-generate`; the student watches this row.
--   * `ai_usage`, the meter. Every AI call that costs money leaves a row the
--     student can read and never write, and the allowances count from it:
--     AI quizzes per month by plan, file readings per day for everyone.
--
-- Quizzes still come into being only through `quiz-generate` (00016 revoked
-- client inserts), now linked to the file or note they were written from.
--
-- Idempotent.
-- ============================================================================

-- ── 1. The bucket ───────────────────────────────────────────────────────────
--
-- Layout, the 00004 convention:  study-resources/{user_id}/{uuid}.{ext}
-- 20 MB keeps a file inside one Gemini request comfortably (PDFs may be up to
-- 50 MB there) and inside an Edge Function's memory while it is read.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'study-resources', 'study-resources', false, 20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "study_resources_owner_select" on storage.objects;
create policy "study_resources_owner_select" on storage.objects
  for select using (
    bucket_id = 'study-resources' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "study_resources_owner_insert" on storage.objects;
create policy "study_resources_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'study-resources' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "study_resources_owner_delete" on storage.objects;
create policy "study_resources_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'study-resources' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 2. The library ──────────────────────────────────────────────────────────

-- Every path in a resource must sit in its owner's folder. Checked by the
-- table itself, so no writer — the service role included — can point a row
-- at another student's file, which `quiz-generate` would then read for them.
create or replace function public.storage_paths_owned(p_user_id uuid, p_paths text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(bool_and(split_part(path, '/', 1) = p_user_id::text and path ~ '^[^/]+/[^/]+$'), false)
    from unnest(p_paths) as path
$$;

create table if not exists public.study_resources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  module_id     uuid references public.modules(id) on delete set null,
  title         text not null default 'Untitled file' check (char_length(title) between 1 and 160),
  -- One PDF, or up to ten photos of notes read in order.
  kind          text not null check (kind in ('pdf', 'photos')),
  storage_paths text[] not null,
  size_bytes    bigint not null default 0 check (size_bytes >= 0),
  -- Written by resource-outline. `uploaded` until it has been read.
  status        text not null default 'uploaded' check (status in ('uploaded', 'reading', 'ready', 'failed')),
  page_count    integer check (page_count is null or page_count > 0),
  -- [{ "name": "Eigenvalues", "pages": "3–7", "summary": "…" }]
  outline       jsonb not null default '[]'::jsonb,
  summary       text,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint study_resources_paths_count check (
    cardinality(storage_paths) between 1 and 10
    and (kind = 'photos' or cardinality(storage_paths) = 1)
  ),
  constraint study_resources_paths_owned check (public.storage_paths_owned(user_id, storage_paths))
);

create index if not exists study_resources_user_id_idx on public.study_resources (user_id, created_at desc);
create index if not exists study_resources_module_id_idx on public.study_resources (module_id);

drop trigger if exists set_updated_at on public.study_resources;
create trigger set_updated_at before update on public.study_resources
  for each row execute function public.set_updated_at();

alter table public.study_resources enable row level security;

drop policy if exists "study_resources_select_own" on public.study_resources;
create policy "study_resources_select_own" on public.study_resources
  for select using (auth.uid() = user_id);

drop policy if exists "study_resources_insert_own" on public.study_resources;
create policy "study_resources_insert_own" on public.study_resources
  for insert with check (auth.uid() = user_id);

drop policy if exists "study_resources_update_own" on public.study_resources;
create policy "study_resources_update_own" on public.study_resources
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "study_resources_delete_own" on public.study_resources;
create policy "study_resources_delete_own" on public.study_resources
  for delete using (auth.uid() = user_id);

-- A client describes a file; it never writes what reading it found. Column
-- privileges, so a stray `status: 'ready'` is refused rather than ignored.
revoke insert, update on public.study_resources from anon, authenticated;
grant insert (user_id, module_id, title, kind, storage_paths, size_bytes) on public.study_resources to authenticated;
grant update (title, module_id) on public.study_resources to authenticated;

-- Free keeps a library of 15 files; Pro and Elite are unmetered (the daily
-- reading cap below still bounds what any account can send to the AI).
-- Same SQLSTATE and wording as 00010's caps, so the client already shows it.
create or replace function public.enforce_resource_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan  text;
  v_count integer;
begin
  select coalesce(p.plan, 'free') into v_plan from public.profiles p where p.id = new.user_id;
  if coalesce(v_plan, 'free') <> 'free' then
    return new;
  end if;
  select count(*) into v_count from public.study_resources r where r.user_id = new.user_id;
  if v_count >= 15 then
    raise exception 'Your plan includes up to % %. Upgrade to Student Pro for unlimited %.',
      15, 'study files', 'study files'
      using errcode = 'PL001';
  end if;
  return new;
end;
$$;

drop trigger if exists study_resources_plan_limit on public.study_resources;
create trigger study_resources_plan_limit
  before insert on public.study_resources
  for each row execute function public.enforce_resource_limit();

-- ── 3. A quiz remembers what it was written from ────────────────────────────

alter table public.quizzes
  add column if not exists resource_id uuid references public.study_resources(id) on delete set null;
alter table public.quizzes
  add column if not exists note_id uuid references public.notes(id) on delete set null;

create index if not exists quizzes_resource_id_idx on public.quizzes (resource_id);
create index if not exists quizzes_note_id_idx on public.quizzes (note_id);

-- ── 4. Generation jobs ──────────────────────────────────────────────────────

create table if not exists public.quiz_generations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  resource_id uuid references public.study_resources(id) on delete set null,
  note_id     uuid references public.notes(id) on delete set null,
  title       text not null,
  -- queued → reading → writing → checking → done, or failed at any point.
  status      text not null default 'queued'
              check (status in ('queued', 'reading', 'writing', 'checking', 'done', 'failed')),
  -- What the student asked for: { count, difficulty, topics, kind }.
  options     jsonb not null default '{}'::jsonb,
  quiz_id     uuid references public.quizzes(id) on delete set null,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists quiz_generations_user_id_idx on public.quiz_generations (user_id, created_at desc);

drop trigger if exists set_updated_at on public.quiz_generations;
create trigger set_updated_at before update on public.quiz_generations
  for each row execute function public.set_updated_at();

alter table public.quiz_generations enable row level security;

drop policy if exists "quiz_generations_select_own" on public.quiz_generations;
create policy "quiz_generations_select_own" on public.quiz_generations
  for select using (auth.uid() = user_id);

-- Written by quiz-generate alone.
revoke insert, update, delete on public.quiz_generations from anon, authenticated;

-- ── 5. The meter ────────────────────────────────────────────────────────────

create table if not exists public.ai_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('quiz', 'outline')),
  -- The generation job or the file the call was spent on.
  source_id  uuid,
  -- A quiz that failed is not charged against the month's allowance.
  charged    boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_kind_idx on public.ai_usage (user_id, kind, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage_select_own" on public.ai_usage;
create policy "ai_usage_select_own" on public.ai_usage
  for select using (auth.uid() = user_id);

revoke insert, update, delete on public.ai_usage from anon, authenticated;

-- Mirrors AI_ALLOWANCES in src/lib/plans.ts; plans.test.ts fails if they drift.
create or replace function public.ai_quiz_allowance(p_plan text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_plan when 'pro' then 40 when 'elite' then 150 else 3 end
$$;

-- Start a quiz: refuse past the month's allowance, else open the job and
-- charge for it, in one transaction so two requests cannot share a last slot.
create or replace function public.begin_quiz_generation(
  p_user_id     uuid,
  p_resource_id uuid,
  p_note_id     uuid,
  p_title       text,
  p_options     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan    text;
  v_limit   integer;
  v_used    integer;
  v_job     uuid;
begin
  -- One start at a time per student.
  select p.plan into v_plan from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'Finish setting up your profile first.' using errcode = 'P0002';
  end if;

  -- A job that never finished (the function was stopped mid-way) would hold
  -- its charge for ever; give it up after ten minutes, and the charge back.
  with stale as (
    update public.quiz_generations g
       set status = 'failed', error = 'That took too long. Try again.'
     where g.user_id = p_user_id
       and g.status not in ('done', 'failed')
       and g.created_at < now() - interval '10 minutes'
    returning g.id
  )
  update public.ai_usage u set charged = false
   where u.user_id = p_user_id and u.kind = 'quiz' and u.source_id in (select id from stale);

  v_limit := public.ai_quiz_allowance(v_plan);
  select count(*) into v_used
    from public.ai_usage u
   where u.user_id = p_user_id and u.kind = 'quiz' and u.charged
     and u.created_at >= date_trunc('month', now());

  if v_used >= v_limit then
    raise exception '%', case
        when coalesce(v_plan, 'free') = 'free' then
          format('You have used your %s AI quizzes for this month. Student Pro gives you %s a month.',
                 v_limit, public.ai_quiz_allowance('pro'))
        else
          format('You have used your %s AI quizzes for this month. They come back on the 1st.', v_limit)
      end
      using errcode = 'AI001';
  end if;

  insert into public.quiz_generations (user_id, resource_id, note_id, title, options)
  values (p_user_id, p_resource_id, p_note_id, left(coalesce(nullif(btrim(p_title), ''), 'Quiz'), 120),
          coalesce(p_options, '{}'::jsonb))
  returning id into v_job;

  insert into public.ai_usage (user_id, kind, source_id) values (p_user_id, 'quiz', v_job);
  return v_job;
end;
$$;

-- Reading a file for its outline: 20 a day, whatever the plan. Uploads are
-- not metered by the quiz allowance, so this is what bounds them.
create or replace function public.begin_outline(p_user_id uuid, p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  perform 1 from public.profiles p where p.id = p_user_id for update;
  select count(*) into v_used
    from public.ai_usage u
   where u.user_id = p_user_id and u.kind = 'outline'
     and u.created_at >= now() - interval '1 day';
  if v_used >= 20 then
    raise exception 'You have added 20 files today. Try again tomorrow.' using errcode = 'AI001';
  end if;
  insert into public.ai_usage (user_id, kind, source_id) values (p_user_id, 'outline', p_resource_id);
end;
$$;

-- The Edge Functions call these with an id from a verified JWT. A client that
-- could call them would charge — or fail to charge — whoever it named.
revoke all on function public.begin_quiz_generation(uuid, uuid, uuid, text, jsonb) from public;
revoke all on function public.begin_quiz_generation(uuid, uuid, uuid, text, jsonb) from anon;
revoke all on function public.begin_quiz_generation(uuid, uuid, uuid, text, jsonb) from authenticated;
revoke all on function public.begin_outline(uuid, uuid) from public;
revoke all on function public.begin_outline(uuid, uuid) from anon;
revoke all on function public.begin_outline(uuid, uuid) from authenticated;

-- ── 6. Live status for the student watching a job ───────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['study_resources', 'quiz_generations']
  loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end;
$$;
