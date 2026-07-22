import { format, parseISO } from 'date-fns'
import { CalendarCheck, Lightbulb, RefreshCw, Sparkles } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { PlanGate } from '@/components/plan-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { useCreateTask, useTasks } from '@/features/planner/hooks'
import { formatMinutes } from '@/lib/utils'
import { generateStudyPlan, type StudyPlan, type StudyPlanDay } from '@/services/study-planner'

function DayCard({
  day,
  moduleColor,
  onApply,
  applied,
}: {
  day: StudyPlanDay
  moduleColor: (moduleId: string | null) => string | undefined
  onApply: (day: StudyPlanDay) => void
  applied: boolean
}) {
  const date = parseISO(day.dateKey)
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{format(date, 'EEEE, d MMM')}</CardTitle>
          <span className="text-muted-foreground text-xs">
            {day.totalMinutes > 0 ? formatMinutes(day.totalMinutes) : 'Rest day'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        {day.blocks.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
            No study blocks — recharge or get ahead.
          </p>
        ) : (
          <>
            {day.blocks.map((block, index) => (
              <div
                key={`${block.assignmentId}-${index}`}
                className="flex items-center gap-2.5 rounded-lg border p-2.5"
              >
                <span
                  aria-hidden
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: moduleColor(block.moduleId) ?? 'var(--primary)' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{block.title}</p>
                  <p className="text-muted-foreground text-xs">{block.reason}</p>
                </div>
                <Badge variant="secondary">{formatMinutes(block.minutes)}</Badge>
              </div>
            ))}
            <Button
              variant={applied ? 'success' : 'outline'}
              size="sm"
              className="w-full"
              disabled={applied}
              onClick={() => onApply(day)}
            >
              <CalendarCheck /> {applied ? 'Added to planner' : 'Add day to planner'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function SmartPlanPage() {
  const { data: assignments = [] } = useAssignments()
  const { data: modules = [] } = useModules()
  const { data: tasks = [] } = useTasks()
  const createTask = useCreateTask()

  const [horizon, setHorizon] = React.useState('7')
  const [capacityMinutes, setCapacityMinutes] = React.useState(180)
  const [stress, setStress] = React.useState(50)
  const [plan, setPlan] = React.useState<StudyPlan | null>(null)
  const [appliedDays, setAppliedDays] = React.useState<Set<string>>(new Set())

  const moduleColor = React.useCallback(
    (moduleId: string | null) => modules.find((m) => m.id === moduleId)?.color,
    [modules],
  )

  function generate() {
    setPlan(
      generateStudyPlan(assignments, {
        horizonDays: Number(horizon),
        dailyCapacityMinutes: capacityMinutes,
        stressLevel: stress / 100,
      }),
    )
    setAppliedDays(new Set())
  }

  async function applyDay(day: StudyPlanDay) {
    // Skip blocks already materialized for that day (idempotent apply).
    const existingTitles = new Set(
      tasks.filter((t) => t.scheduled_on === day.dateKey).map((t) => t.title),
    )
    let created = 0
    for (const block of day.blocks) {
      const title = `Study: ${block.title}`
      if (existingTitles.has(title)) continue
      await createTask.mutateAsync({
        title,
        scheduled_on: day.dateKey,
        duration_minutes: block.minutes,
        estimated_minutes: block.minutes,
        priority: 'high',
        assignment_id: block.assignmentId,
        module_id: block.moduleId,
      })
      created += 1
    }
    setAppliedDays((prev) => new Set(prev).add(day.dateKey))
    toast.success(
      created > 0
        ? `${created} study block${created === 1 ? '' : 's'} added to your planner`
        : 'Those blocks are already in your planner',
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Smart Plan"
        description="StudentOS turns your assignments into a realistic study schedule"
      />

      <PlanGate
        feature="smartPrioritization"
        title="Smart planning is a Student Pro feature"
        description="Upgrade to generate day-by-day study schedules from your assignments, weighted by deadlines, grade impact and difficulty."
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles aria-hidden className="text-primary size-4" /> Plan settings
            </CardTitle>
            <CardDescription>
              Deterministic and transparent — every block shows why it's there.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="plan-horizon">Plan for</Label>
              <Select value={horizon} onValueChange={setHorizon}>
                <SelectTrigger id="plan-horizon" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Today</SelectItem>
                  <SelectItem value="2">Today + tomorrow</SelectItem>
                  <SelectItem value="7">This week</SelectItem>
                  <SelectItem value="14">Two weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-capacity">
                Daily study capacity: {formatMinutes(capacityMinutes)}
              </Label>
              <input
                id="plan-capacity"
                type="range"
                min={60}
                max={480}
                step={30}
                value={capacityMinutes}
                onChange={(event) => setCapacityMinutes(Number(event.target.value))}
                className="accent-primary h-2 w-full cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-stress">
                Stress level: {stress < 34 ? 'Calm' : stress < 67 ? 'Steady' : 'Crunch time'}
              </Label>
              <input
                id="plan-stress"
                type="range"
                min={0}
                max={100}
                step={10}
                value={stress}
                onChange={(event) => setStress(Number(event.target.value))}
                className="accent-primary h-2 w-full cursor-pointer"
              />
              <p className="text-muted-foreground text-xs">
                Higher stress weights deadlines harder; calmer spreads work more evenly.
              </p>
            </div>
            <div className="sm:col-span-3">
              <Button onClick={generate}>
                {plan ? <RefreshCw /> : <Sparkles />} {plan ? 'Regenerate plan' : 'Generate my plan'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {plan ? (
          <>
            {plan.recommendations.length > 0 ? (
              <Card className="bg-secondary/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lightbulb aria-hidden className="text-warning size-4" /> Coach notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1.5 pl-5 text-sm">
                    {plan.recommendations.map((recommendation) => (
                      <li key={recommendation}>{recommendation}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {plan.days.map((day) => (
                <DayCard
                  key={day.dateKey}
                  day={day}
                  moduleColor={moduleColor}
                  onApply={(d) => void applyDay(d)}
                  applied={appliedDays.has(day.dateKey)}
                />
              ))}
            </div>
          </>
        ) : assignments.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Add assignments first"
            description="The planner schedules real work — add an assignment with a deadline and estimated time, then generate your plan."
            action={
              <Button asChild>
                <Link to="/app/assignments">Go to assignments</Link>
              </Button>
            }
          />
        ) : null}
      </PlanGate>
    </div>
  )
}
