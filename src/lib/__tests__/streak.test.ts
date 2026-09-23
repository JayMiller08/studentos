import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — the app tsconfig excludes Node types.
import migration from '../../../supabase/migrations/00011_streak_freezes.sql?raw'
import grant from '../../../supabase/migrations/00013_streak_freeze_grant.sql?raw'
import {
  advanceStreak,
  effectiveStreak,
  heldFreezes,
  isStreakProtected,
  MAX_STREAK_FREEZES,
  STARTING_STREAK_FREEZES,
  STREAK_FREEZE_EVERY_DAYS,
} from '@/lib/streak'

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

function withFreezes(currentStreak: number, lastActive: string | null, freezes?: number) {
  return {
    current_streak: currentStreak,
    longest_streak: currentStreak,
    last_active_date: lastActive,
    ...(freezes === undefined ? {} : { streak_freezes: freezes }),
  }
}

// NOW is Wednesday the 9th, so a last-active date of the 7th means Tuesday the
// 8th was missed, and the 6th means two days were.
describe('a streak freeze on the day after a missed day', () => {
  it('holds the streak open when a freeze is available', () => {
    expect(effectiveStreak(withFreezes(5, '2026-09-07', 1), NOW)).toBe(5)
    expect(isStreakProtected(withFreezes(5, '2026-09-07', 1), NOW)).toBe(true)
  })

  it('lets the streak lapse with no freeze to spend', () => {
    expect(effectiveStreak(withFreezes(5, '2026-09-07', 0), NOW)).toBe(0)
    expect(isStreakProtected(withFreezes(5, '2026-09-07', 0), NOW)).toBe(false)
  })

  it('never covers two missed days, however many freezes are held', () => {
    expect(effectiveStreak(withFreezes(5, '2026-09-06', 2), NOW)).toBe(0)
    expect(isStreakProtected(withFreezes(5, '2026-09-06', 2), NOW)).toBe(false)
  })

  it('is not in play while the streak is simply alive', () => {
    expect(isStreakProtected(withFreezes(5, '2026-09-08', 1), NOW)).toBe(false)
  })

  it('has nothing to protect without a streak', () => {
    expect(isStreakProtected(withFreezes(0, '2026-09-07', 2), NOW)).toBe(false)
  })

  it('treats a database without the column as having no freezes', () => {
    expect(heldFreezes(withFreezes(5, '2026-09-07'))).toBeNull()
    expect(effectiveStreak(withFreezes(5, '2026-09-07'), NOW)).toBe(0)
  })
})

