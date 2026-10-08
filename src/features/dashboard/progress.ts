import { BADGES } from '@/services/gamification-service'
import { scoreOf } from '@/services/quiz-service'
import type { Achievement, BadgeDef, QuizAttempt } from '@/types/models'

/**
 * What the dashboard says about a student's standing, derived once.
 *
 * Kept free of React so the rules — which attempts count, what a trend is,
 * which badges are "latest" — are tested directly rather than through a
 * rendered page.
 */

/** Attempts the headline average is taken over: recent enough to move. */
export const QUIZ_WINDOW = 5

export interface QuizStanding {
  /** Mean score over the latest window, or null before the first attempt. */
  average: number | null
  best: number | null
  attempts: number
  /**
   * Points the latest window moved against the one before it. Null until
   * there are two windows to compare, because a trend from one data point is
   * a claim, not a measurement.
   */
  trend: number | null
}

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

export function quizStanding(attempts: QuizAttempt[]): QuizStanding {
  if (attempts.length === 0) return { average: null, best: null, attempts: 0, trend: null }
  // Newest first, whatever order the caller had them in.
  const ordered = [...attempts].sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
  const scores = ordered.map(scoreOf)
  const recent = scores.slice(0, QUIZ_WINDOW)
  const previous = scores.slice(QUIZ_WINDOW, QUIZ_WINDOW * 2)
  const average = Math.round(mean(recent))
  return {
    average,
    best: Math.max(...scores),
    attempts: attempts.length,
    trend: previous.length > 0 ? average - Math.round(mean(previous)) : null,
  }
}

export interface BadgeProgress {
  unlocked: number
  total: number
  /** Most recently earned first. */
  latest: BadgeDef[]
}

export function badgeProgress(
  achievements: Pick<Achievement, 'badge_id' | 'unlocked_at'>[],
  catalog: BadgeDef[] = BADGES,
): BadgeProgress {
  const byId = new Map(catalog.map((badge) => [badge.id, badge]))
  // Only badges still in the catalogue count: a retired badge (budget-boss)
  // must not inflate "3 / 12" into "4 / 12".
  const earned = achievements
    .filter((achievement) => byId.has(achievement.badge_id))
    .sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at))
  const unique = [...new Map(earned.map((achievement) => [achievement.badge_id, achievement])).values()]
  return {
    unlocked: unique.length,
    total: catalog.length,
    latest: unique.slice(0, 3).map((achievement) => byId.get(achievement.badge_id)!),
  }
}
