import type * as React from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** The wash inside the card. The edge is the gradient ring, so tones set no border. */
const TONES = {
  primary: 'from-primary/10',
  xp: 'from-xp/12',
  quest: 'from-quest/12',
  league: 'from-league/12',
  streak: 'from-streak/12',
} as const

export interface HeroCardProps extends React.ComponentProps<'div'> {
  tone?: keyof typeof TONES
}

/**
 * The one card on a page that is allowed to shout.
 *
 * A tinted gradient panel for the single most important thing on a screen: the
 * next assignment, the level, the quest that is nearly done. Opaque over the
 * app gradient on purpose — a translucent tint let the backdrop through and
 * dropped body text to 4.46:1 on the dashboard.
 */
function HeroCard({ tone = 'primary', className, ...props }: HeroCardProps) {
  return (
    <Card
      data-slot="hero-card"
      className={cn(
        'bg-card ring-gradient bg-gradient-to-br to-transparent shadow-e2',
        TONES[tone],
        className,
      )}
      {...props}
    />
  )
}

export { HeroCard }