describe('advanceStreak', () => {
  it('continues a streak from yesterday', () => {
    const advance = advanceStreak(withFreezes(4, '2026-09-08', 0), NOW)
    expect(advance?.patch).toMatchObject({ current_streak: 5, last_active_date: '2026-09-09' })
    expect(advance?.usedFreeze).toBe(false)
  })

  it('spends a freeze to cover exactly one missed day', () => {
    const advance = advanceStreak(withFreezes(4, '2026-09-07', 1), NOW)
    // 5, not 6: the frozen day keeps the streak alive but doesn't count toward it.
    expect(advance?.patch).toMatchObject({ current_streak: 5, streak_freezes: 0 })
    expect(advance?.usedFreeze).toBe(true)
  })

  it('restarts after one missed day with no freeze', () => {
    const advance = advanceStreak(withFreezes(4, '2026-09-07', 0), NOW)
    expect(advance?.patch.current_streak).toBe(1)
    expect(advance?.usedFreeze).toBe(false)
  })

  it('restarts after two missed days and keeps the freezes it could not use', () => {
    const advance = advanceStreak(withFreezes(4, '2026-09-06', 2), NOW)
    expect(advance?.patch).toMatchObject({ current_streak: 1, streak_freezes: 2 })
    expect(advance?.usedFreeze).toBe(false)
  })

  it('starts a first streak at 1', () => {
    expect(advanceStreak(withFreezes(0, null, 0), NOW)?.patch.current_streak).toBe(1)
  })

  it('writes nothing for a second activity the same day', () => {
    expect(advanceStreak(withFreezes(4, '2026-09-09', 1), NOW)).toBeNull()
  })

  it('writes nothing when the stored day is ahead of this device', () => {
    // Resetting the streak, or moving the date backwards, over a clock
    // difference would both be wrong.
    expect(advanceStreak(withFreezes(4, '2026-09-10', 1), NOW)).toBeNull()
  })

  it(`earns a freeze every ${STREAK_FREEZE_EVERY_DAYS} days`, () => {
    const seventh = advanceStreak(withFreezes(6, '2026-09-08', 0), NOW)
    expect(seventh?.patch).toMatchObject({ current_streak: 7, streak_freezes: 1 })
    expect(seventh?.earnedFreeze).toBe(true)

    const fourteenth = advanceStreak(withFreezes(13, '2026-09-08', 1), NOW)
    expect(fourteenth?.patch).toMatchObject({ current_streak: 14, streak_freezes: 2 })
    expect(fourteenth?.earnedFreeze).toBe(true)
  })

  it(`holds no more than ${MAX_STREAK_FREEZES}`, () => {
    const advance = advanceStreak(withFreezes(13, '2026-09-08', MAX_STREAK_FREEZES), NOW)
    expect(advance?.patch.streak_freezes).toBe(MAX_STREAK_FREEZES)
    expect(advance?.earnedFreeze).toBe(false)
  })

  it('does not earn between milestones', () => {
    expect(advanceStreak(withFreezes(7, '2026-09-08', 1), NOW)?.earnedFreeze).toBe(false)
  })

  it('can spend a freeze and earn one back on the same day', () => {
    const advance = advanceStreak(withFreezes(6, '2026-09-07', 1), NOW)
    expect(advance?.patch).toMatchObject({ current_streak: 7, streak_freezes: 1 })
    expect(advance?.usedFreeze).toBe(true)
    expect(advance?.earnedFreeze).toBe(true)
  })

  it('keeps the longest streak', () => {
    const behind = { current_streak: 3, longest_streak: 10, last_active_date: '2026-09-08' }
    expect(advanceStreak(behind, NOW)?.patch.longest_streak).toBe(10)
    const record = { current_streak: 10, longest_streak: 10, last_active_date: '2026-09-08' }
    expect(advanceStreak(record, NOW)?.patch.longest_streak).toBe(11)
  })

  it('never names the column where the database does not have it', () => {
    // PostgREST rejects an update naming a missing column, which would fail the
    // whole streak write — every study session would stop counting.
    const continuing = advanceStreak(withFreezes(4, '2026-09-08'), NOW)
    expect(continuing).not.toBeNull()
    expect(Object.keys(continuing!.patch)).not.toContain('streak_freezes')

    const lapsed = advanceStreak(withFreezes(4, '2026-09-07'), NOW)
    expect(lapsed?.patch.current_streak).toBe(1)
    expect(Object.keys(lapsed!.patch)).not.toContain('streak_freezes')
  })
})

describe('heldFreezes', () => {
  it('clamps a count outside the allowed range', () => {
    // Profiles are client-writable, so the stored number is not to be trusted.
    expect(heldFreezes({ streak_freezes: 50 })).toBe(MAX_STREAK_FREEZES)
    expect(heldFreezes({ streak_freezes: -3 })).toBe(0)
  })
})

describe('the freeze every student starts with', () => {
  it('saves a young streak from a single missed day', () => {
    // The reported bug: five days in, one day missed, and the streak went back
    // to 1 — because the first freeze was only earned at seven days in a row,
    // so nobody had one when they needed it.
    const advance = advanceStreak(
      {
        current_streak: 5,
        longest_streak: 5,
        last_active_date: '2026-09-07',
        streak_freezes: STARTING_STREAK_FREEZES,
      },
      NOW,
    )
    expect(advance?.usedFreeze).toBe(true)
    expect(advance?.patch.current_streak).toBe(6)
    expect(advance?.patch.streak_freezes).toBe(0)
  })

  it('is spent once, not an endless pass', () => {
    const spent = advanceStreak(
      { current_streak: 6, longest_streak: 6, last_active_date: '2026-09-07', streak_freezes: 0 },
      NOW,
    )
    expect(spent?.patch.current_streak).toBe(1)
  })
})

describe('the rules the release notes promise', () => {
  it('starts with one, earns one every 7 days, holds up to 2', () => {
    expect(STARTING_STREAK_FREEZES).toBe(1)
    expect(STREAK_FREEZE_EVERY_DAYS).toBe(7)
    expect(MAX_STREAK_FREEZES).toBe(2)
  })
})

describe('migration 00013', () => {
  const sql = grant.replace(/\s+/g, ' ')

  it('starts new profiles with a freeze', () => {
    expect(sql).toMatch(/alter column streak_freezes set default 1/i)
  })

  it('tops up the students who were left holding none', () => {
    expect(sql).toMatch(/update public\.profiles set streak_freezes = 1 where streak_freezes < 1/i)
  })
})

describe('migration 00011', () => {
  it('adds the column idempotently, with none held by default', () => {
    expect(migration).toMatch(/add column if not exists streak_freezes int not null default 0/i)
  })

  it('has no check constraint that could fail a streak write', () => {
    expect(migration).not.toMatch(/\bcheck\s*\(/i)
  })
})
