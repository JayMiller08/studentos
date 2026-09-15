import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'
import { toDateKey } from '@/lib/utils'

/** A streak freeze is earned for every this many days in a row. */
export const STREAK_FREEZE_EVERY_DAYS = 7

/** The most streak freezes a student can hold at once. */
export const MAX_STREAK_FREEZES = 2

/** The profile fields the streak rules read. */
export interface StreakProfile {
  current_streak: number
  longest_streak: number
  last_active_date: string | null
  /**
   * Freezes held. Absent where the database predates migration 00011, which is
   * not the same thing as holding none — see `heldFreezes`.
   */
  streak_freezes?: number
}

type StreakReadable = Pick<StreakProfile, 'current_streak' | 'last_active_date' | 'streak_freezes'>

/**
 * Freezes the student holds, or `null` when this database cannot store them.
 *
 * The difference matters for writes. `profiles.streak_freezes` only exists once
 * migration 00011 has run, and PostgREST rejects an update that names a column
 * it doesn't have — which here would take the whole streak write down with it,
 * so study sessions would silently stop counting. A row without the field
 * therefore means "freezes are off", and nothing that writes the streak mentions
 * the column until the database has it.
 *
 * Clamped, because profiles are client-writable and the stored count is not
 * something to trust.
 */
export function heldFreezes(profile: Pick<StreakProfile, 'streak_freezes'>): number | null {
  const value = profile.streak_freezes
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(MAX_STREAK_FREEZES, Math.max(0, Math.floor(value)))
}

/** Whole calendar days from the last active day to `now`, or null if there is none. */
function daysSinceActive(profile: Pick<StreakProfile, 'last_active_date'>, now: Date): number | null {
  if (!profile.last_active_date) return null
  const lastActive = parseISO(profile.last_active_date)
  if (Number.isNaN(lastActive.getTime())) return null
  return differenceInCalendarDays(startOfDay(now), startOfDay(lastActive))
}

/**
 * Whether a streak freeze is holding the streak open today.
 *
 * True on the day after a single missed day, for a student with a freeze to
 * spend: yesterday went unlogged, but studying today keeps the streak. Never
 * true after two missed days — a freeze covers one skipped day, not a run of
 * them, however many the student is holding.
 */
export function isStreakProtected(
  profile: StreakReadable | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile || profile.current_streak <= 0) return false
  return daysSinceActive(profile, now) === 2 && (heldFreezes(profile) ?? 0) > 0
}

/**
 * A profile's streak as of *now*, rather than as of the last time it was
 * written.
 *
 * `current_streak` is a stored counter that only ever moves when the user logs
 * activity (see `advanceStreak`). Nothing runs while they are away, so a
 * student who studied three days straight and then vanished for a week still
 * has `current_streak = 3` sitting in their row — and every screen that read
 * the column directly cheerfully reported a 3-day streak they had long since
 * lost.
 *
 * Deriving it on read fixes that everywhere at once, and needs no scheduled job
 * and no write: the stored counter is still the source of truth for *how long*
 * the run was, this just decides whether the run is still alive.
 *
 * A streak survives today not being logged yet — you have until the end of the
 * day to keep it — and dies once a whole day has passed unlogged, unless a
 * streak freeze is covering that one day (see `isStreakProtected`). That is the
 * same rule `advanceStreak` applies when it decides to continue or restart.
 */
export function effectiveStreak(
  profile: StreakReadable | null | undefined,
  now: Date = new Date(),
): number {
  if (!profile || profile.current_streak <= 0) return 0
  const daysSince = daysSinceActive(profile, now)
  if (daysSince === null) return 0
  // 0 = studied today, 1 = studied yesterday and today is still open.
  if (daysSince <= 1) return profile.current_streak
  return isStreakProtected(profile, now) ? profile.current_streak : 0
}

/** What recording a day's activity does to the streak. */
export interface StreakAdvance {
  /** The profile fields to write. */
  patch: {
    current_streak: number
    longest_streak: number
    last_active_date: string
    streak_freezes?: number
  }
  /** A freeze was spent covering the missed day. */
  usedFreeze: boolean
  /** Reaching a multiple of STREAK_FREEZE_EVERY_DAYS earned one. */
  earnedFreeze: boolean
}

/**
 * Record activity on `now`'s day: continue the streak, rescue it, or restart it.
 *
 * - Active yesterday: the streak continues.
 * - Missed exactly one day, holding a freeze: the freeze is spent and the streak
 *   continues. The frozen day keeps the streak alive but doesn't add to it.
 * - Anything else — two or more missed days, or one with no freeze — restarts
 *   the streak at 1.
 *
 * Returns null when there is nothing to write because the day is already
 * counted. That includes a last-active date *ahead* of this device's clock,
 * such as after flying west: moving the date backwards, or resetting a streak
 * over a clock difference, would both be wrong.
 */
export function advanceStreak(profile: StreakProfile, now: Date = new Date()): StreakAdvance | null {
  const daysSince = daysSinceActive(profile, now)
  if (daysSince !== null && daysSince <= 0) return null

  const current = Math.max(0, profile.current_streak)
  const freezes = heldFreezes(profile)

  let next = 1
  let usedFreeze = false
  if (daysSince === 1) {
    next = current + 1
  } else if (daysSince === 2 && current > 0 && freezes !== null && freezes > 0) {
    next = current + 1
    usedFreeze = true
  }

  let nextFreezes = freezes
  let earnedFreeze = false
  if (nextFreezes !== null) {
    if (usedFreeze) nextFreezes -= 1
    if (next % STREAK_FREEZE_EVERY_DAYS === 0 && nextFreezes < MAX_STREAK_FREEZES) {
      nextFreezes += 1
      earnedFreeze = true
    }
  }

  return {
    patch: {
      current_streak: next,
      longest_streak: Math.max(profile.longest_streak, next),
      last_active_date: toDateKey(now),
      ...(nextFreezes === null ? {} : { streak_freezes: nextFreezes }),
    },
    usedFreeze,
    earnedFreeze,
  }
}
