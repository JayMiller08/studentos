import * as React from 'react'

export type PomodoroPhase = 'focus' | 'short_break' | 'long_break'
export type TimerStatus = 'idle' | 'running' | 'paused'

export interface PomodoroSettings {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /** A long break replaces every Nth short break. */
  longBreakEvery: number
}

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
}

const SETTINGS_KEY = 'studentos.focus.settings'
const STATE_KEY = 'studentos.focus.state'

export interface PersistedTimerState {
  phase: PomodoroPhase
  status: TimerStatus
  /** Epoch ms when the current phase ends (running) . */
  endsAt: number | null
  /** Remaining ms (paused). */
  remainingMs: number | null
  startedAtIso: string | null
  completedFocusCount: number
  distractions: number
}

const INITIAL_STATE: PersistedTimerState = {
  phase: 'focus',
  status: 'idle',
  endsAt: null,
  remainingMs: null,
  startedAtIso: null,
  completedFocusCount: 0,
  distractions: 0,
}

function loadSettings(): PomodoroSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_POMODORO_SETTINGS
    return { ...DEFAULT_POMODORO_SETTINGS, ...(JSON.parse(raw) as Partial<PomodoroSettings>) }
  } catch {
    return DEFAULT_POMODORO_SETTINGS
  }
}

function loadState(): PersistedTimerState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return INITIAL_STATE
    return { ...INITIAL_STATE, ...(JSON.parse(raw) as Partial<PersistedTimerState>) }
  } catch {
    return INITIAL_STATE
  }
}

function phaseMinutes(phase: PomodoroPhase, settings: PomodoroSettings): number {
  if (phase === 'focus') return settings.focusMinutes
  if (phase === 'short_break') return settings.shortBreakMinutes
  return settings.longBreakMinutes
}

function chime() {
  try {
    const AudioContextCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 1.3)
    oscillator.onended = () => void ctx.close()
  } catch {
    // Sound is a nicety — never break the timer over it.
  }
}

export interface CompletedPhase {
  phase: PomodoroPhase
  plannedMinutes: number
  actualMinutes: number
  startedAtIso: string
  distractions: number
  completed: boolean
}

interface UsePomodoroOptions {
  onPhaseComplete: (result: CompletedPhase) => void
}

/**
 * How late a finished phase can be noticed and still earn a chime.
 *
 * Browsers throttle timers in background tabs to roughly once a minute, so a
 * phase that ends while the tab is hidden is legitimately noticed up to a
 * minute late — and that is exactly when the chime is useful. Anything later
 * means the timer wasn't running at all (the student was on another page), and
 * a chime on arrival, or two for a focus block and its break, is just noise.
 */
const STALE_CHIME_MS = 90_000

/**
 * The timer state once the running phase has run out.
 *
 * A finished focus block rolls straight into its break. The break is part of
 * the method, and a student who has to come back and press Start in order to
 * rest usually doesn't. It is timed from when the focus block was *due* to end,
 * not from when this runs, so someone returning forty minutes later finds that
 * break already over instead of a fresh one starting on the spot.
 *
 * A finished break does not start the next focus block. Rest can begin by
 * itself; work should be chosen.
 */
export function nextStateAfter(
  prev: PersistedTimerState,
  settings: PomodoroSettings,
): PersistedTimerState {
  const endedAt = prev.endsAt ?? Date.now()

  if (prev.phase === 'focus') {
    const completedFocusCount = prev.completedFocusCount + 1
    const breakPhase: PomodoroPhase =
      completedFocusCount % Math.max(1, settings.longBreakEvery) === 0 ? 'long_break' : 'short_break'
    return {
      ...prev,
      phase: breakPhase,
      status: 'running',
      endsAt: endedAt + phaseMinutes(breakPhase, settings) * 60_000,
      remainingMs: null,
      startedAtIso: new Date(endedAt).toISOString(),
      completedFocusCount,
      distractions: 0,
    }
  }

  return {
    ...prev,
    phase: 'focus',
    status: 'idle',
    endsAt: null,
    remainingMs: null,
    startedAtIso: null,
    distractions: 0,
  }
}

/**
 * Pomodoro engine. Wall-clock based (survives tab sleep & reloads via
 * localStorage); emits `onPhaseComplete` exactly once per finished focus
 * block so the caller can persist it. Breaks run themselves — see `nextStateAfter`.
 */
