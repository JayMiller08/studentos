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
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/page-header'
import { PlanGate } from '@/components/plan-gate'
import { Button } from '@/components/ui/button'
import { ChartCard } from '@/components/ui/chart-card'
import { SectionCard } from '@/components/ui/section-card'
import { StatTile } from '@/components/ui/stat-tile'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { useStudySessions } from '@/features/focus/hooks'
import { useTasks } from '@/features/planner/hooks'
import { usePlan } from '@/hooks/use-plan'
import { CHART_AXIS, CHART_GRID, CHART_TOOLTIP_STYLE, PLOT_MARGIN } from '@/lib/chart-theme'
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
        <StatTile
          icon={Gauge}
          label="Productivity score"
          value={productivityScore}
          hint="Consistency + completion, last 2 weeks"
          tone="primary"
        />
        <StatTile icon={Timer} label="Focus this month" value={formatMinutes(stats.monthMinutes)} />
        <StatTile
          icon={CheckCircle2}
          label="Assignment completion"
          value={`${completionRate}%`}
          hint={`${completedAssignments}/${assignments.length} finished`}
          tone="success"
        />
        <StatTile
          icon={Activity}
          label="Tasks completed"
          value={doneTasks}
          hint={`${taskRate}% of all tasks`}
        />
      </div>

      <div data-tour="analytics-charts" className="grid gap-4 lg:grid-cols-2">
        <ChartCard icon={Timer} title="Daily focus — last 30 days" description="Minutes of logged focus per day">
          <AreaChart data={dailyFocus} margin={PLOT_MARGIN}>
            <defs>
              <linearGradient id="focusFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...CHART_GRID} />
            <XAxis dataKey="day" {...CHART_AXIS} interval={6} />
            <YAxis {...CHART_AXIS} />
            <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} />
            <Area
              type="monotone"
              dataKey="minutes"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#focusFill)"
            />
          </AreaChart>
        </ChartCard>

        <ChartCard
          icon={CheckCircle2}
          title="Assignment pipeline"
          description="Where your assignments stand"
          empty={assignmentStatus.length === 0 ? 'Add assignments to see your pipeline.' : undefined}
        >
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
        </ChartCard>
      </div>

      <PlanGate
        feature="advancedAnalytics"
        title="Advanced analytics is a Student Pro feature"
        description="Unlock 8-week trends, per-module time-vs-grade breakdowns, your peak focus hours, grade trajectory and CSV export."
      >
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard icon={Timer} title="Study hours — weekly trend" description="Last 8 weeks">
              <BarChart data={weekly} margin={PLOT_MARGIN}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="week" {...CHART_AXIS} />
                <YAxis {...CHART_AXIS} />
                <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'var(--accent)' }} />
                <Bar dataKey="hours" fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ChartCard>

            <ChartCard icon={Activity} title="Tasks completed — weekly trend" description="Last 8 weeks">
              <BarChart data={weekly} margin={PLOT_MARGIN}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="week" {...CHART_AXIS} />
                <YAxis {...CHART_AXIS} allowDecimals={false} />
                <ChartTooltip contentStyle={CHART_TOOLTIP_STYLE} cursor={{ fill: 'var(--accent)' }} />
                <Bar dataKey="tasks" fill="var(--chart-3)" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ChartCard>
          </div>

          {/* Peak focus hours */}
          <ChartCard
            height={224}
            icon={Sunrise}
            title="When you actually focus"
            description={
              peakWindow
                ? `Your strongest stretch is ${peakWindow.label} — ${formatMinutes(peakWindow.minutes)} logged there. Protect it for your hardest work.`
                : 'Log a few focus sessions and your peak hours will show up here.'
            }
          >
            <BarChart data={focusByHour} margin={PLOT_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis dataKey="label" {...CHART_AXIS} interval={2} />
              <YAxis {...CHART_AXIS} />
              <ChartTooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                cursor={{ fill: 'var(--accent)' }}
                formatter={(value) => [formatMinutes(Number(value ?? 0)), 'Focus']}
              />
              <Bar dataKey="minutes" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          {/* Grade trajectory */}
          <ChartCard
            icon={GraduationCap}
            title="Grade trajectory"
            description={
              overallGrade !== null
                ? `Weighted average ${overallGrade}% across ${gradeTrend.length} graded assignment${gradeTrend.length === 1 ? '' : 's'}. The line is your running average — individual marks are the dots.`
                : 'Record a grade on a submitted assignment to start tracking your average.'
            }
            empty={gradeTrend.length === 0 ? 'No grades captured yet' : undefined}
          >
            <LineChart data={gradeTrend} margin={PLOT_MARGIN}>
              <CartesianGrid {...CHART_GRID} />
              <XAxis
                dataKey="title"
                {...CHART_AXIS}
                tickFormatter={(title: string) =>
                  title.length > 12 ? `${title.slice(0, 12)}…` : title
                }
              />
              <YAxis domain={[0, 100]} {...CHART_AXIS} />
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
          </ChartCard>

          {/* Module breakdown */}
          <SectionCard
            title="Where your time goes"
            description="Focus logged against each module, next to the marks it earned"
            flush={modulePerformance.length > 0}
          >
            {modulePerformance.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Add modules to your assignments to see this breakdown.
              </p>
            ) : (
              <Table className="min-w-125">
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead className="text-right">Focus</TableHead>
                    <TableHead className="text-right">Graded</TableHead>
                    <TableHead className="text-right">Average</TableHead>
                    <TableHead className="text-right">Min / point</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modulePerformance.map((module) => (
                    <TableRow key={module.moduleId}>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinutes(module.focusMinutes)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {module.graded}/{module.assignments}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {module.averageGrade === null ? '—' : `${module.averageGrade}%`}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {module.minutesPerPoint === null ? '—' : module.minutesPerPoint}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>
      </PlanGate>
    </div>
  )
}
