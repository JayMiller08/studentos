import { addDays, differenceInCalendarDays, startOfWeek } from 'date-fns'
import { toDateKey } from '@/lib/utils'
import type { Quiz, QuizAttempt, XpLedgerEntry } from '@/types/models'

/**
 * Weekly quests: the catalogue, the rotation and the progress rules.
 *
 * The database is the authority (migration 00017): `quest_board()` counts
 * progress from rows only the server writes, and `claim_quest()` recounts it
 * before paying. This copy runs demo mode, and lets the UI explain a quest it
 * has never been told about. `quests-sql.test.ts` holds the two to the same
 * rows, the same rotation and the same thresholds.
 */

export type QuestMetric =
  | 'study_days'
  | 'pomodoros'
  | 'tasks'
  | 'habit_checkins'
  | 'submissions'
  | 'quiz_attempts'
  | 'quiz_score_80'
  | 'boss_defeated'
  | 'quiz_revised'
  | 'xp_earned'

export type QuestSlot = 0 | 1 | 2

export interface QuestDef {
  id: string
  slot: QuestSlot
  /** Its place in the slot's rotation. */
  ordinal: number
  title: string
  description: string
  metric: QuestMetric
  target: number
  reward: number
}

/** What each slot asks for. One quest a week from each. */
export const QUEST_SLOTS: Record<QuestSlot, { name: string; blurb: string }> = {
  0: { name: 'Show up', blurb: 'Consistency: days studied, focus finished.' },
  1: { name: 'Prove it', blurb: 'Knowledge: quizzes taken, passed and revised.' },
  2: { name: 'Keep moving', blurb: 'Progress: XP, tasks, habits and submissions.' },
}

export const QUEST_CATALOGUE: QuestDef[] = [
  { id: 'study-5-days', slot: 0, ordinal: 0, title: 'Study on 5 days', description: 'Any study counts: a focus session, a finished task or a quiz.', metric: 'study_days', target: 5, reward: 75 },
  { id: 'pomodoros-6', slot: 0, ordinal: 1, title: 'Finish 6 pomodoros', description: 'Full focus blocks, start to finish.', metric: 'pomodoros', target: 6, reward: 60 },
  { id: 'quizzes-3', slot: 1, ordinal: 0, title: 'Take 3 quizzes', description: 'Re-takes count. Revision is the point.', metric: 'quiz_attempts', target: 3, reward: 75 },
  { id: 'score-80', slot: 1, ordinal: 1, title: 'Score 80% on a quiz', description: 'Any quiz, any attempt this week.', metric: 'quiz_score_80', target: 1, reward: 60 },
  { id: 'boss-1', slot: 1, ordinal: 2, title: 'Beat a boss quiz', description: 'Score 80% or more on a boss quiz.', metric: 'boss_defeated', target: 1, reward: 100 },
  { id: 'revise-1', slot: 1, ordinal: 3, title: 'Revise an old quiz', description: 'Retake a quiz you last took a week or more ago.', metric: 'quiz_revised', target: 1, reward: 60 },
  // The title states the goal (XP earned this week); `reward` is the bonus on
  // top. "Earn 150 XP" beside "+50 XP" read as a promise of 150 — see 00019.
  { id: 'xp-150', slot: 2, ordinal: 0, title: 'Reach 150 XP this week', description: 'All XP you earn this week counts — quizzes, tasks, focus, habits, badges — except quest bonuses.', metric: 'xp_earned', target: 150, reward: 50 },
  { id: 'tasks-10', slot: 2, ordinal: 1, title: 'Complete 10 tasks', description: 'Ticked off in the planner.', metric: 'tasks', target: 10, reward: 40 },
  { id: 'habits-7', slot: 2, ordinal: 2, title: 'Make 7 habit check-ins', description: 'Across any of your habits.', metric: 'habit_checkins', target: 7, reward: 40 },
  { id: 'submit-1', slot: 2, ordinal: 3, title: 'Submit an assignment', description: 'Mark one as submitted.', metric: 'submissions', target: 1, reward: 50 },
]

/**
 * The slot whose quests need a quiz. A student with no quizzes and no way to
 * generate one is told how to get one, rather than shown a task they cannot do.
 */
export const QUIZ_SLOT: QuestSlot = 1

/** Mondays are counted from here. 2024-01-01 was one. */
const EPOCH = new Date(2024, 0, 1)

export interface QuestWeek {
  /** Monday 00:00, local. */
  start: Date
  /** The next Monday 00:00 — exclusive. */
  end: Date
  /** yyyy-MM-dd of the Monday: the week's half of a claim's ledger key. */
  key: string
  /** Mondays since 2024-01-01, which picks the week's quests. */
  index: number
}

