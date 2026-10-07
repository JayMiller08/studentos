import {
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  parseISO,
  startOfDay,
  endOfDay,
} from 'date-fns'
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Download,
  Flame,
  ListTodo,
  Plus,
  Quote,
  Snowflake,
  Sparkles,
  StickyNote,
  Timer,
  UserRoundPen,
  Zap,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { HeroCard } from '@/components/ui/hero-card'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { Progress } from '@/components/ui/progress'
import { SectionCard } from '@/components/ui/section-card'
import { StatTile } from '@/components/ui/stat-tile'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { useCalendarEvents } from '@/features/calendar/hooks'
import { useNotes } from '@/features/notes/hooks'
import { useStudySessions } from '@/features/focus/hooks'
import { ModuleBadge } from '@/features/assignments/module-badge'
import { PriorityBadge } from '@/features/assignments/priority-badge'
import { badgeProgress, quizStanding } from '@/features/dashboard/progress'
import { ProgressHud } from '@/features/dashboard/progress-hud'
import { QuizScoresCard } from '@/features/dashboard/quiz-scores-card'
import { QuestBoardCard } from '@/features/quests/quest-board-card'
import { SquadCard } from '@/features/squad/squad-card'
import { useAchievements } from '@/features/gamification/hooks'
import { useTasks, useToggleTask } from '@/features/planner/hooks'
import { useQuizAttempts, useQuizzes } from '@/features/quiz/hooks'
import { usePlan } from '@/hooks/use-plan'
import { usePwaInstall } from '@/hooks/use-pwa-install'
import { getMissingProfileFields } from '@/lib/profile-completeness'
import { quoteOfTheDay } from '@/lib/quotes'
import { effectiveStreak, heldFreezes, isStreakProtected } from '@/lib/streak'
import { cn, formatDueDistance, formatMinutes, percent, todayKey } from '@/lib/utils'
import { isActiveAssignment, isOverdue } from '@/services/assignments-service'
import { calendarService } from '@/services/calendar-service'
import { computeFocusStats } from '@/services/focus-service'
import { notePreview } from '@/services/notes-service'
import { orderAssignments } from '@/services/priority-engine'

/**
 * The day in one line, under the greeting.
 *
 * The header used to repeat the date here, which the student already knows.
 * What they don't know until they read the whole page is how much is waiting.
 */
