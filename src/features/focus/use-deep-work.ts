import * as React from 'react'

const STATE_KEY = 'studentos.focus.deepwork'

/**
 * A timer still running after this long is a forgotten timer, not a study
 * session. Logging it would put a fake twelve-hour block into the day's total,
 * the streak and every chart downstream, so a stale session is dropped on
 * restore rather than counted.
 */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000

interface PersistedDeepWork {
  /** Epoch ms the session began; null when idle. */
  startedAt: number | null
  distractions: number
}

const IDLE: PersistedDeepWork = { startedAt: null, distractions: 0 }

export interface FinishedDeepWork {
  startedAtIso: string
  minutes: number
  distractions: number
}

function loadState(): { state: PersistedDeepWork; staleDropped: boolean } {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return { state: IDLE, staleDropped: false }
    const parsed = { ...IDLE, ...(JSON.parse(raw) as Partial<PersistedDeepWork>) }
    if (typeof parsed.startedAt !== 'number') return { state: IDLE, staleDropped: false }
    if (Date.now() - parsed.startedAt > STALE_AFTER_MS) {
      return { state: IDLE, staleDropped: true }
    }
    return { state: parsed, staleDropped: false }
  } catch {
    return { state: IDLE, staleDropped: false }
  }
}

/**
 * Open-ended deep work timer.
 *
 * Deliberately wall-clock based and persisted, for the same reason the pomodoro
 * engine is: the elapsed time is derived from the moment the session started,
 * not from a tick count that only exists while this component is mounted. That
 * is what lets a session survive switching to the pomodoro tab, navigating to
 * another page, a reload, or the tab being put to sleep — none of which should
 * cost a student the hour of work they just did.
 */
export function useDeepWork() {
  const [initial] = React.useState(loadState)
  const [state, setState] = React.useState<PersistedDeepWork>(initial.state)
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state))
    } catch {
      // A full or blocked quota must not take the running timer down with it.
    }
  }, [state])

  React.useEffect(() => {
    if (state.startedAt === null) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [state.startedAt])

  const elapsedMs = state.startedAt === null ? 0 : Math.max(0, now - state.startedAt)

  const start = React.useCallback(() => {
    setNow(Date.now())
    setState({ startedAt: Date.now(), distractions: 0 })
  }, [])

  /** End the session and hand back what should be logged, or null if idle. */
  const stop = React.useCallback((): FinishedDeepWork | null => {
    if (state.startedAt === null) return null
    const finished: FinishedDeepWork = {
      startedAtIso: new Date(state.startedAt).toISOString(),
      minutes: Math.round((Date.now() - state.startedAt) / 60_000),
      distractions: state.distractions,
    }
    setState(IDLE)
    return finished
  }, [state])

  const addDistraction = React.useCallback(() => {
    setState((prev) => ({ ...prev, distractions: prev.distractions + 1 }))
  }, [])

  return {
    isRunning: state.startedAt !== null,
    elapsedMs,
    distractions: state.distractions,
    /** True when a session was found abandoned on mount and discarded. */
    staleSessionDropped: initial.staleDropped,
    start,
    stop,
    addDistraction,
  }
}
