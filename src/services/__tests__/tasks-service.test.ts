import { describe, expect, it } from 'vitest'
import { nextOccurrence } from '@/services/tasks-service'

describe('nextOccurrence', () => {
  it('advances daily by the interval', () => {
    expect(nextOccurrence('2026-07-23', { freq: 'daily', interval: 1 })).toBe('2026-07-24')
    expect(nextOccurrence('2026-07-23', { freq: 'daily', interval: 3 })).toBe('2026-07-26')
  })

  it('advances monthly', () => {
    expect(nextOccurrence('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28')
  })

  it('finds the next listed weekday', () => {
    // 2026-07-23 is a Thursday (4). Next Mon/Wed from there is Mon 27th.
    expect(
      nextOccurrence('2026-07-23', { freq: 'weekly', interval: 1, weekdays: [1, 3] }),
    ).toBe('2026-07-27')
    // From Monday, next listed day is Wednesday same week.
    expect(
      nextOccurrence('2026-07-27', { freq: 'weekly', interval: 1, weekdays: [1, 3] }),
    ).toBe('2026-07-29')
  })

  it('defaults weekly to the same weekday next week', () => {
    expect(nextOccurrence('2026-07-23', { freq: 'weekly', interval: 1 })).toBe('2026-07-30')
  })
})
