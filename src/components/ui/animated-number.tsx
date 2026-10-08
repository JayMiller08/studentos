import * as React from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

export interface AnimatedNumberProps extends Omit<React.ComponentProps<'span'>, 'children'> {
  value: number
  /** Milliseconds for the whole count. Ignored when motion is reduced. */
  duration?: number
  format?: (value: number) => string
}

/**
 * A number that counts up to its new value.
 *
 * Earning XP should feel like something happened. The animation is skipped
 * entirely for anyone who asked for reduced motion — they get the final number
 * immediately, not a faster count.
 */
function AnimatedNumber({
  value,
  duration = 700,
  format = (next) => next.toLocaleString(),
  className,
  ...props
}: AnimatedNumberProps) {
  const reducedMotion = usePrefersReducedMotion()
  const [shown, setShown] = React.useState(value)
  const fromRef = React.useRef(value)

  React.useEffect(() => {
    if (reducedMotion) {
      setShown(value)
      fromRef.current = value
      return
    }
    const from = fromRef.current
    if (from === value) return

    let frame = 0
    const started = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      // Ease-out: fast first, settling at the end, so the last digits land softly.
      const eased = 1 - (1 - progress) ** 3
      setShown(Math.round(from + (value - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
      else fromRef.current = value
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reducedMotion])

  return (
    <span data-slot="animated-number" className={cn('tabular-nums', className)} {...props}>
      {format(shown)}
    </span>
  )
}

export { AnimatedNumber }
