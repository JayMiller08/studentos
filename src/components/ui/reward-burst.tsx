import * as React from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

export interface RewardBurstProps extends React.ComponentProps<'div'> {
  /** Flip to true at the moment of the reward; it plays once and clears. */
  active: boolean
  /** Which token the sparks take. */
  tone?: 'xp' | 'quest' | 'streak' | 'league'
}

const SPARK_TONE = {
  xp: 'bg-xp',
  quest: 'bg-quest',
  streak: 'bg-streak',
  league: 'bg-league',
} as const

/** Fixed offsets, so the burst looks designed rather than randomly scattered. */
const SPARKS = [
  { x: -46, y: -28, delay: 0 },
  { x: -18, y: -52, delay: 40 },
  { x: 16, y: -50, delay: 20 },
  { x: 44, y: -24, delay: 60 },
  { x: -38, y: 20, delay: 80 },
  { x: 36, y: 26, delay: 30 },
]

/**
 * A small burst behind something that was just earned.
 *
 * Decorative and `aria-hidden`: the reward itself is always announced in text
 * elsewhere (a toast, a number that changed), so a screen reader loses nothing.
 * Renders nothing at all under reduced motion — a celebration that cannot move
 * is just clutter.
 */
function RewardBurst({ active, tone = 'xp', className, ...props }: RewardBurstProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [playing, setPlaying] = React.useState(false)

  React.useEffect(() => {
    if (!active || reducedMotion) return
    setPlaying(true)
    const timer = setTimeout(() => setPlaying(false), 700)
    return () => clearTimeout(timer)
  }, [active, reducedMotion])

  if (!playing) return null

  return (
    <div
      aria-hidden
      data-slot="reward-burst"
      className={cn('pointer-events-none absolute inset-0 overflow-visible', className)}
      {...props}
    >
      {SPARKS.map((spark, index) => (
        <span
          key={index}
          className={cn(
            'absolute top-1/2 left-1/2 size-1.5 rounded-full opacity-0',
            SPARK_TONE[tone],
          )}
          style={{
            animation: `reward-spark 620ms var(--ease-emphasis) ${spark.delay}ms forwards`,
            // Read by the keyframes below, so one animation serves every spark.
            ['--spark-x' as string]: `${spark.x}px`,
            ['--spark-y' as string]: `${spark.y}px`,
          }}
        />
      ))}
    </div>
  )
}

export { RewardBurst }
