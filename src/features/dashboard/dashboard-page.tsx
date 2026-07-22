import { differenceInCalendarDays, format, parseISO, startOfDay, endOfDay } from 'date-fns'
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Download,
  Flame,
  ListTodo,
  Plus,
  Quote,
  Sparkles,
  Timer,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
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
import { Progress } from '@/components/ui/progress'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { useCalendarEvents } from '@/features/calendar/hooks'
import { useStudySessions } from '@/features/focus/hooks'
import { ModuleBadge } from '@/features/assignments/module-badge'
import { useTasks, useToggleTask } from '@/features/planner/hooks'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { quoteOfTheDay } from '@/lib/quotes'
import { cn, formatDueDistance, formatMinutes, percent, todayKey } from '@/lib/utils'
import { isActiveAssignment, isOverdue } from '@/services/assignments-service'
import { calendarService } from '@/services/calendar-service'
import { computeFocusStats } from '@/services/focus-service'
import { rankAssignments } from '@/services/priority-engine'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Burning the midnight oil'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { canInstall, promptInstall } = usePwaInstall()
  const { data: assignments = [] } = useAssignments()
  const { data: modules = [] } = useModules()
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: sessions = [] } = useStudySessions()
  const toggleTask = useToggleTask()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const today = new Date()
  const quote = quoteOfTheDay()
  const moduleById = React.useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules])

  const active = assignments.filter(isActiveAssignment)
  const ranked = React.useMemo(() => rankAssignments(active), [active])
  const topPriority = ranked[0]

  const todaysTasks = tasks
    .filter((task) => task.scheduled_on === todayKey())
    .sort((a, b) => (a.start_minutes ?? 9999) - (b.start_minutes ?? 9999))
  const doneToday = todaysTasks.filter((task) => task.status === 'done').length

  const todaysEvents = React.useMemo(
    () => calendarService.expandForRange(events, startOfDay(today), endOfDay(today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` is stable per render pass
    [events],
  )

  const upcoming = active
    .filter((assignment) => !isOverdue(assignment))
    .slice(0, 4)
  const overdueCount = active.filter((assignment) => isOverdue(assignment)).length

  const stats = React.useMemo(() => computeFocusStats(sessions), [sessions])

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={format(today, 'EEEE, d MMMM')}
        actions={
          (profile?.current_streak ?? 0) > 0 ? (
            <Badge variant="warning" className="px-3 py-1 text-sm">
              <Flame className="size-4" /> {profile?.current_streak}-day streak
            </Badge>
          ) : undefined
        }
      />

      {/* Priority hero — the answer to "what should I do right now?" */}
      <Card className="from-primary/8 border-primary/25 bg-gradient-to-br to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles aria-hidden className="text-primary size-4" /> Today's priority
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topPriority ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ModuleBadge
                    module={topPriority.module_id ? moduleById.get(topPriority.module_id) : undefined}
                  />
                  {isOverdue(topPriority) ? <Badge variant="destructive">Overdue</Badge> : null}
                </div>
                <h2 className="mt-1 text-lg font-semibold">{topPriority.title}</h2>
                <p className="text-muted-foreground text-sm">
                  {formatDueDistance(topPriority.due_at)} ·{' '}
                  {formatMinutes(
                    Math.round(
                      topPriority.estimated_minutes * (1 - topPriority.progress / 100),
                    ),
                  )}{' '}
                  remaining · {topPriority.weight}% of grade
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={topPriority.progress} className="h-1.5 max-w-56" />
                  <span className="text-muted-foreground text-xs">{topPriority.progress}%</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button asChild>
                  <Link to="/app/focus">
                    <Timer /> Start focusing
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/app/assignments">
                    Details <ArrowRight />
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <p className="text-muted-foreground flex-1 text-sm">
                No active assignments — add one and StudentOS will tell you exactly what to work on
                first.
              </p>
              <Button asChild>
                <Link to="/app/assignments">
                  <Plus /> Add assignment
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Today's tasks */}
        <Card className="xl:row-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo aria-hidden className="text-primary size-4" /> Today's tasks
            </CardTitle>
            <CardDescription>
              {todaysTasks.length === 0
                ? 'Nothing planned yet'
                : `${doneToday}/${todaysTasks.length} done`}
            </CardDescription>
            {todaysTasks.length > 0 ? (
              <Progress value={percent(doneToday, todaysTasks.length)} className="h-1.5" />
            ) : null}
          </CardHeader>
          <CardContent>
            {todaysTasks.length === 0 ? (
              <Button asChild variant="outline" className="w-full">
                <Link to="/app/planner">
                  <Plus /> Plan your day
                </Link>
              </Button>
            ) : (
              <ul className="space-y-1.5">
                {todaysTasks.slice(0, 7).map((task) => {
                  const done = task.status === 'done'
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => toggleTask.mutate({ task, completed: !done })}
                        className="hover:bg-accent flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors"
                      >
                        <CheckCircle2
                          aria-hidden
                          className={cn('size-4.5 shrink-0', done ? 'text-success' : 'text-muted-foreground/40')}
                        />
                        <span className={cn('flex-1 truncate text-sm', done && 'text-muted-foreground line-through')}>
                          {task.title}
                        </span>
                        {task.start_minutes !== null ? (
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {String(Math.floor(task.start_minutes / 60)).padStart(2, '0')}:
                            {String(task.start_minutes % 60).padStart(2, '0')}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
                {todaysTasks.length > 7 ? (
                  <li>
                    <Button asChild variant="link" size="sm" className="px-2">
                      <Link to="/app/planner">View all {todaysTasks.length} tasks</Link>
                    </Button>
                  </li>
                ) : null}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Upcoming assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen aria-hidden className="text-primary size-4" /> Upcoming assignments
            </CardTitle>
            {overdueCount > 0 ? (
              <CardDescription className="text-destructive font-medium">
                {overdueCount} overdue need{overdueCount === 1 ? 's' : ''} attention
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">All clear — nothing due soon.</p>
            ) : (
              <ul className="space-y-2.5">
                {upcoming.map((assignment) => {
                  const days = differenceInCalendarDays(parseISO(assignment.due_at), today)
                  return (
                    <li key={assignment.id} className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 flex-col items-center justify-center rounded-lg text-center',
                          days <= 2 ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground',
                        )}
                      >
                        <span className="text-sm leading-4 font-bold">
                          {format(parseISO(assignment.due_at), 'd')}
                        </span>
                        <span className="text-[9px] uppercase">
                          {format(parseISO(assignment.due_at), 'MMM')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{assignment.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {formatDueDistance(assignment.due_at)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Today's schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays aria-hidden className="text-primary size-4" /> Today's schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todaysEvents.length === 0 ? (
              <p className="text-muted-foreground text-sm">No classes or events today.</p>
            ) : (
              <ul className="space-y-2">
                {todaysEvents.slice(0, 5).map((occurrence) => (
                  <li key={occurrence.occurrenceKey} className="flex items-center gap-3">
                    <span className="text-muted-foreground w-11 shrink-0 text-xs tabular-nums">
                      {format(occurrence.starts_at, 'HH:mm')}
                    </span>
                    <span
                      aria-hidden
                      className="h-6 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: occurrence.color ?? 'var(--primary)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{occurrence.title}</p>
                      {occurrence.location ? (
                        <p className="text-muted-foreground truncate text-xs">{occurrence.location}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="link" size="sm" className="mt-1 px-0">
              <Link to="/app/calendar">Open calendar</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Study stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer aria-hidden className="text-primary size-4" /> Study time
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-semibold">{formatMinutes(stats.todayMinutes)}</p>
              <p className="text-muted-foreground text-xs">Today</p>
            </div>
            <div>
              <p className="text-xl font-semibold">{formatMinutes(stats.weekMinutes)}</p>
              <p className="text-muted-foreground text-xs">This week</p>
            </div>
            <div>
              <p className="text-xl font-semibold">{stats.currentStreakDays}d</p>
              <p className="text-muted-foreground text-xs">Focus streak</p>
            </div>
          </CardContent>
        </Card>

        {/* Quote of the day */}
        <Card className="bg-secondary/50">
          <CardContent className="flex gap-3 pt-1">
            <Quote aria-hidden className="text-secondary-foreground/60 size-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{quote.text}</p>
              <p className="text-muted-foreground mt-1 text-xs">— {quote.author}</p>
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="justify-start">
              <Link to="/app/assignments">
                <BookOpen /> Assignment
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/app/planner">
                <ListTodo /> Task
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/app/calendar">
                <CalendarPlus /> Event
              </Link>
            </Button>
            <Button asChild variant="outline" className="justify-start">
              <Link to="/app/focus">
                <Timer /> Focus
              </Link>
            </Button>
          </CardContent>
        </Card>

        {canInstall ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Download aria-hidden className="text-primary size-4" /> Install StudentOS
              </CardTitle>
              <CardDescription>Home-screen access, offline-ready.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void promptInstall()}>Install app</Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
