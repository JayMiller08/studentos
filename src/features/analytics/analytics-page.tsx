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
import { Activity, CheckCircle2, Download, Gauge, GraduationCap, Sunrise, Timer } from 'lucide-react'
import * as React from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/page-header'
import { PlanGate } from '@/components/plan-gate'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { useStudySessions } from '@/features/focus/hooks'
import { useTasks } from '@/features/planner/hooks'
import { usePlan } from '@/hooks/use-plan'
import { clamp, formatMinutes, percent, toDateKey } from '@/lib/utils'
import {
  bestFocusWindow,
  computeFocusByHour,
  computeGradeTrend,
  computeModulePerformance,
  toCsv,
  weightedAverageGrade,
} from '@/services/analytics-service'
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
  const { data: modules = [] } = useModules()
  const { has } = usePlan()
  const advanced = has('advancedAnalytics')

  const now = new Date()
  const stats = React.useMemo(() => computeFocusStats(sessions), [sessions])

  // ── Advanced views ──────────────────────────────────────────────────────
  const modulePerformance = React.useMemo(
    () => computeModulePerformance(modules, assignments, sessions),
    [modules, assignments, sessions],
  )
  const focusByHour = React.useMemo(() => computeFocusByHour(sessions), [sessions])
  const peakWindow = React.useMemo(() => bestFocusWindow(focusByHour), [focusByHour])
  const gradeTrend = React.useMemo(() => computeGradeTrend(assignments), [assignments])
  const overallGrade = React.useMemo(() => weightedAverageGrade(assignments), [assignments])

  function exportCsv() {
    const csv = toCsv(
      modulePerformance.map((module) => ({
        module: module.name,
        code: module.code,
        focus_hours: Math.round((module.focusMinutes / 60) * 10) / 10,
        assignments: module.assignments,
        graded: module.graded,
        average_grade: module.averageGrade,
        minutes_per_grade_point: module.minutesPerPoint,
      })),
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `studentos-analytics-${toDateKey(now)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

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
      <PageHeader
        title="Analytics"
        description="Your study patterns, output and trends"
        actions={
          advanced ? (
            <Button variant="outline" onClick={exportCsv} disabled={modulePerformance.length === 0}>
              <Download /> Export CSV
            </Button>
          ) : undefined
        }
      />

      <div data-tour="analytics-stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

      <div data-tour="analytics-charts" className="grid gap-4 lg:grid-cols-2">
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
        title="Advanced analytics is a Student Pro feature"
        description="Unlock 8-week trends, per-module time-vs-grade breakdowns, your peak focus hours, grade trajectory and CSV export."
      >
        <div className="space-y-4">
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

        {/* Peak focus hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sunrise aria-hidden className="text-primary size-4" /> When you actually focus
            </CardTitle>
            <CardDescription>
              {peakWindow
                ? `Your strongest stretch is ${peakWindow.label} — ${formatMinutes(peakWindow.minutes)} logged there. Protect it for your hardest work.`
                : 'Log a few focus sessions and your peak hours will show up here.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={focusByHour} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  interval={2}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={{ fill: 'var(--accent)' }}
                  formatter={(value) => [formatMinutes(Number(value ?? 0)), 'Focus']}
                />
                <Bar dataKey="minutes" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Grade trajectory */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap aria-hidden className="text-primary size-4" /> Grade trajectory
            </CardTitle>
            <CardDescription>
              {overallGrade !== null
                ? `Weighted average ${overallGrade}% across ${gradeTrend.length} graded assignment${gradeTrend.length === 1 ? '' : 's'}. The line is your running average — individual marks are the dots.`
                : 'Record a grade on a submitted assignment to start tracking your average.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {gradeTrend.length === 0 ? (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                No grades captured yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={gradeTrend} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="title"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(title: string) =>
                      title.length > 12 ? `${title.slice(0, 12)}…` : title
                    }
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  {/* 50% is the pass mark at most SA institutions. */}
                  <ReferenceLine y={50} stroke="var(--destructive)" strokeDasharray="4 4" />
                  <Line
                    type="monotone"
                    dataKey="grade"
                    stroke="var(--chart-3)"
                    strokeWidth={0}
                    dot={{ r: 4, fill: 'var(--chart-3)' }}
                    name="Grade"
                  />
                  <Line
                    type="monotone"
                    dataKey="runningAverage"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    dot={false}
                    name="Running average"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Module breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where your time goes</CardTitle>
            <CardDescription>
              Focus logged against each module, next to the marks it earned
            </CardDescription>
          </CardHeader>
          <CardContent>
            {modulePerformance.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Add modules to your assignments to see this breakdown.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-125 text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-xs">
                      <th className="pb-2 text-left font-medium">Module</th>
                      <th className="pb-2 text-right font-medium">Focus</th>
                      <th className="pb-2 text-right font-medium">Graded</th>
                      <th className="pb-2 text-right font-medium">Average</th>
                      <th className="pb-2 text-right font-medium">Min / point</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modulePerformance.map((module) => (
                      <tr key={module.moduleId} className="border-b last:border-b-0">
                        <td className="py-2.5">
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: module.color }}
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{module.name}</span>
                              {module.code ? (
                                <span className="text-muted-foreground text-xs">{module.code}</span>
                              ) : null}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatMinutes(module.focusMinutes)}
                        </td>
                        <td className="text-muted-foreground py-2.5 text-right tabular-nums">
                          {module.graded}/{module.assignments}
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums">
                          {module.averageGrade === null ? '—' : `${module.averageGrade}%`}
                        </td>
                        <td className="text-muted-foreground py-2.5 text-right tabular-nums">
                          {module.minutesPerPoint === null ? '—' : module.minutesPerPoint}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </PlanGate>
    </div>
  )
}
