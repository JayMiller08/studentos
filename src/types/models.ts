/**
 * Domain models. These mirror the PostgreSQL schema in
 * supabase/migrations — every table row shape used by the app lives here.
 * (In CI these can be cross-checked against `supabase gen types`.)
 */

import type { StreakAdvance } from '@/lib/streak'

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
  study_reminders: boolean
  email_digest: boolean
  push_enabled: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  assignments: true,
  exams: true,
  habits: true,
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
  /**
   * Streak freezes held (0–2). Optional because the column exists only where
   * migration 00011 ran; `heldFreezes` reads its absence as "freezes off", so
   * nothing ever writes it to a database that would reject it.
   */
  streak_freezes?: number
  onboarding_completed: boolean
  /**
   * @deprecated Superseded by `tours_seen`; read only to migrate legacy rows.
   * Optional because the column exists only where migration 00006 ran — never
   * write it.
   */
  tour_completed?: boolean
  /** Ids of the per-page tours this user has finished or skipped. */
  tours_seen: string[]
  /** Show the one-off pointer at the replay control (existing users only). */
  tour_replay_hint: boolean
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

// Budget was removed in the gamification revamp. The `budgets`, `transactions`
// and `goals` tables are still in the database, unread, pending an export.

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
  /** `manual` covers demo-mode and admin-granted plans. */
  provider: 'stripe' | 'paystack' | 'manual'
  provider_customer_id: string | null
  provider_subscription_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

// ── AI ───────────────────────────────────────────────────────────────────

// The AI Coach chat was removed in the gamification revamp. Its
// `ai_conversations` and `ai_messages` tables remain, unread, pending an export.

/**
 * One scheduled stretch of work on a study plan. Produced by
 * `services/study-planner`; lives here because saved plans persist it verbatim
 * into `study_plans.days`.
 */
export interface StudyBlock {
  assignmentId: string
  title: string
  moduleId: string | null
  minutes: number
  /** Why this block is here, e.g. "Due in 2 days · score 82". */
  reason: string
}

export interface StudyPlanDay {
  dateKey: string
  totalMinutes: number
  blocks: StudyBlock[]
  /** True when the day exceeds 80% of capacity — suggest lighter habits. */
  heavy: boolean
}

/**
 * A study plan a student chose to keep.
 *
 * The schedule is a JSONB snapshot: it is always read and written whole and
 * never queried across, so normalizing it would buy nothing. The three
 * generating inputs are real columns because those are what a student edits
 * and re-runs.
 */
export interface SavedStudyPlan extends UserOwnedRow {
  name: string
  horizon_days: number
  daily_capacity_minutes: number
  /** 0–100, matching the page's slider (the engine takes 0–1). */
  stress_level: number
  days: StudyPlanDay[]
  recommendations: string[]
  unscheduled_minutes: number
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

// ── Quizzes ──────────────────────────────────────────────────────────────

export type QuizSource = 'ai' | 'note' | 'manual'
export type QuizKind = 'practice' | 'boss'
export type QuizDifficulty = 'easy' | 'mixed' | 'exam'

export interface Quiz extends UserOwnedRow {
  module_id: string | null
  title: string
  source: QuizSource
  kind: QuizKind
  question_count: number
  /** The library file it was written from (migration 00018). */
  resource_id?: string | null
  /** The note it was written from (migration 00018). */
  note_id?: string | null
}

// ── Study library (migration 00018) ──────────────────────────────────────

export type StudyResourceKind = 'pdf' | 'photos'
/** `uploaded` until resource-outline has read it. */
export type StudyResourceStatus = 'uploaded' | 'reading' | 'ready' | 'failed'

export interface OutlineTopic {
  name: string
  /** e.g. "3–7"; photo numbers for photos. */
  pages: string | null
  summary: string | null
}

/** A file in the student's study library: one PDF, or up to ten photos of notes. */
export interface StudyResource extends UserOwnedRow {
  module_id: string | null
  title: string
  kind: StudyResourceKind
  /** `<user id>/<uuid>.<ext>` in the private study-resources bucket. */
  storage_paths: string[]
  size_bytes: number
  status: StudyResourceStatus
  page_count: number | null
  outline: OutlineTopic[]
  summary: string | null
  error: string | null
}

export type QuizGenerationStatus = 'queued' | 'reading' | 'writing' | 'checking' | 'done' | 'failed'

/** A quiz being written, in the background, by quiz-generate. */
export interface QuizGeneration extends UserOwnedRow {
  resource_id: string | null
  note_id: string | null
  title: string
  status: QuizGenerationStatus
  options: { count?: number; difficulty?: QuizDifficulty; kind?: QuizKind; topics?: string[] }
  quiz_id: string | null
  error: string | null
}

/** One AI call on the student's meter. Written only by Edge Functions. */
export interface AiUsage extends UserOwnedRow {
  kind: 'quiz' | 'outline'
  source_id: string | null
  /** False for a quiz that failed: it is not counted against the month. */
  charged: boolean
}

/**
 * A question as the runner sees it.
 *
 * Read from the `quiz_questions_public` view, which exists precisely because
 * this shape has no `correct_index` and no `explanation`. The answer key is
 * only ever returned by `quiz-grade`, after the attempt is submitted.
 */
export interface QuizQuestion {
  id: string
  quiz_id: string
  ordinal: number
  prompt: string
  options: string[]
  created_at: string
}

export interface QuizAttempt extends UserOwnedRow {
  quiz_id: string
  score: number
  total: number
  duration_seconds: number
  xp_awarded: number
  submitted_at: string
}

/** One question's outcome, as returned by the grading function. */
export interface GradedAnswer {
  questionId: string
  chosenIndex: number | null
  correctIndex: number
  correct: boolean
  explanation: string | null
}

export interface QuizResult {
  attemptId: string
  score: number
  total: number
  xpAwarded: number
  totalXp: number | null
  level: number | null
  defeatedBoss: boolean
  answers: GradedAnswer[]
  /**
   * What the attempt did to the daily streak — a quiz counts as studying.
   * Null when the day was already counted; absent from a quiz-grade deployed
   * before streaks moved server-side.
   */
  streak?: StreakAdvance | null
}

/** A row in the XP audit trail. Written only by `award_xp`. */
export interface XpLedgerEntry extends BaseRow {
  user_id: string
  event: string
  source_id: string
  amount: number
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
