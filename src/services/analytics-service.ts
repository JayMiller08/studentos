import { parseISO } from 'date-fns'
import type { Assignment, Module, StudySession } from '@/types/models'

/**
 * Advanced analytics.
 *
 * Pure functions over data the app already collects — no extra tracking. Each
 * answers a question a student actually asks: where is my time going, is it
 * paying off in marks, and when in the day do I actually focus well?
 */

export interface ModulePerformance {
  moduleId: string
  name: string
  code: string | null
  color: string
  focusMinutes: number
  assignments: number
  graded: number
  /** Grade weighted by each assignment's contribution; null until something is graded. */
  averageGrade: number | null
  /** Minutes of focus per graded percentage point — lower is more efficient. */
  minutesPerPoint: number | null
}

/** Grade weighted by assignment weight, over assignments that have a grade. */
export function weightedAverageGrade(assignments: Assignment[]): number | null {
  const graded = assignments.filter((a) => a.grade !== null)
  if (graded.length === 0) return null
  // Fall back to an equal weighting when every weight is zero, so a set of
  // ungraded-weight assignments still reports an honest average.
  const totalWeight = graded.reduce((sum, a) => sum + a.weight, 0)
  if (totalWeight <= 0) {
    return Math.round(graded.reduce((sum, a) => sum + (a.grade ?? 0), 0) / graded.length)
  }
  const weighted = graded.reduce((sum, a) => sum + (a.grade ?? 0) * a.weight, 0)
  return Math.round(weighted / totalWeight)
}

/** Time invested and marks earned, per module — the "is this paying off?" view. */
export function computeModulePerformance(
  modules: Module[],
  assignments: Assignment[],
  sessions: StudySession[],
): ModulePerformance[] {
  const minutesByModule = new Map<string, number>()
  for (const session of sessions) {
    if (!session.module_id) continue
    minutesByModule.set(
      session.module_id,
      (minutesByModule.get(session.module_id) ?? 0) + session.minutes,
    )
  }

  return modules
    .map((module) => {
      const moduleAssignments = assignments.filter((a) => a.module_id === module.id)
      const graded = moduleAssignments.filter((a) => a.grade !== null)
      const averageGrade = weightedAverageGrade(moduleAssignments)
      const focusMinutes = minutesByModule.get(module.id) ?? 0
      return {
        moduleId: module.id,
        name: module.name,
        code: module.code,
        color: module.color,
        focusMinutes,
        assignments: moduleAssignments.length,
        graded: graded.length,
        averageGrade,
        minutesPerPoint:
          averageGrade !== null && averageGrade > 0 && focusMinutes > 0
            ? Math.round(focusMinutes / averageGrade)
            : null,
      }
    })
    .sort((a, b) => b.focusMinutes - a.focusMinutes)
}

export interface HourBucket {
  hour: number
  /** "07:00" — pre-formatted for chart axes. */
  label: string
  minutes: number
  sessions: number
}

/** Focus minutes bucketed by the hour a session started, 00:00–23:00. */
export function computeFocusByHour(sessions: StudySession[]): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    minutes: 0,
    sessions: 0,
  }))
  for (const session of sessions) {
    const hour = parseISO(session.started_at).getHours()
    const bucket = buckets[hour]
    if (!bucket) continue
    bucket.minutes += session.minutes
    bucket.sessions += 1
  }
  return buckets
}

export interface FocusWindow {
  startHour: number
  endHour: number
  minutes: number
  label: string
}

/**
 * The best consecutive `span`-hour stretch of the day by logged focus. Days do
 * not wrap — a window never runs past midnight, because advice to study from
 * 23:00 to 02:00 is not advice worth giving.
 */
export function bestFocusWindow(buckets: HourBucket[], span = 3): FocusWindow | null {
  if (buckets.length < span) return null
  let best: FocusWindow | null = null
  for (let start = 0; start + span <= buckets.length; start += 1) {
    const minutes = buckets
      .slice(start, start + span)
      .reduce((sum, bucket) => sum + bucket.minutes, 0)
    if (minutes > 0 && (!best || minutes > best.minutes)) {
      const endHour = start + span
      best = {
        startHour: start,
        endHour,
        minutes,
        label: `${String(start).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00`,
      }
    }
  }
  return best
}

export interface GradePoint {
  /** Assignment title, for the tooltip. */
  title: string
  /** ISO date the grade applies to (the due date). */
  date: string
  grade: number
  weight: number
  /** Weighted average of every grade up to and including this one. */
  runningAverage: number
}

/** Graded assignments oldest-first, with a running weighted average. */
export function computeGradeTrend(assignments: Assignment[]): GradePoint[] {
  const graded = assignments
    .filter((a) => a.grade !== null)
    .sort((a, b) => a.due_at.localeCompare(b.due_at))

  const seen: Assignment[] = []
  return graded.map((assignment) => {
    seen.push(assignment)
    return {
      title: assignment.title,
      date: assignment.due_at,
      grade: assignment.grade ?? 0,
      weight: assignment.weight,
      runningAverage: weightedAverageGrade(seen) ?? 0,
    }
  })
}

/**
 * Serialize rows to CSV. Values containing a comma, quote or newline are
 * quoted and their quotes doubled, per RFC 4180 — otherwise a module named
 * "Stats, Applied" would silently shift every later column.
 */
export function toCsv(rows: Array<Record<string, string | number | null>>): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]!)
  const escape = (value: string | number | null): string => {
    const text = value === null ? '' : String(value)
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escape(row[header] ?? null)).join(',')),
  ].join('\r\n')
}
