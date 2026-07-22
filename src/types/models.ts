/**
 * Domain models. These mirror the PostgreSQL schema in
 * supabase/migrations — every table row shape used by the app lives here.
 * (In CI these can be cross-checked against `supabase gen types`.)
 */

// ── Shared primitives ────────────────────────────────────────────────────

export interface BaseRow {
  id: string
  created_at: string
  updated_at: string
}

export interface UserOwnedRow extends BaseRow {
  user_id: string
}

export type Plan = 'free' | 'pro' | 'elite'
export type Role = 'student' | 'admin'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high', 'urgent']

// ── Profile & settings ───────────────────────────────────────────────────

export interface NotificationPrefs {
  assignments: boolean
  exams: boolean
  habits: boolean
  budget: boolean
  study_reminders: boolean
  email_digest: boolean
  push_enabled: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  assignments: true,
  exams: true,
  habits: true,
  budget: true,
  study_reminders: true,
  email_digest: false,
  push_enabled: false,
}

export interface Profile extends BaseRow {
  /** Equals the auth user id. */
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  university: string | null
  degree: string | null
  semester: number | null
  timezone: string
  goals: string[]
  role: Role
  plan: Plan
  xp: number
  level: number
  current_streak: number
  longest_streak: number
  last_active_date: string | null
  onboarding_completed: boolean
  notification_prefs: NotificationPrefs
  language: string
}

// ── Academic structure ───────────────────────────────────────────────────

export interface Semester extends UserOwnedRow {
  name: string
  starts_on: string
  ends_on: string
  is_current: boolean
}

export interface Module extends UserOwnedRow {
  semester_id: string | null
  code: string | null
  name: string
  color: string
  credits: number | null
  instructor: string | null
  archived: boolean
}

export type AssignmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'graded'

export interface Assignment extends UserOwnedRow {
  module_id: string | null
  title: string
  description: string | null
  due_at: string
  priority: Priority
  /** Contribution to final grade, 0–100. */
  weight: number
  estimated_minutes: number
  /** Perceived difficulty 1–5. */
  difficulty: number
  status: AssignmentStatus
  /** 0–100. */
  progress: number
  grade: number | null
  submission_url: string | null
  notes: string | null
}

// ── Planner & calendar ───────────────────────────────────────────────────

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface TaskRecurrence {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  /** 0 (Sun) – 6 (Sat); weekly only. */
  weekdays?: number[]
}

export interface Task extends UserOwnedRow {
  title: string
  notes: string | null
  /** Day the task is planned for ('yyyy-MM-dd'); null = backlog. */
  scheduled_on: string | null
  /** Optional time block within the day, minutes from midnight. */
  start_minutes: number | null
  duration_minutes: number | null
  priority: Priority
  status: TaskStatus
  estimated_minutes: number | null
  completed_at: string | null
  assignment_id: string | null
  module_id: string | null
  recurrence: TaskRecurrence | null
  /** For instances generated from a recurring template. */
  recurring_parent_id: string | null
  sort_order: number
}

export type CalendarEventType = 'class' | 'exam' | 'event' | 'study_block' | 'deadline'

export interface CalendarEvent extends UserOwnedRow {
  title: string
  description: string | null
  event_type: CalendarEventType
  starts_at: string
  ends_at: string
  all_day: boolean
  location: string | null
  color: string | null
  module_id: string | null
  assignment_id: string | null
  recurrence: TaskRecurrence | null
}

// ── Focus ────────────────────────────────────────────────────────────────

export type StudySessionSource = 'pomodoro' | 'deep_work' | 'manual'

export interface StudySession extends UserOwnedRow {
  started_at: string
  ended_at: string | null
  minutes: number
  source: StudySessionSource
  module_id: string | null
  assignment_id: string | null
  distractions: number
  notes: string | null
}

export interface PomodoroSession extends UserOwnedRow {
  study_session_id: string | null
  kind: 'focus' | 'short_break' | 'long_break'
  planned_minutes: number
  actual_minutes: number
  completed: boolean
  started_at: string
}

