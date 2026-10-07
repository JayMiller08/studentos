import { Flame, Snowflake } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StreakFlameProps {
  days: number
  /** Freezes held. Shown beside the flame so the safety net is visible. */
  freezes?: number
  /** True on the day a freeze is holding the streak open. */
  protectedToday?: boolean
  className?: string
}

/**
 * Day streak, with its safety net.
 *
 * The dashboard and achievements page each rendered their own version of this
 * row. Dormant streaks stay muted: a zero that glows like a win reads as noise.
 */
function StreakFlame({ days, freezes = 0, protectedToday = false, className }: StreakFlameProps) {
  const alive = days > 0

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
          alive
            ? 'border-streak/25 bg-streak/10 text-streak'
            : 'border-border bg-muted text-muted-foreground',
        )}
      >
        <Flame aria-hidden className="size-3.5" />
        <span className="tabular-nums">{days}</span>
        <span className="sr-only">day streak</span>
        <span aria-hidden>{days === 1 ? 'day' : 'days'}</span>
      </span>
      {freezes > 0 ? (
        <span
          className="border-league/25 bg-league/10 text-league inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium"
          title={
            protectedToday
              ? 'A freeze is holding your streak — study today to spend it'
              : `${freezes} streak freeze${freezes === 1 ? '' : 's'} — each covers one missed day`
          }
        >
          <Snowflake aria-hidden className="size-3.5" />
          <span className="tabular-nums">{freezes}</span>
          <span className="sr-only">streak {freezes === 1 ? 'freeze' : 'freezes'} held</span>
        </span>
      ) : null}
    </span>
  )
}

export { StreakFlame }
