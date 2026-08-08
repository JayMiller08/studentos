import * as React from 'react'
import { type GuardStatus, requestGuard } from '@/lib/request-guard'

export type ConnectionState = 'online' | 'offline' | 'unreachable'

export interface Connection {
  state: ConnectionState
  /** When the app will next try, while unreachable. */
  retryAt: number | null
  /** Try again now rather than waiting out the cooldown. */
  retryNow: () => void
}

/**
 * What the app currently believes about connectivity.
 *
 * Two signals, because neither is sufficient alone. `navigator.onLine` only
 * knows whether a network interface exists — it happily reports "online" on a
 * captive portal or a wifi connection with no route out. The request guard
 * knows whether requests are actually completing, which is the thing the user
 * cares about, but it only learns that after some have failed.
 */
export function useConnection(): Connection {
  const [browserOnline, setBrowserOnline] = React.useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  )
  const [guard, setGuard] = React.useState<GuardStatus>(() => requestGuard.getStatus())

  React.useEffect(() => {
    const goOnline = () => {
      setBrowserOnline(true)
      // The interface came back — don't make the user wait out a cooldown that
      // was measuring an outage which has just ended.
      requestGuard.reset()
    }
    const goOffline = () => setBrowserOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    const unsubscribe = requestGuard.subscribe(setGuard)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      unsubscribe()
    }
  }, [])

  // Re-render when a cooldown lapses so the banner can stop saying "waiting".
  React.useEffect(() => {
    if (guard.state !== 'open' || guard.retryAt === null) return
    const delay = Math.max(0, guard.retryAt - Date.now()) + 100
    const timer = window.setTimeout(() => setGuard(requestGuard.getStatus()), delay)
    return () => window.clearTimeout(timer)
  }, [guard.state, guard.retryAt])

  const state: ConnectionState = !browserOnline
    ? 'offline'
    : guard.state === 'open'
      ? 'unreachable'
      : 'online'

  return {
    state,
    retryAt: guard.retryAt,
    retryNow: React.useCallback(() => requestGuard.reset(), []),
  }
}
