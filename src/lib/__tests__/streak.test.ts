import { describe, expect, it } from 'vitest'
import { effectiveStreak } from '@/lib/streak'

// A Wednesday evening.
const NOW = new Date(2026, 8, 9, 18, 0, 0)

function profile(currentStreak: number, lastActive: string | null) {
  return { current_streak: currentStreak, last_active_date: lastActive }
}

describe('effectiveStreak', () => {
  it('keeps the streak when today is already logged', () => {
    expect(effectiveStreak(profile(3, '2026-09-09'), NOW)).toBe(3)
  })

  it('keeps the streak when the last activity was yesterday', () => {
    // The day is not over — the student can still keep the run alive.
    expect(effectiveStreak(profile(3, '2026-09-08'), NOW)).toBe(3)
  })

  it('drops the streak once a full day has been missed', () => {
    expect(effectiveStreak(profile(3, '2026-09-07'), NOW)).toBe(0)
  })

  it('drops a streak left behind a week ago', () => {
    // The reported bug: three days logged, then a week away, still "3-day streak".
    expect(effectiveStreak(profile(3, '2026-09-02'), NOW)).toBe(0)
  })

  it('reports nothing for a user who has never been active', () => {
    expect(effectiveStreak(profile(0, null), NOW)).toBe(0)
  })

  it('ignores a stored count with no activity date to anchor it', () => {
    expect(effectiveStreak(profile(5, null), NOW)).toBe(0)
  })

  it('survives a missing or malformed profile', () => {
    expect(effectiveStreak(null, NOW)).toBe(0)
    expect(effectiveStreak(undefined, NOW)).toBe(0)
    expect(effectiveStreak(profile(5, 'not-a-date'), NOW)).toBe(0)
  })

  it('does not punish a clock that is behind the stored date', () => {
    // Travelling east can put `last_active_date` a day "ahead" of the device.
    expect(effectiveStreak(profile(4, '2026-09-10'), NOW)).toBe(4)
  })

  it('is unaffected by the time of day', () => {
    const justAfterMidnight = new Date(2026, 8, 9, 0, 1, 0)
    expect(effectiveStreak(profile(3, '2026-09-08'), justAfterMidnight)).toBe(3)
    const almostMidnight = new Date(2026, 8, 9, 23, 59, 0)
    expect(effectiveStreak(profile(3, '2026-09-08'), almostMidnight)).toBe(3)
  })
})
