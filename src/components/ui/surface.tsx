import type * as React from 'react'
import { cn } from '@/lib/utils'

const TIERS = {
  1: 'bg-surface-1 shadow-e1',
  2: 'bg-surface-2 shadow-e2',
  3: 'bg-surface-3 shadow-e3',
} as const

export interface SurfaceProps extends React.ComponentProps<'div'> {
  /** How far off the page this sits. 1 = resting, 3 = floating. */
  tier?: 1 | 2 | 3
}

/**
 * A panel with real depth.
 *
 * Every card in the app used the same `shadow-xs`, which left the interface
 * flat — nothing looked closer to the reader than anything else. In light mode
 * a tier raises the shadow; in dark mode the surface itself lightens, because a
 * shadow on a near-black page is invisible.
 */
function Surface({ className, tier = 1, ...props }: SurfaceProps) {
  return (
    <div
      data-slot="surface"
      data-tier={tier}
      className={cn('rounded-xl border', TIERS[tier], className)}
      {...props}
    />
  )
}

export { Surface }
