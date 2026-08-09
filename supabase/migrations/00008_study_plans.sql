-- ============================================================================
-- StudentOS — saved study plans
--
-- Smart Plan used to be ephemeral: generate, apply, lose it on reload. This
-- table lets a student keep a plan ("Exam block", "Week 7"), reopen it, edit
-- its blocks and delete it.
--
-- The generated schedule is stored as JSONB rather than normalized rows: it is
-- a *snapshot* of a proposal, always read and written whole, and never queried
-- across. The generating settings are stored as real columns because they are
-- the inputs a student edits and re-runs.
-- Idempotent.
-- ============================================================================

create table if not exists public.study_plans (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  name                   text not null default 'My study plan',
  horizon_days           integer not null default 7 check (horizon_days between 1 and 31),
  daily_capacity_minutes integer not null default 180 check (daily_capacity_minutes between 15 and 960),
  stress_level           integer not null default 50 check (stress_level between 0 and 100),
  -- StudyPlanDay[] as produced by services/study-planner.ts
  days                   jsonb not null default '[]'::jsonb,
  recommendations        jsonb not null default '[]'::jsonb,
  unscheduled_minutes    integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists study_plans_user_id_idx on public.study_plans (user_id);

-- 00002 attaches this trigger by scanning the tables that existed then, so a
-- table added later has to opt in explicitly.
drop trigger if exists set_updated_at on public.study_plans;
create trigger set_updated_at before update on public.study_plans
  for each row execute function public.set_updated_at();

-- ── RLS: owner-only, deny by default ────────────────────────────────────────
alter table public.study_plans enable row level security;

drop policy if exists "study_plans_select_own" on public.study_plans;
create policy "study_plans_select_own" on public.study_plans
  for select using (auth.uid() = user_id);

drop policy if exists "study_plans_insert_own" on public.study_plans;
create policy "study_plans_insert_own" on public.study_plans
  for insert with check (auth.uid() = user_id);

drop policy if exists "study_plans_update_own" on public.study_plans;
create policy "study_plans_update_own" on public.study_plans
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "study_plans_delete_own" on public.study_plans;
create policy "study_plans_delete_own" on public.study_plans
  for delete using (auth.uid() = user_id);

-- ── Realtime: keep the saved-plan list live across a student's devices ──────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'study_plans'
  ) then
    alter publication supabase_realtime add table public.study_plans;
  end if;

  alter table public.study_plans replica identity full;
end;
$$;
