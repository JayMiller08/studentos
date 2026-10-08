import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface StatTileProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  label: string
  value: React.ReactNode
  icon?: LucideIcon
  /** A short qualifier under the value — "this week", "+3 since Monday". */
  hint?: string
  /** Tints the value and icon. Rewards use their own token, never `primary`. */
  tone?: 'default' | 'primary' | 'xp' | 'streak' | 'quest' | 'league' | 'success'
}

const TONES: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'text-foreground',
  primary: 'text-primary',
  xp: 'text-xp',
  streak: 'text-streak',
  quest: 'text-quest',
  league: 'text-league',
  success: 'text-success',
}

/**
 * One number, said once.
 *
 * The same tile markup was pasted into four pages with a `gap-1 py-4` override
 * each time; this is that pattern with a name, so the next one matches by
 * default rather than by memory.
 */
function StatTile({ label, value, icon: Icon, hint, tone = 'default', className, ...props }: StatTileProps) {
  return (
    <div
      data-slot="stat-tile"
      className={cn(
        'bg-card/60 flex flex-col gap-1 rounded-lg border p-3 text-center',
        className,
      )}
      {...props}
    >
      <span className="text-muted-foreground inline-flex items-center justify-center gap-1.5 text-xs">
        {Icon ? <Icon aria-hidden className={cn('size-3.5', TONES[tone])} /> : null}
        {label}
      </span>
      <span className={cn('text-xl font-semibold tabular-nums', TONES[tone])}>{value}</span>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  )
}

export { StatTile }
