import { format, parseISO } from 'date-fns'
import {
  Brain,
  Flame,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Timer,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ViewSwitcher } from '@/components/view-switcher'
import { useLogSession, useStudySessions } from '@/features/focus/hooks'
import { type AmbientKind, useAmbientSound } from '@/features/focus/use-ambient-sound'
import { useDeepWork } from '@/features/focus/use-deep-work'
import { type PomodoroPhase, usePomodoro } from '@/features/focus/use-pomodoro'
import { computeFocusStats } from '@/services/focus-service'
import { cn, formatMinutes } from '@/lib/utils'

const PHASE_LABEL: Record<PomodoroPhase, string> = {
  focus: 'Focus',
  short_break: 'Short break',
  long_break: 'Long break',
}

function CircularTimer({
  remainingMs,
  totalMs,
  phase,
}: {
  remainingMs: number
  totalMs: number
  phase: PomodoroPhase
}) {
  const radius = 110
  const circumference = 2 * Math.PI * radius
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0
  const minutes = Math.floor(remainingMs / 60_000)
  const seconds = Math.floor((remainingMs % 60_000) / 1000)

  return (
    <div className="relative mx-auto size-64" role="timer" aria-live="off" aria-label={`${PHASE_LABEL[phase]} timer`}>
      <svg viewBox="0 0 256 256" className="size-full -rotate-90">
        <circle cx="128" cy="128" r={radius} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="128"
          cy="128"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cn(
            'transition-[stroke-dashoffset] duration-500',
            phase === 'focus' ? 'stroke-primary' : 'stroke-success',
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-semibold tabular-nums tracking-tight">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
        <span className="text-muted-foreground mt-1 text-sm">{PHASE_LABEL[phase]}</span>
      </div>
    </div>
  )
}

/** Elapsed milliseconds as `h:mm:ss`, dropping the hour until there is one. */
function formatElapsed(elapsedMs: number): string {
  const hours = Math.floor(elapsedMs / 3_600_000)
  const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000)
  const seconds = Math.floor((elapsedMs % 60_000) / 1000)
  return `${hours > 0 ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function DeepWorkTimer({
  deepWork,
  onStop,
}: {
  deepWork: ReturnType<typeof useDeepWork>
  onStop: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="text-center">
        <p className="text-5xl font-semibold tabular-nums tracking-tight">
          {formatElapsed(deepWork.elapsedMs)}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Deep work — open-ended, distraction-free
        </p>
      </div>
      <div className="flex items-center gap-2">
        {!deepWork.isRunning ? (
          <Button size="lg" onClick={deepWork.start}>
            <Play /> Start deep work
          </Button>
        ) : (
          <>
            <Button size="lg" variant="destructive" onClick={onStop}>
              Stop &amp; log
            </Button>
            <Button
              variant="outline"
              onClick={deepWork.addDistraction}
              aria-label="Log a distraction"
            >
              <Zap /> Distracted ({deepWork.distractions})
            </Button>
          </>
        )}
      </div>
      {deepWork.isRunning ? (
        <p className="text-muted-foreground text-center text-xs">
          Keeps running if you switch tabs or leave the page — stop it here when you are done.
        </p>
      ) : null}
    </div>
  )
}

type FocusMode = 'pomodoro' | 'deep'

const MODE_KEY = 'studentos.focus.mode'

/** Reopen the page on the timer the student left it on, not always pomodoro. */
function loadMode(): FocusMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'deep' ? 'deep' : 'pomodoro'
  } catch {
    return 'pomodoro'
  }
}

export function FocusPage() {
  const { data: sessions = [] } = useStudySessions()
  const logSession = useLogSession()
  const ambient = useAmbientSound()
  const deepWork = useDeepWork()
  const [mode, setMode] = React.useState<FocusMode>(loadMode)
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  React.useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, mode)
    } catch {
      // Remembering the tab is a convenience, never a reason to fail.
    }
  }, [mode])

  React.useEffect(() => {
    if (deepWork.staleSessionDropped) {
      // Stable id: one notice per abandoned session, however many times the
      // effect runs (StrictMode double-invokes it in development).
      toast.info('A deep work timer had been running over 12 hours, so it was not logged.', {
        id: 'deep-work-stale',
      })
    }
  }, [deepWork.staleSessionDropped])

  function stopDeepWork() {
    const finished = deepWork.stop()
    if (!finished) return
    if (finished.minutes < 1) {
      toast.info('Sessions under a minute are not logged')
      return
    }
    logSession.mutate(
      {
        startedAt: finished.startedAtIso,
        minutes: finished.minutes,
        source: 'deep_work',
        distractions: finished.distractions,
      },
      { onSuccess: () => toast.success(`Deep work logged: ${formatMinutes(finished.minutes)}`) },
    )
  }

  const pomodoro = usePomodoro({
    onPhaseComplete: (result) => {
      logSession.mutate(
        {
          startedAt: result.startedAtIso,
          minutes: result.actualMinutes,
          source: 'pomodoro',
          distractions: result.distractions,
          pomodoro: {
            kind: result.phase,
            plannedMinutes: result.plannedMinutes,
            completed: result.completed,
          },
        },
        {
          onSuccess: () =>
            toast.success(
              result.completed
                ? `Pomodoro complete — ${formatMinutes(result.actualMinutes)} focused 🎉`
                : `Partial focus logged: ${formatMinutes(result.actualMinutes)}`,
            ),
        },
      )
    },
  })

  /** Two timers logging at once would count the same hour twice. */
  function startPomodoro() {
    if (deepWork.isRunning) {
      toast.error('Stop your deep work session first — only one timer can run at a time.')
      return
    }
    pomodoro.start()
  }

  const stats = React.useMemo(() => computeFocusStats(sessions), [sessions])

  const statCards = [
    { label: 'Today', value: formatMinutes(stats.todayMinutes), icon: Timer },
    { label: 'This week', value: formatMinutes(stats.weekMinutes), icon: Brain },
    { label: 'This month', value: formatMinutes(stats.monthMinutes), icon: Zap },
    { label: 'Longest streak', value: `${stats.longestStreakDays}d`, icon: Flame },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Focus Center"
        description="Pomodoro sessions, deep work and your study history"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card data-tour="focus-timer">
          <CardHeader>
            <div className="flex items-center justify-between">
              <ViewSwitcher
                label="Focus mode"
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: 'pomodoro', label: 'Pomodoro' },
                  { value: 'deep', label: 'Deep work' },
                ]}
              />
              {mode === 'pomodoro' ? (
                <Button variant="ghost" size="sm" onClick={() => setSettingsOpen((open) => !open)}>
                  {pomodoro.settings.focusMinutes}/{pomodoro.settings.shortBreakMinutes} min
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {mode === 'pomodoro' ? (
              <div className="flex flex-col items-center gap-6">
                {/* A deep work session now survives leaving this tab, so it has
                    to stay visible from here — otherwise it runs invisibly and
                    a pomodoro started on top of it double-counts the same time. */}
                {deepWork.isRunning ? (
                  <div
                    role="status"
                    className="border-warning/40 bg-warning/8 flex w-full flex-wrap items-center gap-3 rounded-lg border p-3"
                  >
                    <Timer aria-hidden className="text-warning size-4 shrink-0" />
                    <p className="flex-1 text-sm">
                      Deep work is still running —{' '}
                      <span className="font-semibold tabular-nums">
                        {formatElapsed(deepWork.elapsedMs)}
                      </span>
                    </p>
                    <Button size="sm" variant="destructive" onClick={stopDeepWork}>
                      Stop &amp; log
                    </Button>
                  </div>
                ) : null}

                {settingsOpen ? (
                  <div className="grid w-full max-w-sm grid-cols-3 gap-3">
                    {(
                      [
                        ['focusMinutes', 'Focus'],
                        ['shortBreakMinutes', 'Break'],
                        ['longBreakMinutes', 'Long break'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={`setting-${key}`} className="text-xs">
                          {label}
                        </Label>
                        <Input
                          id={`setting-${key}`}
                          type="number"
                          min={1}
                          max={120}
                          value={pomodoro.settings[key]}
                          onChange={(event) =>
                            pomodoro.setSettings({
                              ...pomodoro.settings,
                              [key]: Math.max(1, Math.min(120, Number(event.target.value) || 1)),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                <CircularTimer
                  remainingMs={pomodoro.remainingMs}
                  totalMs={pomodoro.totalMs}
                  phase={pomodoro.phase}
                />

                <div className="flex flex-wrap items-center justify-center gap-2">
                  {pomodoro.status === 'running' ? (
                    <Button size="lg" variant="outline" onClick={pomodoro.pause}>
                      <Pause /> Pause
                    </Button>
                  ) : (
                    <Button size="lg" onClick={startPomodoro} disabled={deepWork.isRunning}>
                      <Play /> {pomodoro.status === 'paused' ? 'Resume' : 'Start focus'}
                    </Button>
                  )}
                  <Button variant="outline" size="icon" aria-label="Reset timer" onClick={pomodoro.reset}>
                    <RotateCcw />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Skip phase" onClick={pomodoro.skip}>
                    <SkipForward />
                  </Button>
                  {pomodoro.phase === 'focus' && pomodoro.status !== 'idle' ? (
                    <Button
                      variant="outline"
                      onClick={pomodoro.addDistraction}
                      aria-label="Log a distraction"
                    >
                      <Zap /> Distracted ({pomodoro.distractions})
                    </Button>
                  ) : null}
                </div>

                <p className="text-muted-foreground text-sm">
                  {pomodoro.completedFocusCount} pomodoro
                  {pomodoro.completedFocusCount === 1 ? '' : 's'} completed this cycle
                </p>
              </div>
            ) : (
              <DeepWorkTimer deepWork={deepWork} onStop={stopDeepWork} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card data-tour="focus-ambient">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {ambient.kind === 'off' ? (
                  <VolumeX aria-hidden className="text-muted-foreground size-4" />
                ) : (
                  <Volume2 aria-hidden className="text-primary size-4" />
                )}
                Focus sound
              </CardTitle>
              <CardDescription>Generated locally — works offline</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Ambient sound">
                {(
                  [
                    ['off', 'Off'],
                    ['brown', 'Rainy'],
                    ['white', 'Static'],
                  ] as Array<[AmbientKind, string]>
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={ambient.kind === kind}
                    onClick={() => ambient.select(kind)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      ambient.kind === kind ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-accent',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ambient-volume" className="text-xs">
                  Volume
                </Label>
                <input
                  id="ambient-volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={ambient.volume}
                  onChange={(event) => ambient.changeVolume(Number(event.target.value))}
                  className="accent-primary h-2 w-full cursor-pointer"
                />
              </div>
            </CardContent>
          </Card>

          <div data-tour="focus-stats" className="grid grid-cols-2 gap-3">
            {statCards.map((stat) => (
              <Card key={stat.label} className="gap-1 py-4">
                <CardContent className="space-y-1">
                  <stat.icon aria-hidden className="text-muted-foreground size-4" />
                  <p className="text-xl font-semibold">{stat.value}</p>
                  <p className="text-muted-foreground text-xs">{stat.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sessions</CardTitle>
          <CardDescription>
            {stats.totalSessions} sessions · {stats.totalDistractions} distractions logged
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              Your completed focus sessions will appear here.
            </p>
          ) : (
            <ul className="divide-y">
              {sessions.slice(0, 10).map((session) => (
                <li key={session.id} className="flex items-center gap-3 py-2.5">
                  <Badge variant={session.source === 'deep_work' ? 'secondary' : 'muted'} className="capitalize">
                    {session.source.replace('_', ' ')}
                  </Badge>
                  <span className="flex-1 text-sm font-medium">{formatMinutes(session.minutes)}</span>
                  {session.distractions > 0 ? (
                    <span className="text-muted-foreground text-xs">
                      {session.distractions} distraction{session.distractions === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {format(parseISO(session.started_at), 'd MMM, HH:mm')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
