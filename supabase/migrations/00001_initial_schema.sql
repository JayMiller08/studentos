-- ============================================================================
-- StudentOS — initial schema
-- Conventions:
--   * uuid primary keys (gen_random_uuid)
--   * created_at / updated_at on every table (updated_at maintained by trigger)
--   * user-owned rows carry user_id -> auth.users ON DELETE CASCADE
--   * soft reference cascades: deleting a module keeps assignments (SET NULL)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ── Reference data ──────────────────────────────────────────────────────────

create table public.universities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  country     text,
  domain      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.degrees (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid references public.universities(id) on delete cascade,
  name          text not null,
  level         text check (level in ('bachelor', 'master', 'doctorate', 'diploma', 'other')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index degrees_university_id_idx on public.degrees (university_id);

-- ── Profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text,
  avatar_url           text,
  university           text,
  degree               text,
  semester             int check (semester between 1 and 24),
  timezone             text not null default 'UTC',
  goals                text[] not null default '{}',
  role                 text not null default 'student' check (role in ('student', 'admin')),
  plan                 text not null default 'free' check (plan in ('free', 'pro', 'elite')),
  xp                   int not null default 0 check (xp >= 0),
  level                int not null default 1 check (level >= 1),
  current_streak       int not null default 0,
  longest_streak       int not null default 0,
  last_active_date     date,
  onboarding_completed boolean not null default false,
  notification_prefs   jsonb not null default '{"assignments":true,"exams":true,"habits":true,"budget":true,"study_reminders":true,"email_digest":false,"push_enabled":false}'::jsonb,
  language             text not null default 'en',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── Academic structure ──────────────────────────────────────────────────────

create table public.semesters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint semesters_dates_valid check (ends_on >= starts_on)
);
create index semesters_user_id_idx on public.semesters (user_id);

create table public.courses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  code       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courses_user_id_idx on public.courses (user_id);

create table public.modules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  semester_id uuid references public.semesters(id) on delete set null,
  course_id   uuid references public.courses(id) on delete set null,
  code        text,
  name        text not null,
  color       text not null default '#2563eb',
  credits     int check (credits >= 0),
  instructor  text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index modules_user_id_idx on public.modules (user_id);
create index modules_semester_id_idx on public.modules (semester_id);

-- ── Assignments ─────────────────────────────────────────────────────────────

create table public.assignments (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  module_id         uuid references public.modules(id) on delete set null,
  title             text not null,
  description       text,
  due_at            timestamptz not null,
  priority          text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  weight            numeric(5,2) not null default 0 check (weight >= 0 and weight <= 100),
  estimated_minutes int not null default 60 check (estimated_minutes > 0),
  difficulty        int not null default 3 check (difficulty between 1 and 5),
  status            text not null default 'not_started' check (status in ('not_started', 'in_progress', 'submitted', 'graded')),
  progress          int not null default 0 check (progress between 0 and 100),
  grade             numeric(5,2) check (grade >= 0 and grade <= 100),
  submission_url    text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index assignments_user_id_idx on public.assignments (user_id);
create index assignments_user_due_idx on public.assignments (user_id, due_at);
create index assignments_module_id_idx on public.assignments (module_id);

-- ── Planner tasks ───────────────────────────────────────────────────────────

create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  title               text not null,
  notes               text,
  scheduled_on        date,
  start_minutes       int check (start_minutes between 0 and 1439),
  duration_minutes    int check (duration_minutes > 0),
  priority            text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status              text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  estimated_minutes   int check (estimated_minutes > 0),
  completed_at        timestamptz,
  assignment_id       uuid references public.assignments(id) on delete cascade,
  module_id           uuid references public.modules(id) on delete set null,
  recurrence          jsonb,
  recurring_parent_id uuid references public.tasks(id) on delete cascade,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_user_scheduled_idx on public.tasks (user_id, scheduled_on);
create index tasks_assignment_id_idx on public.tasks (assignment_id);

-- ── Calendar ────────────────────────────────────────────────────────────────

create table public.calendar_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null,
  description   text,
  event_type    text not null default 'event' check (event_type in ('class', 'exam', 'event', 'study_block', 'deadline')),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  all_day       boolean not null default false,
  location      text,
  color         text,
  module_id     uuid references public.modules(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete cascade,
  recurrence    jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint calendar_events_range_valid check (ends_at >= starts_at)
);
create index calendar_events_user_id_idx on public.calendar_events (user_id);
create index calendar_events_user_start_idx on public.calendar_events (user_id, starts_at);

-- ── Focus & study time ──────────────────────────────────────────────────────

create table public.study_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  minutes       int not null default 0 check (minutes >= 0),
  source        text not null default 'pomodoro' check (source in ('pomodoro', 'deep_work', 'manual')),
  module_id     uuid references public.modules(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  distractions  int not null default 0 check (distractions >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index study_sessions_user_id_idx on public.study_sessions (user_id);
create index study_sessions_user_started_idx on public.study_sessions (user_id, started_at);

create table public.pomodoro_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  study_session_id uuid references public.study_sessions(id) on delete set null,
  kind             text not null check (kind in ('focus', 'short_break', 'long_break')),
  planned_minutes  int not null check (planned_minutes > 0),
  actual_minutes   int not null default 0 check (actual_minutes >= 0),
  completed        boolean not null default false,
  started_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index pomodoro_sessions_user_id_idx on public.pomodoro_sessions (user_id);
create index pomodoro_sessions_user_started_idx on public.pomodoro_sessions (user_id, started_at);

-- ── Habits ──────────────────────────────────────────────────────────────────

create table public.habits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  emoji         text not null default '✅',
  color         text not null default '#2563eb',
  cadence       text not null default 'daily' check (cadence in ('daily', 'weekly', 'monthly')),
  target_count  int not null default 1 check (target_count > 0),
  reminder_time time,
  archived      boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index habits_user_id_idx on public.habits (user_id);

create table public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  log_date   date not null,
  count      int not null default 1 check (count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, log_date)
);
create index habit_logs_user_id_idx on public.habit_logs (user_id);
create index habit_logs_user_date_idx on public.habit_logs (user_id, log_date);

-- ── Budget ──────────────────────────────────────────────────────────────────

create table public.budgets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  month          date not null, -- first day of month
  currency       text not null default 'USD',
  planned_income numeric(12,2) not null default 0,
  spending_limit numeric(12,2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, month)
);
create index budgets_user_id_idx on public.budgets (user_id);

create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  budget_month date not null,
  type         text not null check (type in ('income', 'expense')),
  amount       numeric(12,2) not null check (amount > 0),
  category     text not null default 'other',
  note         text,
  occurred_on  date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_user_month_idx on public.transactions (user_id, budget_month);

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  saved_amount  numeric(12,2) not null default 0 check (saved_amount >= 0),
  deadline      date,
  achieved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index goals_user_id_idx on public.goals (user_id);

-- ── Notes ───────────────────────────────────────────────────────────────────

create table public.note_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index note_folders_user_id_idx on public.note_folders (user_id);

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  folder_id  uuid references public.note_folders(id) on delete set null,
  title      text not null default 'Untitled',
  content_md text not null default '',
  tags       text[] not null default '{}',
  pinned     boolean not null default false,
  module_id  uuid references public.modules(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_id_idx on public.notes (user_id);
create index notes_folder_id_idx on public.notes (folder_id);
create index notes_tags_idx on public.notes using gin (tags);

create table public.note_versions (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid not null references public.notes(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  content_md text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index note_versions_note_id_idx on public.note_versions (note_id);

-- ── Files ───────────────────────────────────────────────────────────────────

create table public.files (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  bucket      text not null,
  path        text not null,
  name        text not null,
  size_bytes  bigint not null default 0,
  mime_type   text not null default 'application/octet-stream',
  entity_type text check (entity_type in ('assignment', 'note', 'profile')),
  entity_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (bucket, path)
);
create index files_user_id_idx on public.files (user_id);
create index files_entity_idx on public.files (entity_type, entity_id);

-- ── Notifications ───────────────────────────────────────────────────────────

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('assignment_due', 'exam', 'habit', 'budget', 'study', 'achievement', 'system')),
  title         text not null,
  body          text,
  action_url    text,
  read_at       timestamptz,
  scheduled_for timestamptz,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index notifications_user_id_idx on public.notifications (user_id);
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

-- ── Billing ─────────────────────────────────────────────────────────────────

create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  plan                     text not null check (plan in ('free', 'pro', 'elite')),
  status                   text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete')),
  provider                 text not null default 'stripe' check (provider in ('stripe', 'manual')),
  provider_customer_id     text,
  provider_subscription_id text unique,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions (user_id);

-- ── AI ──────────────────────────────────────────────────────────────────────

create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'New conversation',
  mode       text not null default 'coach' check (mode in ('coach', 'quiz', 'flashcards', 'summary', 'essay', 'code')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_id_idx on public.ai_conversations (user_id);

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index ai_messages_conversation_id_idx on public.ai_messages (conversation_id);

-- ── Gamification ────────────────────────────────────────────────────────────

create table public.badges (
  id          text primary key, -- stable slug, e.g. 'first-assignment'
  name        text not null,
  description text not null,
  emoji       text not null default '🏅',
  xp_reward   int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.achievements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  badge_id    text not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, badge_id)
);
create index achievements_user_id_idx on public.achievements (user_id);

-- ── Analytics & admin ───────────────────────────────────────────────────────

create table public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index analytics_events_user_id_idx on public.analytics_events (user_id);
create index analytics_events_name_idx on public.analytics_events (name, created_at);

create table public.feature_flags (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  enabled     boolean not null default false,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  level        text not null default 'info' check (level in ('info', 'warning', 'critical')),
  published_at timestamptz,
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  subject     text not null,
  body        text not null,
  status      text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_notes text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index support_tickets_user_id_idx on public.support_tickets (user_id);
create index support_tickets_status_idx on public.support_tickets (status);