// ── Habits ───────────────────────────────────────────────────────────────

export type HabitCadence = 'daily' | 'weekly' | 'monthly'

export interface Habit extends UserOwnedRow {
  name: string
  emoji: string
  color: string
  cadence: HabitCadence
  /** Times per cadence period considered "complete". */
  target_count: number
  reminder_time: string | null
  archived: boolean
  sort_order: number
}

export interface HabitLog extends UserOwnedRow {
  habit_id: string
  /** 'yyyy-MM-dd' local day of the log. */
  log_date: string
  count: number
}

// ── Budget ───────────────────────────────────────────────────────────────

export type TransactionType = 'income' | 'expense'

export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'housing',
  'books',
  'tuition',
  'entertainment',
  'health',
  'subscriptions',
  'other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Budget extends UserOwnedRow {
  /** First day of the month, 'yyyy-MM-01'. */
  month: string
  currency: string
  planned_income: number
  spending_limit: number
}

export interface Transaction extends UserOwnedRow {
  budget_month: string
  type: TransactionType
  amount: number
  category: string
  note: string | null
  occurred_on: string
}

export interface Goal extends UserOwnedRow {
  name: string
  target_amount: number
  saved_amount: number
  deadline: string | null
  achieved_at: string | null
}

// ── Notes ────────────────────────────────────────────────────────────────

export interface NoteFolder extends UserOwnedRow {
  name: string
  sort_order: number
}

export interface Note extends UserOwnedRow {
  folder_id: string | null
  title: string
  content_md: string
  tags: string[]
  pinned: boolean
  module_id: string | null
}

export interface NoteVersion extends BaseRow {
  note_id: string
  user_id: string
  title: string
  content_md: string
}

// ── Files ────────────────────────────────────────────────────────────────

export interface FileObject extends UserOwnedRow {
  bucket: string
  path: string
  name: string
  size_bytes: number
  mime_type: string
  entity_type: 'assignment' | 'note' | 'profile' | null
  entity_id: string | null
}

// ── Notifications ────────────────────────────────────────────────────────

export type NotificationKind =
  | 'assignment_due'
  | 'exam'
  | 'habit'
  | 'budget'
  | 'study'
  | 'achievement'
  | 'system'

export interface AppNotification extends UserOwnedRow {
  kind: NotificationKind
  title: string
  body: string | null
  action_url: string | null
  read_at: string | null
  scheduled_for: string | null
  sent_at: string | null
}

// ── Billing ──────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete'

export interface Subscription extends UserOwnedRow {
  plan: Plan
  status: SubscriptionStatus
  provider: 'stripe' | 'manual'
  provider_customer_id: string | null
  provider_subscription_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

// ── AI ───────────────────────────────────────────────────────────────────

export interface AIConversation extends UserOwnedRow {
  title: string
  mode: 'coach' | 'quiz' | 'flashcards' | 'summary' | 'essay' | 'code'
}

export interface AIMessage extends BaseRow {
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
}

// ── Gamification ─────────────────────────────────────────────────────────

export interface BadgeDef {
  id: string
  name: string
  description: string
  emoji: string
  xp_reward: number
}

export interface Achievement extends UserOwnedRow {
  badge_id: string
  unlocked_at: string
}

// ── Analytics & admin ────────────────────────────────────────────────────

export interface AnalyticsEvent extends UserOwnedRow {
  name: string
  properties: Record<string, unknown>
}

export interface FeatureFlag extends BaseRow {
  key: string
  enabled: boolean
  description: string | null
}

export interface Announcement extends BaseRow {
  title: string
  body: string
  level: 'info' | 'warning' | 'critical'
  published_at: string | null
  expires_at: string | null
}

export interface SupportTicket extends UserOwnedRow {
  subject: string
  body: string
  status: 'open' | 'in_progress' | 'resolved'
  admin_notes: string | null
}
