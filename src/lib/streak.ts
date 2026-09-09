import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns'

/**
 * A profile's streak as of *now*, rather than as of the last time it was
 * written.
 *
 * `current_streak` is a stored counter that only ever moves when the user logs
 * activity (see `focusService.touchDailyStreak`). Nothing runs while they are
 * away, so a student who studied three days straight and then vanished for a
 * week still has `current_streak = 3` sitting in their row — and every screen
 * that read the column directly cheerfully reported a 3-day streak they had
 * long since lost.
 *
 * Deriving it on read fixes that everywhere at once, and needs no scheduled job
 * and no write: the stored counter is still the source of truth for *how long*
 * the run was, this just decides whether the run is still alive.
 *
 * A streak survives today not being logged yet — you have until the end of the
 * day to keep it — and dies once a whole day has passed unlogged, which is the
 * same rule `touchDailyStreak` applies when it decides to continue or restart.
 */
export function effectiveStreak(
  profile: { current_streak: number; last_active_date: string | null } | null | undefined,
  now: Date = new Date(),
): number {
  if (!profile || profile.current_streak <= 0 || !profile.last_active_date) return 0

  const lastActive = parseISO(profile.last_active_date)
  if (Number.isNaN(lastActive.getTime())) return 0

  // 0 = studied today, 1 = studied yesterday and today is still open.
  const daysSince = differenceInCalendarDays(startOfDay(now), startOfDay(lastActive))
  return daysSince <= 1 ? profile.current_streak : 0
}
