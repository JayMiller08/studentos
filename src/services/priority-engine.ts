import { differenceInMinutes, parseISO } from 'date-fns'
import { clamp } from '@/lib/utils'
import type { Assignment, Priority } from '@/types/models'

/**
 * StudentOS prioritization engine.
 *
 * Every active assignment gets a dynamic 0–100 score built from transparent,
 * explainable factors — no black box:
 *
 *   urgency     (35%)  how close the deadline is relative to work remaining
 *   weight      (20%)  contribution to the final grade
 *   effort      (15%)  remaining study time (bigger jobs need starting earlier)
 *   difficulty  (10%)  perceived difficulty amplifies early starts
 *   declared    (10%)  the user's own priority label
 *   momentum    (10%)  barely-started work outranks nearly-done work
 *
 * A user-level `stressLevel` (0–1) skews the blend: stressed users get more
 * urgency-driven ordering; relaxed users get more weight/effort balance.
 */

export interface PriorityFactors {
  urgency: number
  weight: number
  effort: number
  difficulty: number
  declared: number
  momentum: number
}

export interface PriorityScore {
  score: number
  band: 'critical' | 'high' | 'medium' | 'low'
  factors: PriorityFactors
  /** Human explanation, e.g. "Due tomorrow · worth 30% · ~4h left". */
  reason: string
  remainingMinutes: number
  daysRemaining: number
}

export type ScoredAssignment = Assignment & { priority_score: PriorityScore }

const DECLARED_WEIGHT: Record<Priority, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  urgent: 1,
}

export interface PriorityOptions {
  /** 0 (calm) – 1 (exam-panic). Default 0.5. */
  stressLevel?: number
  now?: Date
}

export function remainingWorkMinutes(assignment: Assignment): number {
  return Math.max(0, Math.round(assignment.estimated_minutes * (1 - assignment.progress / 100)))
}

function urgencyFrom(daysRemaining: number, remainingMinutes: number): number {
  if (daysRemaining <= 0) return 1
  // Slack = time available minus a realistic 2h/day working allowance for
  // this assignment. Negative slack (can't finish at that pace) → urgent.
  const capacityMinutes = daysRemaining * 120
  const slackRatio = (capacityMinutes - remainingMinutes) / Math.max(capacityMinutes, 1)
  const deadlinePressure = Math.exp(-daysRemaining / 5) // 1 today → ~0.14 in 10 days
  return clamp(0.6 * deadlinePressure + 0.4 * (1 - clamp(slackRatio, 0, 1)), 0, 1)
}

export function scoreAssignment(assignment: Assignment, options: PriorityOptions = {}): PriorityScore {
  const now = options.now ?? new Date()
  const stress = clamp(options.stressLevel ?? 0.5, 0, 1)

  const minutesToDue = differenceInMinutes(parseISO(assignment.due_at), now)
  const daysRemaining = minutesToDue / (60 * 24)
  const remaining = remainingWorkMinutes(assignment)

  const factors: PriorityFactors = {
    urgency: urgencyFrom(daysRemaining, remaining),
    weight: clamp(assignment.weight / 100, 0, 1),
    effort: clamp(remaining / 600, 0, 1), // 10h+ of work saturates
    difficulty: (clamp(assignment.difficulty, 1, 5) - 1) / 4,
    declared: DECLARED_WEIGHT[assignment.priority],
    momentum: 1 - assignment.progress / 100,
  }

  // Stress shifts blend toward urgency and away from long-horizon factors.
  const urgencyBlend = 0.35 + 0.15 * (stress - 0.5) * 2 // 0.20 … 0.50
  const weightBlend = 0.2 - 0.05 * (stress - 0.5) * 2
  const blend =
    urgencyBlend * factors.urgency +
    weightBlend * factors.weight +
    0.15 * factors.effort +
    0.1 * factors.difficulty +
    0.1 * factors.declared +
    0.1 * factors.momentum
  const normalizer = urgencyBlend + weightBlend + 0.45

  const score = Math.round(clamp(blend / normalizer, 0, 1) * 100)
  const band = score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 35 ? 'medium' : 'low'

  const dueLabel =
    daysRemaining <= 0
      ? 'Overdue'
      : daysRemaining < 1
        ? 'Due today'
        : daysRemaining < 2
          ? 'Due tomorrow'
          : `Due in ${Math.ceil(daysRemaining)} days`
  const hours = Math.round((remaining / 60) * 10) / 10
  const reason = `${dueLabel} · worth ${assignment.weight}% · ~${hours}h left`

  return {
    score,
    band,
    factors,
    reason,
    remainingMinutes: remaining,
    daysRemaining: Math.floor(daysRemaining),
  }
}

/** Active assignments sorted by descending priority score. */
export function rankAssignments(
  assignments: Assignment[],
  options: PriorityOptions = {},
): ScoredAssignment[] {
  return assignments
    .map((assignment) => ({
      ...assignment,
      priority_score: scoreAssignment(assignment, options),
    }))
    .sort((a, b) => b.priority_score.score - a.priority_score.score)
}
