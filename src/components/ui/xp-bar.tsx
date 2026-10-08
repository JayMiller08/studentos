import type * as React from 'react'
import { cn } from '@/lib/utils'
import { AnimatedNumber } from '@/components/ui/animated-number'

export interface XpBarProps extends React.ComponentProps<'div'> {
  level: number
  /** XP earned inside the current level. */
  current: number
  /** XP the current level spans. */
  needed: number
  /** Hides the numeric row — for tight spots like the header. */
  compact?: boolean
}

/**
 * Progress through the current level.
 *
 * Its own bar rather than the generic `Progress`, because XP has a fixed
 * meaning here: the fill is always the XP token, never the navigation blue, so
 * a student learns the colour means "you earned something". The gradient stays
 * inside that one hue — it ran amber into the streak red, which meant a bar
 * about to level up looked like a warning.
 */
function XpBar({ level, current, needed, compact = false, className, ...props }: XpBarProps) {
  const safeNeeded = Math.max(1, needed)
  const percent = Math.min(100, Math.max(0, Math.round((current / safeNeeded) * 100)))

  return (
    <div data-slot="xp-bar" className={cn('flex flex-col gap-1.5', className)} {...props}>
      {compact ? null : (
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">Level {level}</span>
          <span className="text-muted-foreground tabular-nums">
            <AnimatedNumber value={current} className="text-xp font-medium" /> / {safeNeeded} XP
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level ${level} progress`}
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="from-xp/80 to-xp h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-emphasis"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export { XpBar }
