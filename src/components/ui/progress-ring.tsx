import type * as React from 'react'
import { cn } from '@/lib/utils'

export interface ProgressRingProps extends React.ComponentProps<'div'> {
  /** 0–1. Values outside are clamped, so a caller can't paint a broken ring. */
  value: number
  /** Ring diameter in px; the SVG scales to whatever box the class gives it. */
  size?: number
  thickness?: number
  /** Tailwind stroke class for the filled arc, e.g. `stroke-xp`. */
  trackClassName?: string
  arcClassName?: string
  /** Rendered in the middle. */
  children?: React.ReactNode
}

/**
 * A circular progress arc.
 *
 * Hand-rolled in the focus timer first; quizzes, quests and the level hero all
 * want the same shape, so it lives here rather than being drawn three more
 * times. Presentational on purpose — the caller owns the label and the
 * accessible name, because a timer, a score and a quest each announce
 * themselves differently.
 */
function ProgressRing({
  value,
  size = 256,
  thickness = 10,
  trackClassName,
  arcClassName,
  className,
  children,
  ...props
}: ProgressRingProps) {
  const fraction = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const radius = size / 2 - thickness
  const circumference = 2 * Math.PI * radius

  return (
    <div data-slot="progress-ring" className={cn('relative', className)} {...props}>
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className={cn('stroke-muted', trackClassName)}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cn('stroke-primary transition-[stroke-dashoffset] duration-500', arcClassName)}
        />
      </svg>
      {children ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      ) : null}
    </div>
  )
}

export { ProgressRing }
