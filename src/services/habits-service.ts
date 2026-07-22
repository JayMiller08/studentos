import { differenceInCalendarDays, parseISO, subDays } from 'date-fns'
import { toDateKey, todayKey } from '@/lib/utils'
import { byUser, table } from '@/services/db'
import type { Habit, HabitCadence, HabitLog } from '@/types/models'

const habits = () => table<Habit>('habits')
const habitLogs = () => table<HabitLog>('habit_logs')

export interface HabitInput {
  name: string
  emoji?: string
  color?: string
  cadence?: HabitCadence
  target_count?: number
  reminder_time?: string | null
}

export const habitsService = {
  async list(userId: string): Promise<Habit[]> {
    return habits().list({
      filters: byUser(userId, [{ column: 'archived', op: 'eq', value: false }]),
      orderBy: { column: 'sort_order', ascending: true },
    })
  },

  async create(userId: string, input: HabitInput): Promise<Habit> {
    return habits().insert({
      user_id: userId,
      name: input.name,
      emoji: input.emoji ?? '✅',
      color: input.color ?? '#2563eb',
      cadence: input.cadence ?? 'daily',
      target_count: input.target_count ?? 1,
      reminder_time: input.reminder_time ?? null,
      archived: false,
      sort_order: 0,
    })
  },

  async update(id: string, patch: Partial<HabitInput> & { archived?: boolean }): Promise<Habit> {
    return habits().update(id, patch)
  },

  async remove(id: string): Promise<void> {
    return habits().remove(id)
  },

  async listLogs(userId: string, fromKey: string, toKey: string): Promise<HabitLog[]> {
    return habitLogs().list({
      filters: byUser(userId, [
        { column: 'log_date', op: 'gte', value: fromKey },
        { column: 'log_date', op: 'lte', value: toKey },
      ]),
    })
  },

  /** Toggle a habit's completion for a day. Returns true when now completed. */
  async toggleLog(userId: string, habitId: string, dateKey: string): Promise<boolean> {
    const existing = await habitLogs().list({
      filters: byUser(userId, [
        { column: 'habit_id', op: 'eq', value: habitId },
        { column: 'log_date', op: 'eq', value: dateKey },
      ]),
      limit: 1,
    })
    const first = existing[0]
    if (first) {
      await habitLogs().remove(first.id)
      return false
    }
    await habitLogs().insert({ user_id: userId, habit_id: habitId, log_date: dateKey, count: 1 })
    return true
  },
}

// ── Pure stats helpers ─────────────────────────────────────────────────────

/** Consecutive-day streak for a daily habit (today may still be pending). */
export function dailyStreak(logDates: Set<string>, now = new Date()): number {
  let cursor = now
  if (!logDates.has(toDateKey(cursor))) cursor = subDays(cursor, 1)
  let streak = 0
  while (logDates.has(toDateKey(cursor))) {
    streak += 1
    cursor = subDays(cursor, 1)
  }
  return streak
}

/** Completion rate over the trailing `days` window (daily habits). */
export function completionRate(
  logDates: Set<string>,
  habitCreatedAt: string,
  days: number,
  now = new Date(),
): number {
  const habitAgeDays = differenceInCalendarDays(now, parseISO(habitCreatedAt)) + 1
  const window = Math.max(1, Math.min(days, habitAgeDays))
  let hits = 0
  for (let i = 0; i < window; i += 1) {
    if (logDates.has(toDateKey(subDays(now, i)))) hits += 1
  }
  return Math.round((hits / window) * 100)
}

/** True when the habit met its target within the current cadence period. */
export function completedThisPeriod(
  habit: Habit,
  logs: HabitLog[],
  now = new Date(),
): { count: number; done: boolean } {
  const today = todayKey()
  let relevant: HabitLog[]
  if (habit.cadence === 'daily') {
    relevant = logs.filter((log) => log.habit_id === habit.id && log.log_date === today)
  } else if (habit.cadence === 'weekly') {
    const weekStart = toDateKey(subDays(now, (now.getDay() + 6) % 7))
    relevant = logs.filter((log) => log.habit_id === habit.id && log.log_date >= weekStart)
  } else {
    const monthPrefix = today.slice(0, 7)
    relevant = logs.filter(
      (log) => log.habit_id === habit.id && log.log_date.startsWith(monthPrefix),
    )
  }
  const count = relevant.reduce((sum, log) => sum + log.count, 0)
  return { count, done: count >= habit.target_count }
}