export function usePomodoro({ onPhaseComplete }: UsePomodoroOptions) {
  const [settings, setSettingsState] = React.useState<PomodoroSettings>(loadSettings)
  const [state, setState] = React.useState<PersistedTimerState>(loadState)
  const [now, setNow] = React.useState(() => Date.now())
  /**
   * The `endsAt` of the phase whose completion has already been handled.
   *
   * Keyed on the phase rather than a true/false flag because completions now
   * chain: a finished focus block starts its break, and that break has to be
   * able to finish in turn. A flag set when focus ended would still be set when
   * the break ran out, and the break would never end.
   */
  const handledEndsAtRef = React.useRef<number | null>(null)
  const onPhaseCompleteRef = React.useRef(onPhaseComplete)
  onPhaseCompleteRef.current = onPhaseComplete

  React.useEffect(() => {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  }, [state])

  React.useEffect(() => {
    if (state.status !== 'running') return
    const interval = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(interval)
  }, [state.status])

  const totalMs = phaseMinutes(state.phase, settings) * 60_000
  const remainingMs =
    state.status === 'running' && state.endsAt !== null
      ? Math.max(0, state.endsAt - now)
      : state.status === 'paused' && state.remainingMs !== null
        ? state.remainingMs
        : totalMs

  // Phase completion. Completions chain: a finished focus block starts its
  // break, and a break that has also run out — the student was away — is
  // completed on the very next pass.
  React.useEffect(() => {
    if (state.status !== 'running' || state.endsAt === null || remainingMs > 0) return
    if (handledEndsAtRef.current === state.endsAt) return
    handledEndsAtRef.current = state.endsAt

    const finishedPhase = state.phase
    const endedAt = state.endsAt
    const planned = phaseMinutes(finishedPhase, settings)
    if (Date.now() - endedAt < STALE_CHIME_MS) chime()

    if (finishedPhase === 'focus') {
      onPhaseCompleteRef.current({
        phase: finishedPhase,
        plannedMinutes: planned,
        actualMinutes: planned,
        startedAtIso: state.startedAtIso ?? new Date(endedAt - planned * 60_000).toISOString(),
        distractions: state.distractions,
        completed: true,
      })
    }

    setState((prev) => nextStateAfter(prev, settings))
  }, [remainingMs, state, settings])

  const start = React.useCallback(() => {
    setNow(Date.now())
    setState((prev) => {
      const duration =
        prev.status === 'paused' && prev.remainingMs !== null
          ? prev.remainingMs
          : phaseMinutes(prev.phase, settings) * 60_000
      return {
        ...prev,
        status: 'running',
        endsAt: Date.now() + duration,
        remainingMs: null,
        startedAtIso: prev.startedAtIso ?? new Date().toISOString(),
      }
    })
  }, [settings])

  const pause = React.useCallback(() => {
    setState((prev) =>
      prev.status === 'running' && prev.endsAt !== null
        ? { ...prev, status: 'paused', remainingMs: Math.max(0, prev.endsAt - Date.now()), endsAt: null }
        : prev,
    )
  }, [])

  const reset = React.useCallback(() => {
    setState((prev) => ({
      ...INITIAL_STATE,
      phase: prev.phase,
      completedFocusCount: prev.completedFocusCount,
    }))
  }, [])

  /** Skip to the next phase; partial focus time still gets logged. */
  const skip = React.useCallback(() => {
    setState((prev) => {
      if (prev.phase === 'focus' && prev.status !== 'idle' && prev.startedAtIso) {
        const elapsedMs =
          prev.status === 'running' && prev.endsAt !== null
            ? phaseMinutes('focus', settings) * 60_000 - Math.max(0, prev.endsAt - Date.now())
            : phaseMinutes('focus', settings) * 60_000 - (prev.remainingMs ?? 0)
        const actualMinutes = Math.round(elapsedMs / 60_000)
        if (actualMinutes >= 1) {
          onPhaseCompleteRef.current({
            phase: 'focus',
            plannedMinutes: settings.focusMinutes,
            actualMinutes,
            startedAtIso: prev.startedAtIso,
            distractions: prev.distractions,
            completed: false,
          })
        }
      }
      const nextPhase: PomodoroPhase = prev.phase === 'focus' ? 'short_break' : 'focus'
      return {
        ...prev,
        phase: nextPhase,
        status: 'idle',
        endsAt: null,
        remainingMs: null,
        startedAtIso: null,
        distractions: 0,
      }
    })
  }, [settings])

  const addDistraction = React.useCallback(() => {
    setState((prev) => ({ ...prev, distractions: prev.distractions + 1 }))
  }, [])

  const setSettings = React.useCallback((next: PomodoroSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    setSettingsState(next)
  }, [])

  return {
    settings,
    setSettings,
    phase: state.phase,
    status: state.status,
    remainingMs,
    totalMs,
    completedFocusCount: state.completedFocusCount,
    distractions: state.distractions,
    start,
    pause,
    reset,
    skip,
    addDistraction,
  }
}
