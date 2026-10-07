import * as React from 'react'

/**
 * Whether this person asked their system to reduce motion.
 *
 * The stylesheet already neutralises CSS animations for them, but that override
 * cannot reach JavaScript animation (motion springs, count-ups, confetti), which
 * is exactly the kind this app adds for rewards. Anything scripted must check
 * here first.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}
