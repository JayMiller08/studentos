import { describe, expect, it } from 'vitest'
import { completionRate, dailyStreak } from '@/services/habits-service'

const NOW = new Date('2026-07-23T20:00:00')

describe('dailyStreak', () => {
  it('counts consecutive days ending today', () => {
    const dates = new Set(['2026-07-23', '2026-07-22', '2026-07-21'])
    expect(dailyStreak(dates, NOW)).toBe(3)
  })

  it('allows today to be pending (streak from yesterday)', () => {
    const dates = new Set(['2026-07-22', '2026-07-21'])
    expect(dailyStreak(dates, NOW)).toBe(2)
  })

  it('is zero when the last log is 2+ days old', () => {
    const dates = new Set(['2026-07-20', '2026-07-19'])
    expect(dailyStreak(dates, NOW)).toBe(0)
  })
})

describe('completionRate', () => {
  it('computes rate over the window, capped by habit age', () => {
    const dates = new Set(['2026-07-23', '2026-07-22', '2026-07-20'])
    // Habit created 5 days ago → window is min(30, 5) = 5 days; 3 hits.
    const rate = completionRate(dates, '2026-07-19T00:00:00', 30, NOW)
    expect(rate).toBe(60)
  })

  it('returns 100 when every day in a short window is hit', () => {
    const dates = new Set(['2026-07-23', '2026-07-22'])
    const rate = completionRate(dates, '2026-07-22T00:00:00', 30, NOW)
    expect(rate).toBe(100)
  })
})