function daySummary(tasksLeft: number, dueThisWeek: number, overdue: number): string {
  const parts: string[] = []
  if (overdue > 0) parts.push(`${overdue} overdue`)
  if (tasksLeft > 0) parts.push(`${tasksLeft} task${tasksLeft === 1 ? '' : 's'} left today`)
  if (dueThisWeek > 0) parts.push(`${dueThisWeek} due this week`)
  return parts.length > 0 ? parts.join(' · ') : 'A clear day — a good one to get ahead.'
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Burning the midnight oil'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { has } = usePlan()
  const smartPrioritization = has('smartPrioritization')
  const { canInstall, promptInstall } = usePwaInstall()
  const { data: assignments = [], isLoading: assignmentsLoading } = useAssignments()
  const { data: modules = [] } = useModules()
  const { data: tasks = [], isLoading: tasksLoading } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: sessions = [] } = useStudySessions()
  const { data: notes = [] } = useNotes()
  const { data: quizzes = [], isLoading: quizzesLoading } = useQuizzes()
  const { data: attempts = [], isLoading: attemptsLoading } = useQuizAttempts()
  const { data: achievements, isLoading: achievementsLoading } = useAchievements()
  const toggleTask = useToggleTask()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const today = new Date()
  const quote = quoteOfTheDay()
  const moduleById = React.useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules])

  const active = assignments.filter(isActiveAssignment)
  const ordering = React.useMemo(
    () => orderAssignments(active, { smart: smartPrioritization }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `active` is rebuilt each render from `assignments`
    [assignments, smartPrioritization],
  )
  const topPriority = ordering.items[0]
  const topReason = topPriority ? ordering.scoreById.get(topPriority.id) : undefined

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
  const missingProfileFields = getMissingProfileFields(profile)
  // Derived, not read straight off the profile: the stored counter is stale the
  // moment a student stops showing up. See effectiveStreak.
  const streak = effectiveStreak(profile)
  const streakProtected = isStreakProtected(profile)
  const freezes = profile ? (heldFreezes(profile) ?? 0) : 0
  // notesService already orders by updated_at, so these are the latest saves.
  const recentNotes = notes.slice(0, 4)

  // Null until loaded, so the strip shows placeholders rather than a zero that
  // is not true yet — "0 of 12 badges" for a beat is a small lie.
  const standing = React.useMemo(
    () => (attemptsLoading ? null : quizStanding(attempts)),
    [attempts, attemptsLoading],
  )
  const badges = React.useMemo(
    () => (achievementsLoading || !achievements ? null : badgeProgress(achievements)),
    [achievements, achievementsLoading],
  )
  const progressHud = (
    <ProgressHud
      xp={profile?.xp ?? 0}
      streak={{
        days: streak,
        // The stored best can lag a streak that is still running.
        best: Math.max(profile?.longest_streak ?? 0, streak),
        freezes,
        protectedToday: streakProtected,
      }}
      quiz={standing}
      badges={badges}
    />
  )

  const loading = assignmentsLoading || tasksLoading
  const dueThisWeek = active.filter(
    (assignment) =>
      !isOverdue(assignment) && differenceInCalendarDays(parseISO(assignment.due_at), today) <= 7,
  ).length

  const header = (
    <PageHeader
      eyebrow={format(today, 'EEEE, d MMMM')}
      title={`${greeting()}, ${firstName}`}
      // Withheld while loading: "a clear day" over an unloaded list is a
      // claim about the student's week that may be false.
      description={
        loading ? undefined : daySummary(todaysTasks.length - doneToday, dueThisWeek, overdueCount)
      }
    />
  )

  // The first paint of a returning student's dashboard used to be every empty
  // state at once — "no assignments", "nothing planned" — replaced a beat later
  // by their actual week. Placeholders say "not yet" instead of "nothing".
  if (loading) {
    return (
      // The progress strip renders straight away: it reads the profile, which
      // is already loaded, and placeholders its own slower numbers.
      <div className="space-y-6">
        {header}
        {progressHud}
        <PageSkeleton cards={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      {/* A missed day that a freeze is covering — not yet a lost streak */}
      {streakProtected ? (
        // Opaque, not tinted: a translucent tint lets the fixed background gradient
        // show through, and over its lighter end the body text fell to 4.46:1.
        <Card className="border-league/40 bg-card shadow-e2" role="status">
          <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="bg-league/15 text-league flex size-10 shrink-0 items-center justify-center rounded-full">
              <Snowflake aria-hidden className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">A streak freeze is holding your {streak}-day streak</p>
              <p className="text-muted-foreground text-sm">
                You missed yesterday. Log a focus session or finish a task today and the freeze
                keeps your streak going — miss today as well and it resets.
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link to="/app/focus">
                <Timer /> Start focusing
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Profile completion notice — surfaces missing required details */}
      {missingProfileFields.length > 0 ? (
        <Card className="border-warning/40 bg-warning/8" role="alert">
          <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="bg-warning/15 text-warning-foreground dark:text-warning flex size-10 shrink-0 items-center justify-center rounded-full">
              <UserRoundPen aria-hidden className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Finish setting up your profile</p>
              <p className="text-muted-foreground text-sm">
                Missing: {missingProfileFields.join(', ')}. Complete these so StudentOS can plan
                around your studies.
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link to="/app/settings">Complete profile</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Where the student stands: first thing on the page, lighter than the
          priority card so the one thing to do next still leads. */}
      {progressHud}

      {/* Priority hero — the answer to "what should I do right now?" */}
      <HeroCard data-tour="priority">
        <CardContent className="space-y-4">
          <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <Sparkles aria-hidden className="text-primary size-3.5" /> Today's priority
          </p>
          {topPriority ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <ModuleBadge
                    module={topPriority.module_id ? moduleById.get(topPriority.module_id) : undefined}
                  />
                  {topReason ? <PriorityBadge score={topReason} /> : null}
                  {isOverdue(topPriority) ? <Badge variant="destructive">Overdue</Badge> : null}
                </div>
                {/* The largest text on the page: the one thing to do next. */}
                <h2 className="font-display mt-1.5 text-2xl leading-tight font-semibold tracking-tight">
                  {topPriority.title}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {formatDueDistance(topPriority.due_at)} ·{' '}
                  {formatMinutes(
                    Math.round(
                      topPriority.estimated_minutes * (1 - topPriority.progress / 100),
                    ),
                  )}{' '}
                  remaining · {topPriority.weight}% of grade
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Progress
                    value={topPriority.progress}
                    aria-label={`${topPriority.title} is ${topPriority.progress}% complete`}
                    className="h-1.5 max-w-56"
                  />
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {topPriority.progress}%
                  </span>
                </div>
                {ordering.smart ? null : (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Picked by due date.{' '}
                    <Link to="/app/billing" className="text-primary font-medium hover:underline">
                      Smart prioritization
                    </Link>{' '}
                    also weighs grade impact and work left.
                  </p>
                )}
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
      </HeroCard>

      {/*
        Bento: a six-column track at xl so tiles can be one, two or three
        columns wide. A uniform grid made the quote card look as important as
        the day's tasks; spans let the layout say which is which.
      */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {/* Today's tasks — the tallest tile, and the one students act on */}
        <SectionCard
          data-tour="today"
          className="xl:col-span-2 xl:row-span-2"
          icon={ListTodo}
          title="Today's tasks"
          description={
            todaysTasks.length === 0 ? 'Nothing planned yet' : `${doneToday}/${todaysTasks.length} done`
          }
          action={
            todaysTasks.length > 0 ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                {percent(doneToday, todaysTasks.length)}%
              </span>
            ) : undefined
          }
        >
          {todaysTasks.length > 0 ? (
            <Progress
              value={percent(doneToday, todaysTasks.length)}
              aria-label={`${doneToday} of ${todaysTasks.length} tasks done today`}
              className="mb-3 h-1.5"
            />
          ) : null}
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
        </SectionCard>

        {/* Upcoming assignments */}
        <SectionCard
          className="xl:col-span-2"
          icon={BookOpen}
          title="Upcoming assignments"
          description={
            overdueCount > 0
              ? `${overdueCount} overdue need${overdueCount === 1 ? 's' : ''} attention`
              : undefined
          }
        >
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
        </SectionCard>

        {/* Today's schedule */}
        <SectionCard className="xl:col-span-2" icon={CalendarDays} title="Today's schedule">
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
        </SectionCard>

        {/* The second row, beside the tasks: what to do this week, and the
            verified answers that are the XP that counts */}
        <QuestBoardCard className="xl:col-span-2" />
        <QuizScoresCard
          className="xl:col-span-2"
          quizzes={quizzes}
          attempts={attempts}
          loading={quizzesLoading || attemptsLoading}
        />

        {/* Study time, the squad's week and recent notes share the third row */}
        <SectionCard className="xl:col-span-2" icon={Timer} title="Study time">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label="Today" value={formatMinutes(stats.todayMinutes)} />
            <StatTile label="This week" value={formatMinutes(stats.weekMinutes)} tone="primary" />
            <StatTile
              icon={Flame}
              label="Focus streak"
              value={`${stats.currentStreakDays}d`}
              tone="streak"
            />
          </div>
        </SectionCard>

        <SquadCard className="xl:col-span-2" />

        {/* Recently saved notes */}
        <SectionCard className="xl:col-span-2" icon={StickyNote} title="Recent notes">
          {recentNotes.length === 0 ? (
            <Button asChild variant="outline" className="w-full">
              <Link to="/app/notes">
                <Plus /> Write your first note
              </Link>
            </Button>
          ) : (
            <ul className="space-y-1">
              {recentNotes.map((note) => (
                <li key={note.id}>
                  <Link
                    to={`/app/notes?note=${note.id}`}
                    className="hover:bg-accent block rounded-lg p-2 transition-colors"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {note.title || 'Untitled'}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {formatDistanceToNow(parseISO(note.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      {notePreview(note) || 'Empty note'}
                    </p>
                  </Link>
                </li>
              ))}
              <li>
                <Button asChild variant="link" size="sm" className="px-2">
                  <Link to="/app/notes">Open notes</Link>
                </Button>
              </li>
            </ul>
          )}
        </SectionCard>

        {/* Quick actions */}
        <SectionCard className="xl:col-span-4" icon={Zap} title="Quick actions">
          {/* Five across from sm; on a phone the fifth takes the full row
              rather than leaving a hole beside it. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
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
            <Button asChild variant="outline" className="justify-start">
              <Link to="/app/quiz">
                <BrainCircuit /> Quiz
              </Link>
            </Button>
          </div>
        </SectionCard>

        {/* Quote of the day */}
        <Card className="bg-secondary/50 xl:col-span-2">
          <CardContent className="flex gap-3">
            <Quote aria-hidden className="text-secondary-foreground/60 size-5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{quote.text}</p>
              <p className="text-muted-foreground mt-1 text-xs">— {quote.author}</p>
            </div>
          </CardContent>
        </Card>

        {canInstall ? (
          <SectionCard
            className="xl:col-span-2"
            icon={Download}
            title="Install StudentOS"
            description="Home-screen access, offline-ready."
          >
            <Button onClick={() => void promptInstall()}>Install app</Button>
          </SectionCard>
        ) : null}
      </div>
    </div>
  )
}
