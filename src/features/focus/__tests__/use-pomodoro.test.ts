// @vitest-environment jsdom
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_POMODORO_SETTINGS,
  nextStateAfter,
  type PersistedTimerState,
  usePomodoro,
} from '../use-pomodoro'

// Lets `act` flush effects and state updates without React warning that this
// isn't a test environment.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MINUTE = 60_000
const START = new Date(2026, 8, 15, 9, 0, 0)

/**
 * Where a running timer is persisted. Spelled out rather than imported: it is a
 * contract with every browser that already has a timer saved under it, and a
 * rename would silently drop them.
 */
const STATE_KEY = 'studentos.focus.state'

function focusRunning(endsAt: number, overrides: Partial<PersistedTimerState> = {}): PersistedTimerState {
  return {
    phase: 'focus',
    status: 'running',
    endsAt,
    remainingMs: null,
    startedAtIso: new Date(endsAt - 25 * MINUTE).toISOString(),
    completedFocusCount: 0,
    distractions: 0,
    ...overrides,
  }
}

type OnPhaseComplete = Parameters<typeof usePomodoro>[0]['onPhaseComplete']

/**
 * Mount the hook under StrictMode, which runs effects twice on mount. That is
 * the point: a completion handled twice would log the same pomodoro twice.
 */
function mountPomodoro(onPhaseComplete: OnPhaseComplete) {
  let latest: ReturnType<typeof usePomodoro> | null = null
  function Probe() {
    latest = usePomodoro({ onPhaseComplete })
    return null
  }
  const root = createRoot(document.createElement('div'))
  React.act(() => {
    root.render(React.createElement(React.StrictMode, null, React.createElement(Probe)))
  })
  return {
    get timer() {
      if (!latest) throw new Error('hook did not render')
      return latest
    },
    unmount: () => React.act(() => root.unmount()),
  }
}

/** Move the wall clock on, then let the timer's 500ms tick notice. */
function elapse(ms: number) {
  React.act(() => {
    vi.setSystemTime(Date.now() + ms)
    vi.advanceTimersByTime(600)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('nextStateAfter', () => {
  const settings = DEFAULT_POMODORO_SETTINGS
  const endedAt = START.getTime()

  it('starts the break the moment a focus block ends', () => {
    const next = nextStateAfter(focusRunning(endedAt, { distractions: 3 }), settings)
    expect(next).toMatchObject({
      phase: 'short_break',
      status: 'running',
      endsAt: endedAt + 5 * MINUTE,
      completedFocusCount: 1,
      distractions: 0,
    })
  })

  it('times the break from when focus was due to end, not from now', () => {
    vi.setSystemTime(endedAt + 40 * MINUTE)
    expect(nextStateAfter(focusRunning(endedAt), settings).endsAt).toBe(endedAt + 5 * MINUTE)
  })

  it('takes the long break on every fourth block', () => {
    const next = nextStateAfter(focusRunning(endedAt, { completedFocusCount: 3 }), settings)
    expect(next).toMatchObject({ phase: 'long_break', endsAt: endedAt + 15 * MINUTE })
  })

  it('does not start the next focus block when a break ends', () => {
    const onBreak = focusRunning(endedAt, { phase: 'short_break' })
    expect(nextStateAfter(onBreak, settings)).toMatchObject({
      phase: 'focus',
      status: 'idle',
      endsAt: null,
    })
  })
})

describe('usePomodoro', () => {
  it('rolls a finished focus block straight into its break, logging it once', () => {
    const onPhaseComplete = vi.fn()
    const pomodoro = mountPomodoro(onPhaseComplete)

    React.act(() => pomodoro.timer.start())
    elapse(25 * MINUTE)

    expect(onPhaseComplete).toHaveBeenCalledTimes(1)
    expect(onPhaseComplete).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'focus', completed: true, actualMinutes: 25 }),
    )
    expect(pomodoro.timer.phase).toBe('short_break')
    expect(pomodoro.timer.status).toBe('running')
    expect(pomodoro.timer.remainingMs).toBeGreaterThan(4 * MINUTE)
    pomodoro.unmount()
  })

  it('lets the automatic break finish, then waits for the student', () => {
    // Regression: the old completion guard was a flag that only Start cleared,
    // so an automatically started break could never complete.
    const onPhaseComplete = vi.fn()
    const pomodoro = mountPomodoro(onPhaseComplete)

    React.act(() => pomodoro.timer.start())
    elapse(25 * MINUTE)
    elapse(5 * MINUTE)

    expect(pomodoro.timer.phase).toBe('focus')
    expect(pomodoro.timer.status).toBe('idle')
    // Breaks are rest, not study time, so they are never logged.
    expect(onPhaseComplete).toHaveBeenCalledTimes(1)
    pomodoro.unmount()
  })

  it('catches up on a focus block and a break that both ended while away', () => {
    const endedAt = Date.now() - 40 * MINUTE
    localStorage.setItem(STATE_KEY, JSON.stringify(focusRunning(endedAt, { distractions: 2 })))

    const onPhaseComplete = vi.fn()
    const pomodoro = mountPomodoro(onPhaseComplete)

    expect(onPhaseComplete).toHaveBeenCalledTimes(1)
    expect(onPhaseComplete).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true, distractions: 2 }),
    )
    expect(pomodoro.timer.phase).toBe('focus')
    expect(pomodoro.timer.status).toBe('idle')
    expect(pomodoro.timer.completedFocusCount).toBe(1)
    pomodoro.unmount()
  })

  it('shows only what is left of a break when the student comes back mid-way', () => {
    // Focus was due to end two minutes ago, so three minutes of break remain.
    localStorage.setItem(STATE_KEY, JSON.stringify(focusRunning(Date.now() - 2 * MINUTE)))

    const pomodoro = mountPomodoro(vi.fn())

    expect(pomodoro.timer.phase).toBe('short_break')
    expect(pomodoro.timer.status).toBe('running')
    expect(pomodoro.timer.remainingMs).toBe(3 * MINUTE)
    pomodoro.unmount()
  })
})
