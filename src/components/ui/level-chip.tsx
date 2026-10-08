import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface LevelChipProps {
  level: number
  /** Percent through the current level, 0–100. Drawn as a ring around the chip. */
  percent?: number
  to?: string
  className?: string
}

/**
 * The level badge in the app header.
 *
 * Was written inline in the layout; it is the most-seen piece of the
 * gamification layer, so it earns a component — and a progress ring, which the
 * inline version never had.
 */
function LevelChip({ level, percent, to = '/app/achievements', className }: LevelChipProps) {
  const label =
    percent === undefined ? `Level ${level}` : `Level ${level}, ${Math.round(percent)}% to next level`

  return (
    <Link
      to={to}
      aria-label={label}
      className={cn(
        'border-xp/25 bg-xp/10 text-xp hover:bg-xp/16 focus-visible:ring-ring/60 focus-visible:ring-offset-background inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        className,
      )}
    >
      <Sparkles aria-hidden className="size-3.5" />
      <span className="tabular-nums">Lv {level}</span>
      {percent === undefined ? null : (
        <span aria-hidden className="bg-xp/20 relative h-1 w-8 overflow-hidden rounded-full">
          <span
            className="bg-xp absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </span>
      )}
    </Link>
  )
}

export { LevelChip }
