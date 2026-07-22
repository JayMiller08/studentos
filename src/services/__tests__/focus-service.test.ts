import { describe, expect, it } from 'vitest'
import { computeFocusStats } from '@/services/focus-service'
import type { StudySession } from '@/types/models'

const NOW = new Date('2026-07-23T18:00:00')

function session(startedAt: string, minutes: number, distractions = 0): StudySession {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    started_at: startedAt,
    ended_at: null,
    minutes,
    source: 'pomodoro',
    module_id: null,
    assignment_id: null,
    distractions,
    notes: null,
    created_at: startedAt,
    updated_at: startedAt,
  }
}

describe('computeFocusStats', () => {
  it('buckets minutes into today / week / month', () => {
    const stats = computeFocusStats(
      [
        session('2026-07-23T09:00:00', 50), // today (Thu)
        session('2026-07-21T09:00:00', 25), // same ISO week (Tue)
        session('2026-07-05T09:00:00', 100), // same month, previous week
        session('2026-06-01T09:00:00', 999), // previous month
      ],
      NOW,
    )
    expect(stats.todayMinutes).toBe(50)
    expect(stats.weekMinutes).toBe(75)
    expect(stats.monthMinutes).toBe(175)
  })

  it('computes current and longest streaks', () => {
    const stats = computeFocusStats(
      [
        session('2026-07-23T09:00:00', 25),
        session('2026-07-22T09:00:00', 25),
        session('2026-07-21T09:00:00', 25),
        // gap on the 20th
        session('2026-07-16T09:00:00', 25),
        session('2026-07-15T09:00:00', 25),
        session('2026-07-14T09:00:00', 25),
        session('2026-07-13T09:00:00', 25),
      ],
      NOW,
    )
    expect(stats.currentStreakDays).toBe(3)
    expect(stats.longestStreakDays).toBe(4)
  })

  it('lets the current streak survive an unlogged today', () => {
    const stats = computeFocusStats(
      [session('2026-07-22T09:00:00', 25), session('2026-07-21T09:00:00', 25)],
      NOW,
    )
    expect(stats.currentStreakDays).toBe(2)
  })

  it('totals distractions', () => {
    const stats = computeFocusStats(
      [session('2026-07-23T09:00:00', 25, 2), session('2026-07-22T09:00:00', 25, 3)],
      NOW,
    )
    expect(stats.totalDistractions).toBe(5)
  })
})
