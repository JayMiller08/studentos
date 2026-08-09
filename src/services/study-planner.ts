import { addDays, differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import { toDateKey } from '@/lib/utils'
import {
  type PriorityOptions,
  rankAssignments,
  type ScoredAssignment,
} from '@/services/priority-engine'
import type { Assignment, StudyBlock, StudyPlanDay } from '@/types/models'

/**
 * AI study planner.
 *
 * Deterministic, explainable scheduling on top of the priority engine:
 *  - earliest-deadline-first with priority-score tie-breaking
 *  - work is chunked into 25–90 minute focus blocks
 *  - each assignment's remaining minutes are spread across the days before
 *    its deadline (never after), respecting a daily capacity
 *  - break guidance follows the 25/5 rhythm the Focus Center uses
 *
 * The generated plan is a *proposal*: applying it materializes planner tasks
 * the student can still move around.
 */

// The block/day shapes are persisted verbatim by saved plans, so they live in
// `types/models` with the rest of the stored shapes and are re-exported here
// where the engine that produces them is.
export type { StudyBlock, StudyPlanDay }

export interface StudyPlan {
  days: StudyPlanDay[]
  unscheduledMinutes: number
  recommendations: string[]
}

export interface StudyPlanOptions extends PriorityOptions {
  /** Number of days to plan, starting today. Default 7. */
  horizonDays?: number
  /** Focused minutes available per day. Default 180. */
  dailyCapacityMinutes?: number
}

const MIN_BLOCK = 25
const MAX_BLOCK = 90

interface WorkItem {
  assignment: ScoredAssignment
  remainingMinutes: number
}

function chunkFor(remaining: number, capacityLeft: number): number {
  const size = Math.min(MAX_BLOCK, remaining, capacityLeft)
  if (size < MIN_BLOCK) {
    // Don't create sub-25m crumbs unless that's all that's left of the work.
    return remaining <= capacityLeft && remaining < MIN_BLOCK ? remaining : 0
  }
  return size
}

export function generateStudyPlan(
  assignments: Assignment[],
  options: StudyPlanOptions = {},
): StudyPlan {
  const now = options.now ?? new Date()
  const horizonDays = options.horizonDays ?? 7
  const capacity = options.dailyCapacityMinutes ?? 180

  const ranked = rankAssignments(
    assignments.filter((a) => a.status === 'not_started' || a.status === 'in_progress'),
    options,
  )

  const work: WorkItem[] = ranked
    .map((assignment) => ({
      assignment,
      remainingMinutes: assignment.priority_score.remainingMinutes,
    }))
    .filter((item) => item.remainingMinutes > 0)

  const days: StudyPlanDay[] = []
  const today = startOfDay(now)

  for (let dayIndex = 0; dayIndex < horizonDays; dayIndex += 1) {
    const day = addDays(today, dayIndex)
    const blocks: StudyBlock[] = []
    let capacityLeft = capacity

    // Candidates: still has work, and the deadline hasn't passed before this
    // day (overdue work is only ever scheduled today — catch-up, not fiction).
    const candidates = () =>
      work
        .filter((item) => item.remainingMinutes > 0)
        .filter((item) => {
          const due = startOfDay(parseISO(item.assignment.due_at))
          return due >= day || dayIndex === 0
        })
        .sort((a, b) => {
          const dueDiff =
            differenceInCalendarDays(parseISO(a.assignment.due_at), day) -
            differenceInCalendarDays(parseISO(b.assignment.due_at), day)
          if (dueDiff !== 0) return dueDiff
          return b.assignment.priority_score.score - a.assignment.priority_score.score
        })

    while (capacityLeft >= MIN_BLOCK) {
      const next = candidates()[0]
      if (!next) break
      const minutes = chunkFor(next.remainingMinutes, capacityLeft)
      if (minutes === 0) break
      next.remainingMinutes -= minutes
      capacityLeft -= minutes

      const lastBlock = blocks[blocks.length - 1]
      if (lastBlock && lastBlock.assignmentId === next.assignment.id) {
        lastBlock.minutes += minutes // merge consecutive chunks of the same work
      } else {
        blocks.push({
          assignmentId: next.assignment.id,
          title: next.assignment.title,
          moduleId: next.assignment.module_id,
          minutes,
          reason: next.assignment.priority_score.reason,
        })
      }
    }

    const totalMinutes = blocks.reduce((sum, block) => sum + block.minutes, 0)
    days.push({
      dateKey: toDateKey(day),
      totalMinutes,
      blocks,
      heavy: totalMinutes > capacity * 0.8,
    })
  }

  const unscheduledMinutes = work.reduce((sum, item) => sum + item.remainingMinutes, 0)

  const recommendations: string[] = []
  const firstDay = days[0]
  if (firstDay && firstDay.totalMinutes === 0) {
    recommendations.push('Nothing urgent today — bank progress on next week or recharge.')
  }
  if (unscheduledMinutes > 0) {
    recommendations.push(
      `About ${Math.round(unscheduledMinutes / 60)}h of work doesn't fit this week at your current daily capacity. Increase daily focus time or start earlier.`,
    )
  }
  const heavyDays = days.filter((day) => day.heavy).length
  if (heavyDays >= 3) {
    recommendations.push(
      `${heavyDays} heavy days ahead — protect your sleep and plan meals in advance.`,
    )
  }
  const overdue = ranked.filter((a) => a.priority_score.daysRemaining < 0)
  if (overdue.length > 0) {
    recommendations.push(
      `${overdue.length} overdue assignment${overdue.length === 1 ? ' is' : 's are'} scheduled first today — contact your lecturer if an extension is possible.`,
    )
  }
  recommendations.push('Work in 25–90 minute blocks with 5-minute breaks; take 15 minutes after every 4 blocks.')

  return { days, unscheduledMinutes, recommendations }
}

/** Smallest and largest a hand-edited block may be, matching the generator. */
export const BLOCK_MINUTE_BOUNDS = { min: MIN_BLOCK, max: MAX_BLOCK } as const

/**
 * Rebuild a day's derived fields after its blocks were edited by hand.
 *
 * The generator proposes and the student decides, so once blocks are dropped
 * or resized `totalMinutes` and `heavy` have to be recomputed — otherwise a
 * saved plan carries totals that no longer describe its own schedule.
 */
export function reconcileDay(
  day: StudyPlanDay,
  blocks: StudyBlock[],
  dailyCapacityMinutes: number,
): StudyPlanDay {
  const totalMinutes = blocks.reduce((sum, block) => sum + block.minutes, 0)
  return { ...day, blocks, totalMinutes, heavy: totalMinutes > dailyCapacityMinutes * 0.8 }
}

/** Clamp a hand-edited block length into the range the engine schedules in. */
export function clampBlockMinutes(minutes: number): number {
  return Math.min(MAX_BLOCK, Math.max(MIN_BLOCK, Math.round(minutes)))
}
