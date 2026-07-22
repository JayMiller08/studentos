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

interface PersistedTimerState {
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
 * Pomodoro engine. Wall-clock based (survives tab sleep & reloads via
 * localStorage); emits `onPhaseComplete` exactly once per finished phase so
 * the caller can persist the session.
 */
export function usePomodoro({ onPhaseComplete }: UsePomodoroOptions) {
  const [settings, setSettingsState] = React.useState<PomodoroSettings>(loadSettings)
  const [state, setState] = React.useState<PersistedTimerState>(loadState)
  const [now, setNow] = React.useState(() => Date.now())
  const completeHandledRef = React.useRef(false)
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

  // Phase completion.
  React.useEffect(() => {
    if (state.status !== 'running' || remainingMs > 0 || completeHandledRef.current) return
    completeHandledRef.current = true

    const finishedPhase = state.phase
    const planned = phaseMinutes(finishedPhase, settings)
    chime()
    if (finishedPhase === 'focus') {
      onPhaseCompleteRef.current({
        phase: finishedPhase,
        plannedMinutes: planned,
        actualMinutes: planned,
        startedAtIso: state.startedAtIso ?? new Date(Date.now() - planned * 60_000).toISOString(),
        distractions: state.distractions,
        completed: true,
      })
    }

    setState((prev) => {
      const completedFocusCount =
        finishedPhase === 'focus' ? prev.completedFocusCount + 1 : prev.completedFocusCount
      const nextPhase: PomodoroPhase =
        finishedPhase === 'focus'
          ? completedFocusCount % Math.max(1, settings.longBreakEvery) === 0
            ? 'long_break'
            : 'short_break'
          : 'focus'
      return {
        ...prev,
        phase: nextPhase,
        status: 'idle',
        endsAt: null,
        remainingMs: null,
        startedAtIso: null,
        completedFocusCount,
        distractions: 0,
      }
    })
  }, [remainingMs, state, settings])

  const start = React.useCallback(() => {
    completeHandledRef.current = false
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
    completeHandledRef.current = false
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
      completeHandledRef.current = false
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