export function questWeek(now: Date = new Date()): QuestWeek {
  const start = startOfWeek(now, { weekStartsOn: 1 })
  return {
    start,
    end: addDays(start, 7),
    key: toDateKey(start),
    // Calendar days, so a DST change inside the span cannot make it 6.96 weeks.
    index: Math.round(differenceInCalendarDays(start, EPOCH) / 7),
  }
}

/** The ordinal a slot shows in a given week: `week_index % pool size`, as quest_rotation() computes it. */
export function questRotation(slot: QuestSlot, weekIndex: number): number | null {
  const size = QUEST_CATALOGUE.filter((quest) => quest.slot === slot).length
  return size === 0 ? null : weekIndex % size
}

/** The three quests on a week's board, in slot order. */
export function questsForWeek(weekIndex: number): QuestDef[] {
  return QUEST_CATALOGUE.filter((quest) => quest.ordinal === questRotation(quest.slot, weekIndex)).sort(
    (a, b) => a.slot - b.slot,
  )
}

/**
 * Ledger events that make a day a study day: every activity that keeps the
 * streak (`advancesStreak` in ACTIVITY_RULES — quests.test.ts holds them
 * equal), plus a quiz's first pass.
 */
export const STUDY_EVENTS: ReadonlySet<string> = new Set([
  'task_completed',
  'pomodoro_completed',
  'study_session',
  'quiz_completed',
])

/** What the progress rules read: server-written rows only, never a client count. */
export interface QuestSignals {
  ledger: Pick<XpLedgerEntry, 'event' | 'amount' | 'created_at'>[]
  attempts: Pick<QuizAttempt, 'quiz_id' | 'score' | 'total' | 'submitted_at'>[]
  quizzes: Pick<Quiz, 'id' | 'kind'>[]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** score / total >= 0.8, in integers, as the SQL and quiz-grade's boss rule have it. */
function passes(attempt: Pick<QuizAttempt, 'score' | 'total'>): boolean {
  return attempt.total > 0 && attempt.score * 5 >= attempt.total * 4
}

/**
 * Progress on one metric during a week: quest_progress()'s twin.
 *
 * Every attempt is passed in, not only this week's, because "revise an old
 * quiz" needs to see the attempt before the one being counted.
 */
export function questProgress(metric: QuestMetric, signals: QuestSignals, week: Pick<QuestWeek, 'start' | 'end'>): number {
  const from = week.start.getTime()
  const to = week.end.getTime()
  const within = (iso: string) => {
    const at = Date.parse(iso)
    return at >= from && at < to
  }
  const ledger = signals.ledger.filter((row) => within(row.created_at))
  const attempts = signals.attempts.filter((attempt) => within(attempt.submitted_at))
  const events = (event: string) => ledger.filter((row) => row.event === event).length

  switch (metric) {
    case 'study_days': {
      const days = new Set<string>()
      for (const row of ledger) if (STUDY_EVENTS.has(row.event)) days.add(toDateKey(new Date(row.created_at)))
      for (const attempt of attempts) days.add(toDateKey(new Date(attempt.submitted_at)))
      return days.size
    }
    case 'pomodoros':
      return events('pomodoro_completed')
    case 'tasks':
      return events('task_completed')
    case 'habit_checkins':
      return events('habit_completed')
    case 'submissions':
      return events('assignment_submitted')
    case 'quiz_attempts':
      return attempts.length
    case 'quiz_score_80':
      return attempts.filter(passes).length
    case 'boss_defeated': {
      const bosses = new Set(signals.quizzes.filter((quiz) => quiz.kind === 'boss').map((quiz) => quiz.id))
      return attempts.filter((attempt) => bosses.has(attempt.quiz_id) && passes(attempt)).length
    }
    case 'quiz_revised':
      return attempts.filter((attempt) => {
        const at = Date.parse(attempt.submitted_at)
        const previous = signals.attempts
          .filter((other) => other.quiz_id === attempt.quiz_id && Date.parse(other.submitted_at) < at)
          .map((other) => Date.parse(other.submitted_at))
        return previous.length > 0 && Math.max(...previous) <= at - WEEK_MS
      }).length
    case 'xp_earned':
      // Quests themselves don't count toward an XP quest.
      return ledger.filter((row) => row.event !== 'quest_claimed').reduce((sum, row) => sum + row.amount, 0)
  }
}

/** Whole days left before the board resets, counting today. */
export function daysLeft(week: Pick<QuestWeek, 'end'>, now: Date = new Date()): number {
  return Math.max(1, differenceInCalendarDays(week.end, now))
}
