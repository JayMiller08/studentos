-- ============================================================================
-- StudentOS — Row Level Security
-- Deny-by-default: RLS is enabled on every table; access is granted only via
-- the policies below. The browser anon key can do nothing outside them.
-- ============================================================================

-- Helper macro pattern: user-owned tables get identical CRUD-own policies.
do $$
declare
  t text;
begin
  foreach t in array array[
    'semesters', 'courses', 'modules', 'assignments', 'tasks', 'calendar_events',
    'study_sessions', 'pomodoro_sessions', 'habits', 'habit_logs', 'budgets',
    'transactions', 'goals', 'note_folders', 'notes', 'note_versions', 'files',
    'notifications', 'ai_conversations', 'ai_messages', 'achievements',
    'analytics_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s_select_own" on public.%1$I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_insert_own" on public.%1$I for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_update_own" on public.%1$I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy "%1$s_delete_own" on public.%1$I for delete using (auth.uid() = user_id)', t);
  end loop;
end;
$$;

-- ── profiles: own row + admin read ─────────────────────────────────────────
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- privilege escalation guard: users cannot grant themselves admin or a paid plan
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and plan = (select p.plan from public.profiles p where p.id = auth.uid())
  );

create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ── subscriptions: read-only for owners; written by service role (webhooks) ─
alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id or public.is_admin());

-- ── reference/catalog tables: readable by all signed-in users ──────────────
alter table public.universities enable row level security;
alter table public.degrees enable row level security;
alter table public.badges enable row level security;
alter table public.feature_flags enable row level security;
alter table public.announcements enable row level security;

create policy "universities_read" on public.universities
  for select using (auth.role() = 'authenticated');
create policy "degrees_read" on public.degrees
  for select using (auth.role() = 'authenticated');
create policy "badges_read" on public.badges
  for select using (auth.role() = 'authenticated');
create policy "feature_flags_read" on public.feature_flags
  for select using (auth.role() = 'authenticated');

create policy "announcements_read_published" on public.announcements
  for select using (
    public.is_admin()
    or (published_at is not null and published_at <= now()
        and (expires_at is null or expires_at > now()))
  );

-- Admin management of catalog/admin tables.
create policy "universities_admin_write" on public.universities
  for all using (public.is_admin()) with check (public.is_admin());
create policy "degrees_admin_write" on public.degrees
  for all using (public.is_admin()) with check (public.is_admin());
create policy "badges_admin_write" on public.badges
  for all using (public.is_admin()) with check (public.is_admin());
create policy "feature_flags_admin_write" on public.feature_flags
  for all using (public.is_admin()) with check (public.is_admin());
create policy "announcements_admin_write" on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

-- ── support tickets: owner CRUD + admin triage ──────────────────────────────
alter table public.support_tickets enable row level security;

create policy "support_tickets_select" on public.support_tickets
  for select using (auth.uid() = user_id or public.is_admin());
create policy "support_tickets_insert_own" on public.support_tickets
  for insert with check (auth.uid() = user_id);
create policy "support_tickets_update" on public.support_tickets
  for update using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());
create policy "support_tickets_delete_own" on public.support_tickets
  for delete using (auth.uid() = user_id);

-- ── admin read access for oversight dashboards ─────────────────────────────
create policy "analytics_events_admin_read" on public.analytics_events
  for select using (public.is_admin());
