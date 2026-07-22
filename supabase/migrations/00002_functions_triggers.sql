-- ============================================================================
-- StudentOS — functions & triggers
-- ============================================================================

-- Keep updated_at accurate on every table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
    group by table_name
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()',
      t.table_name
    );
  end loop;
end;
$$;

-- Auto-provision a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, timezone)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'UTC'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin check used by RLS policies. SECURITY DEFINER avoids recursive RLS on
-- profiles; STABLE lets the planner cache it per-statement.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from anon;

-- Seed the badge catalog (idempotent).
insert into public.badges (id, name, description, emoji, xp_reward) values
  ('first-assignment',   'Off the Blocks',    'Create your first assignment',                 '📝', 50),
  ('first-submission',   'Shipped It',        'Mark your first assignment as submitted',      '🚀', 100),
  ('first-pomodoro',     'Deep Diver',        'Complete your first Pomodoro focus session',   '🍅', 50),
  ('focus-10h',          'Focus Apprentice',  'Log 10 hours of focused study',                '⏱️', 150),
  ('focus-50h',          'Focus Master',      'Log 50 hours of focused study',                '🧠', 400),
  ('streak-7',           'One Week Wonder',   'Keep a 7-day study streak',                    '🔥', 200),
  ('streak-30',          'Unstoppable',       'Keep a 30-day study streak',                   '🌋', 600),
  ('habit-builder',      'Habit Builder',     'Complete a habit 21 times',                    '🌱', 200),
  ('budget-boss',        'Budget Boss',       'Stay under budget for a full month',           '💰', 250),
  ('note-taker',         'Scribe',            'Write 10 notes',                               '📚', 100),
  ('early-bird',         'Early Bird',        'Finish an assignment 3+ days before due date', '🐦', 150),
  ('level-5',            'Rising Star',       'Reach level 5',                                '⭐', 0),
  ('level-10',           'Campus Legend',     'Reach level 10',                               '🏆', 0)
on conflict (id) do nothing;

-- Default feature flags (idempotent).
insert into public.feature_flags (key, enabled, description) values
  ('ai_coach',        true,  'AI study coach chat'),
  ('leaderboards',    false, 'Opt-in leaderboards (privacy-reviewed rollout)'),
  ('career_tools',    false, 'Student Elite career dashboard'),
  ('push_reminders',  true,  'Web push notification delivery')
on conflict (key) do nothing;
