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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLogSession, useStudySessions } from '@/features/focus/hooks'
import { type AmbientKind, useAmbientSound } from '@/features/focus/use-ambient-sound'
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

function DeepWorkTimer() {
  const logSession = useLogSession()
  const [startedAt, setStartedAt] = React.useState<number | null>(null)
  const [now, setNow] = React.useState(Date.now())
  const [distractions, setDistractions] = React.useState(0)

  React.useEffect(() => {
    if (startedAt === null) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  const elapsedMs = startedAt === null ? 0 : now - startedAt
  const hours = Math.floor(elapsedMs / 3_600_000)
  const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000)
  const seconds = Math.floor((elapsedMs % 60_000) / 1000)

  function stop() {
    if (startedAt === null) return
    const totalMinutes = Math.round((Date.now() - startedAt) / 60_000)
    if (totalMinutes >= 1) {
      logSession.mutate(
        {
          startedAt: new Date(startedAt).toISOString(),
          minutes: totalMinutes,
          source: 'deep_work',
          distractions,
        },
        { onSuccess: () => toast.success(`Deep work logged: ${formatMinutes(totalMinutes)}`) },
      )
    } else {
      toast.info('Sessions under a minute are not logged')
    }
    setStartedAt(null)
    setDistractions(0)
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="text-center">
        <p className="text-5xl font-semibold tabular-nums tracking-tight">
          {hours > 0 ? `${hours}:` : ''}
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          Deep work — open-ended, distraction-free
        </p>
      </div>
      <div className="flex items-center gap-2">
        {startedAt === null ? (
          <Button size="lg" onClick={() => setStartedAt(Date.now())}>
            <Play /> Start deep work
          </Button>
        ) : (
          <>
            <Button size="lg" variant="destructive" onClick={stop}>
              Stop &amp; log
            </Button>
            <Button
              variant="outline"
              onClick={() => setDistractions((count) => count + 1)}
              aria-label="Log a distraction"
            >
              <Zap /> Distracted ({distractions})
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export function FocusPage() {
  const { data: sessions = [] } = useStudySessions()
  const logSession = useLogSession()
  const ambient = useAmbientSound()
  const [mode, setMode] = React.useState<'pomodoro' | 'deep'>('pomodoro')
  const [settingsOpen, setSettingsOpen] = React.useState(false)

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
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Tabs value={mode} onValueChange={(value) => setMode(value as 'pomodoro' | 'deep')}>
                <TabsList>
                  <TabsTrigger value="pomodoro">Pomodoro</TabsTrigger>
                  <TabsTrigger value="deep">Deep work</TabsTrigger>
                </TabsList>
              </Tabs>
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
                    <Button size="lg" onClick={pomodoro.start}>
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
              <DeepWorkTimer />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
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

          <div className="grid grid-cols-2 gap-3">
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
