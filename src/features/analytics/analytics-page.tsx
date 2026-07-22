import {
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfWeek,
  format,
  isSameWeek,
  isWithinInterval,
  parseISO,
  subDays,
  subWeeks,
} from 'date-fns'
import { Activity, CheckCircle2, Gauge, Timer } from 'lucide-react'
import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/page-header'
import { PlanGate } from '@/components/plan-gate'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAssignments } from '@/features/assignments/hooks'
import { useStudySessions } from '@/features/focus/hooks'
import { useTasks } from '@/features/planner/hooks'
import { clamp, formatMinutes, percent, toDateKey } from '@/lib/utils'
import { computeFocusStats } from '@/services/focus-service'

const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  color: 'var(--popover-foreground)',
  fontSize: '12px',
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Timer
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1">
        <Icon aria-hidden className="text-primary size-4" />
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-muted-foreground text-xs">{label}</p>
        {hint ? <p className="text-muted-foreground/70 text-[11px]">{hint}</p> : null}
      </CardContent>
    </Card>
  )
}

export function AnalyticsPage() {
  const { data: sessions = [] } = useStudySessions()
  const { data: tasks = [] } = useTasks()
  const { data: assignments = [] } = useAssignments()

  const now = new Date()
  const stats = React.useMemo(() => computeFocusStats(sessions), [sessions])

  // Daily focus minutes, last 30 days.
  const dailyFocus = React.useMemo(() => {
    const days = eachDayOfInterval({ start: subDays(now, 29), end: now })
    const byDay = new Map<string, number>()
    for (const session of sessions) {
      const key = toDateKey(parseISO(session.started_at))
      byDay.set(key, (byDay.get(key) ?? 0) + session.minutes)
    }
    return days.map((day) => ({
      day: format(day, 'd MMM'),
      minutes: byDay.get(toDateKey(day)) ?? 0,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions])

  // Weekly hours + completed tasks, last 8 weeks.
  const weekly = React.useMemo(() => {
    const weeks = eachWeekOfInterval(
      { start: subWeeks(now, 7), end: now },
      { weekStartsOn: 1 },
    )
    return weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
      const minutes = sessions
        .filter((session) =>
          isSameWeek(parseISO(session.started_at), weekStart, { weekStartsOn: 1 }),
        )
        .reduce((sum, session) => sum + session.minutes, 0)
      const completedTasks = tasks.filter(
        (task) =>
          task.completed_at &&
          isWithinInterval(parseISO(task.completed_at), { start: weekStart, end: weekEnd }),
      ).length
      return {
        week: format(weekStart, 'd MMM'),
        hours: Math.round((minutes / 60) * 10) / 10,
        tasks: completedTasks,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, tasks])

  const assignmentStatus = React.useMemo(() => {
    const buckets = [
      { name: 'Not started', key: 'not_started', color: 'var(--muted-foreground)' },
      { name: 'In progress', key: 'in_progress', color: 'var(--chart-1)' },
      { name: 'Submitted', key: 'submitted', color: 'var(--chart-2)' },
      { name: 'Graded', key: 'graded', color: 'var(--chart-3)' },
    ]
    return buckets
      .map((bucket) => ({
        ...bucket,
        value: assignments.filter((assignment) => assignment.status === bucket.key).length,
      }))
      .filter((bucket) => bucket.value > 0)
  }, [assignments])

  const completedAssignments = assignments.filter(
    (a) => a.status === 'submitted' || a.status === 'graded',
  ).length
  const completionRate = percent(completedAssignments, assignments.length)

  const doneTasks = tasks.filter((task) => task.status === 'done').length
  const taskRate = percent(doneTasks, tasks.length)

  // Productivity score: blend of focus consistency, task completion and
  // assignment completion — a single, explainable health number.
  const productivityScore = React.useMemo(() => {
    const activeDaysLast14 = new Set(
      sessions
        .filter((s) => parseISO(s.started_at) >= subDays(now, 14) && s.minutes > 0)
        .map((s) => toDateKey(parseISO(s.started_at))),
    ).size
    const consistency = clamp(activeDaysLast14 / 10, 0, 1)
    return Math.round(
      (0.4 * consistency + 0.3 * (taskRate / 100) + 0.3 * (completionRate / 100)) * 100,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, taskRate, completionRate])

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics" description="Your study patterns, output and trends" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Gauge}
          label="Productivity score"
          value={String(productivityScore)}
          hint="Consistency + completion, last 2 weeks"
        />
        <StatCard icon={Timer} label="Focus this month" value={formatMinutes(stats.monthMinutes)} />
        <StatCard
          icon={CheckCircle2}
          label="Assignment completion"
          value={`${completionRate}%`}
          hint={`${completedAssignments}/${assignments.length} finished`}
        />
        <StatCard
          icon={Activity}
          label="Tasks completed"
          value={String(doneTasks)}
          hint={`${taskRate}% of all tasks`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily focus — last 30 days</CardTitle>
            <CardDescription>Minutes of logged focus per day</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyFocus} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="focusFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  interval={6}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#focusFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment pipeline</CardTitle>
            <CardDescription>Where your assignments stand</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {assignmentStatus.length === 0 ? (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                Add assignments to see your pipeline.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={assignmentStatus}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {assignmentStatus.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <PlanGate
        feature="advancedAnalytics"
        title="Weekly trends are a Student Pro feature"
        description="See 8-week study-hour and task-throughput trends, spot slumps early and keep your semester on track."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Study hours — weekly trend</CardTitle>
              <CardDescription>Last 8 weeks</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'var(--accent)' }} />
                  <Bar dataKey="hours" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tasks completed — weekly trend</CardTitle>
              <CardDescription>Last 8 weeks</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'var(--accent)' }} />
                  <Bar dataKey="tasks" fill="var(--chart-3)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </PlanGate>
    </div>
  )
}
