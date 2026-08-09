import { format, parseISO } from 'date-fns'
import {
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  Flame,
  GraduationCap,
  Layers,
  Lightbulb,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { PlanGate } from '@/components/plan-gate'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  useDeleteStudyPlan,
  useRenameStudyPlan,
  useSaveStudyPlan,
  useStudyPlans,
  useUpdateStudyPlan,
} from '@/features/ai/hooks'
import { DeletePlanDialog, PlanNameDialog, SavedPlansRail } from '@/features/ai/saved-plans'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { useCreateTask, useTasks } from '@/features/planner/hooks'
import { cn, formatMinutes } from '@/lib/utils'
import { aiService } from '@/services/ai-service'
import {
  type SaveStudyPlanInput,
  toSettings,
  toStudyPlan,
} from '@/services/study-plans-service'
import {
  BLOCK_MINUTE_BOUNDS,
  clampBlockMinutes,
  generateStudyPlan,
  reconcileDay,
  type StudyPlan,
  type StudyPlanDay,
} from '@/services/study-planner'
import type { SavedStudyPlan } from '@/types/models'

/** How much a ± tap moves a block, in minutes. */
const BLOCK_STEP = 15

interface ModuleTag {
  name: string
  color: string
}

// ── Day card ────────────────────────────────────────────────────────────────

function DayCard({
  day,
  capacityMinutes,
  moduleFor,
  onApply,
  applied,
  editing,
  onResizeBlock,
  onRemoveBlock,
}: {
  day: StudyPlanDay
  capacityMinutes: number
  moduleFor: (moduleId: string | null) => ModuleTag | undefined
  onApply: (day: StudyPlanDay) => void
  applied: boolean
  editing: boolean
  onResizeBlock: (dateKey: string, index: number, delta: number) => void
  onRemoveBlock: (dateKey: string, index: number) => void
}) {
  const date = parseISO(day.dateKey)
  const isToday = day.dateKey === format(new Date(), 'yyyy-MM-dd')
  const fill = capacityMinutes > 0 ? Math.min(100, (day.totalMinutes / capacityMinutes) * 100) : 0

  return (
    <Card
      className={cn(
        'gap-0 overflow-hidden py-0 transition-colors',
        isToday && 'border-primary/50',
        day.blocks.length === 0 && 'bg-muted/30',
      )}
    >
      <CardHeader className="gap-0 border-b px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {isToday ? 'Today' : format(date, 'EEEE')}
            </p>
            <p className="text-muted-foreground text-xs">{format(date, 'd MMM')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {day.heavy ? (
              <Badge variant="warning" title="Over 80% of your daily capacity">
                <Flame aria-hidden /> Heavy
              </Badge>
            ) : null}
            <span className="text-sm font-medium tabular-nums">
              {day.totalMinutes > 0 ? formatMinutes(day.totalMinutes) : '—'}
            </span>
          </div>
        </div>
        {/* Capacity meter — how full this day is against what you said you have. */}
        <div
          className="bg-muted mt-2.5 h-1.5 overflow-hidden rounded-full"
          role="img"
          aria-label={`${Math.round(fill)}% of your daily capacity`}
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width]',
              day.heavy ? 'bg-warning' : 'bg-primary',
            )}
            style={{ width: `${fill}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-2 px-4 py-3">
        {day.blocks.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
            No study blocks — recharge or get ahead.
          </p>
        ) : (
          <>
            {day.blocks.map((block, index) => {
              const module = moduleFor(block.moduleId)
              return (
                <div
                  key={`${block.assignmentId}-${index}`}
                  className="bg-card hover:border-primary/30 group relative rounded-lg border p-2.5 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-0.5 h-9 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: module?.color ?? 'var(--primary)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{block.title}</p>
                      {module ? (
                        <p className="text-muted-foreground truncate text-[11px]">{module.name}</p>
                      ) : null}
                      <p className="text-muted-foreground mt-0.5 text-xs">{block.reason}</p>
                    </div>
                    {editing ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${block.title} from ${format(date, 'd MMM')}`}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => onRemoveBlock(day.dateKey, index)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    ) : (
                      <Badge variant="secondary" className="mt-0.5 shrink-0 tabular-nums">
                        {formatMinutes(block.minutes)}
                      </Badge>
                    )}
                  </div>

                  {editing ? (
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Shorten ${block.title}`}
                        disabled={block.minutes <= BLOCK_MINUTE_BOUNDS.min}
                        onClick={() => onResizeBlock(day.dateKey, index, -BLOCK_STEP)}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <span className="w-14 text-center text-xs font-medium tabular-nums">
                        {formatMinutes(block.minutes)}
                      </span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Lengthen ${block.title}`}
                        disabled={block.minutes >= BLOCK_MINUTE_BOUNDS.max}
                        onClick={() => onResizeBlock(day.dateKey, index, BLOCK_STEP)}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {!editing ? (
              <Button
                variant={applied ? 'success' : 'outline'}
                size="sm"
                className="mt-auto w-full"
                disabled={applied}
                onClick={() => onApply(day)}
              >
                {applied ? <Check /> : <CalendarCheck />}
                {applied ? 'Added to planner' : 'Add day to planner'}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Settings ────────────────────────────────────────────────────────────────

interface PlannerSettings {
  /** Horizon in days. */
  horizon: number
  capacityMinutes: number
  /** 0–100; scaled to the engine's 0–1 stress level. */
  stress: number
}

const HORIZONS: { value: number; label: string }[] = [
  { value: 1, label: 'Today' },
  { value: 2, label: '2 days' },
  { value: 7, label: 'This week' },
  { value: 14, label: 'Two weeks' },
]

const SETTINGS_KEY = 'studentos.smart-plan.settings'
const DEFAULT_SETTINGS: PlannerSettings = { horizon: 7, capacityMinutes: 180, stress: 50 }

function loadSettings(): PlannerSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    // Spread over defaults so a stored blob from an older shape still loads.
    const stored = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PlannerSettings>) }
    // `horizon` was persisted as a string while it drove a <Select>.
    return { ...stored, horizon: Number(stored.horizon) || DEFAULT_SETTINGS.horizon }
  } catch {
    return DEFAULT_SETTINGS
  }
}

function saveSettings(settings: PlannerSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Private browsing or a full quota — planning still works, it just forgets.
  }
}

function stressLabel(stress: number): string {
  return stress < 34 ? 'Calm' : stress < 67 ? 'Steady' : 'Crunch time'
}

// ── Page ────────────────────────────────────────────────────────────────────

export function SmartPlanPage() {
  const { data: assignments = [] } = useAssignments()
  const { data: modules = [] } = useModules()
  const { data: tasks = [] } = useTasks()
  const { data: savedPlans = [] } = useStudyPlans()
  const createTask = useCreateTask()
  const savePlan = useSaveStudyPlan()
  const updatePlan = useUpdateStudyPlan()
  const renamePlan = useRenameStudyPlan()
  const deletePlan = useDeleteStudyPlan()

  const [settings, setSettings] = React.useState<PlannerSettings>(loadSettings)
  const { horizon, capacityMinutes, stress } = settings
  const [plan, setPlan] = React.useState<StudyPlan | null>(null)
  const [appliedDays, setAppliedDays] = React.useState<Set<string>>(new Set())
  const [applying, setApplying] = React.useState(false)
  /** Gemini-written notes for the current plan; null falls back to rule-based. */
  const [aiNotes, setAiNotes] = React.useState<string[] | null>(null)
  const [notesLoading, setNotesLoading] = React.useState(false)

  /** Which saved plan the schedule on screen came from, if any. */
  const [activeId, setActiveId] = React.useState<string | null>(null)
  /** Whether the schedule on screen differs from its saved row. */
  const [dirty, setDirty] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const [renameTarget, setRenameTarget] = React.useState<SavedStudyPlan | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<SavedStudyPlan | null>(null)

  const activePlan = savedPlans.find((saved) => saved.id === activeId) ?? null

  // A saved plan deleted on another device shouldn't leave this one pointing at
  // a row that no longer exists — keep the schedule, drop the link to it.
  React.useEffect(() => {
    if (activeId && !savedPlans.some((saved) => saved.id === activeId)) {
      setActiveId(null)
      setDirty(true)
    }
  }, [activeId, savedPlans])

  // Re-entering your real capacity every visit is friction; remember it.
  React.useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const moduleFor = React.useCallback(
    (moduleId: string | null): ModuleTag | undefined => {
      const module = modules.find((m) => m.id === moduleId)
      return module ? { name: module.name, color: module.color } : undefined
    },
    [modules],
  )

  const summary = React.useMemo(() => {
    if (!plan) return null
    return {
      totalMinutes: plan.days.reduce((sum, day) => sum + day.totalMinutes, 0),
      activeDays: plan.days.filter((day) => day.totalMinutes > 0).length,
      blocks: plan.days.reduce((sum, day) => sum + day.blocks.length, 0),
      assignmentsCovered: new Set(
        plan.days.flatMap((day) => day.blocks.map((block) => block.assignmentId)),
      ).size,
    }
  }, [plan])

  const unappliedDays = plan?.days.filter(
    (day) => day.blocks.length > 0 && !appliedDays.has(day.dateKey),
  )

  /** The current schedule + settings, in the shape the service persists. */
  function currentInput(name: string): SaveStudyPlanInput {
    return {
      name,
      horizonDays: horizon,
      dailyCapacityMinutes: capacityMinutes,
      stressLevel: stress,
      days: plan?.days ?? [],
      recommendations: plan?.recommendations ?? [],
      unscheduledMinutes: plan?.unscheduledMinutes ?? 0,
    }
  }

  function generate() {
    const next = generateStudyPlan(assignments, {
      horizonDays: horizon,
      dailyCapacityMinutes: capacityMinutes,
      stressLevel: stress / 100,
    })
    setPlan(next)
    setAppliedDays(new Set())
    setAiNotes(null)
    setEditing(false)
    // Regenerating replaces the schedule wholesale — if it came from a saved
    // plan, that plan now has unsaved changes.
    setDirty(Boolean(activeId))
    void loadNotes(next)
  }

  /** Load a saved plan back into the planner, settings and all. */
  function openSaved(saved: SavedStudyPlan) {
    const restored = toSettings(saved)
    setSettings({
      horizon: restored.horizonDays,
      capacityMinutes: restored.dailyCapacityMinutes,
      stress: restored.stressLevel,
    })
    setPlan(toStudyPlan(saved))
    setActiveId(saved.id)
    setAppliedDays(new Set())
    setAiNotes(null)
    setEditing(false)
    setDirty(false)
  }

  /**
   * Ask the coach to narrate the plan. The schedule above is already final —
   * this only adds guidance, and `getPlanNotes` resolves to null rather than
   * throwing, so a missing key or a dead network just leaves the rule-based
   * recommendations in place.
   */
  async function loadNotes(next: StudyPlan) {
    setNotesLoading(true)
    try {
      const notes = await aiService.getPlanNotes({
        horizonDays: horizon,
        dailyCapacityMinutes: capacityMinutes,
        stressLevel: stress / 100,
        unscheduledMinutes: next.unscheduledMinutes,
        days: next.days.map((day) => ({
          date: day.dateKey,
          minutes: day.totalMinutes,
          heavy: day.heavy,
          blocks: day.blocks.map((block) => ({
            title: block.title,
            minutes: block.minutes,
            reason: block.reason,
          })),
        })),
      })
      setAiNotes(notes)
    } finally {
      setNotesLoading(false)
    }
  }

  // ── Editing the generated schedule ────────────────────────────────────────

  /**
   * Apply an edit to one day. Work removed from a day is added back to
   * `unscheduledMinutes` rather than vanishing — the assignment still needs
   * those hours, and the summary should keep saying so.
   */
  function editDay(dateKey: string, mutate: (day: StudyPlanDay) => StudyPlanDay) {
    setPlan((current) => {
      if (!current) return current
      let minutesFreed = 0
      const days = current.days.map((day) => {
        if (day.dateKey !== dateKey) return day
        const next = mutate(day)
        minutesFreed = day.totalMinutes - next.totalMinutes
        return next
      })
      return {
        ...current,
        days,
        unscheduledMinutes: Math.max(0, current.unscheduledMinutes + minutesFreed),
      }
    })
    setDirty(true)
    // The day no longer matches what was pushed to the planner, so let it be
    // applied again — `applyDays` skips blocks that are already there.
    setAppliedDays((prev) => {
      if (!prev.has(dateKey)) return prev
      const next = new Set(prev)
      next.delete(dateKey)
      return next
    })
  }

  function resizeBlock(dateKey: string, index: number, delta: number) {
    editDay(dateKey, (day) =>
      reconcileDay(
        day,
        day.blocks.map((block, i) =>
          i === index ? { ...block, minutes: clampBlockMinutes(block.minutes + delta) } : block,
        ),
        capacityMinutes,
      ),
    )
  }

  function removeBlock(dateKey: string, index: number) {
    editDay(dateKey, (day) =>
      reconcileDay(
        day,
        day.blocks.filter((_, i) => i !== index),
        capacityMinutes,
      ),
    )
  }

  // ── Saving ────────────────────────────────────────────────────────────────

  async function handleSaveNew(name: string) {
    try {
      const created = await savePlan.mutateAsync(currentInput(name))
      setActiveId(created.id)
      setDirty(false)
      setSaveDialogOpen(false)
      toast.success(`“${created.name}” saved`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this plan')
    }
  }

  async function handleSaveChanges() {
    if (!activePlan) return
    try {
      await updatePlan.mutateAsync({ id: activePlan.id, input: currentInput(activePlan.name) })
      setDirty(false)
      toast.success(`“${activePlan.name}” updated`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save your changes')
    }
  }

  async function handleRename(name: string) {
    if (!renameTarget) return
    try {
      await renamePlan.mutateAsync({ id: renameTarget.id, name })
      setRenameTarget(null)
      toast.success('Plan renamed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not rename this plan')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const { id, name } = deleteTarget
    try {
      await deletePlan.mutateAsync(id)
      setDeleteTarget(null)
      if (activeId === id) {
        setActiveId(null)
        setDirty(Boolean(plan))
      }
      toast.success(`“${name}” deleted`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete this plan')
    }
  }

  /**
   * Materialize plan days as real planner tasks. Idempotent: a block whose
   * task already exists for that day is skipped, so applying a day twice — or
   * applying the whole plan after a single day — never duplicates work.
   */
  async function applyDays(days: StudyPlanDay[]) {
    const titlesByDay = new Map<string, Set<string>>()
    for (const task of tasks) {
      if (!task.scheduled_on) continue
      const set = titlesByDay.get(task.scheduled_on) ?? new Set<string>()
      set.add(task.title)
      titlesByDay.set(task.scheduled_on, set)
    }

    setApplying(true)
    let created = 0
    try {
      for (const day of days) {
        const existing = titlesByDay.get(day.dateKey) ?? new Set<string>()
        for (const block of day.blocks) {
          const title = `Study: ${block.title}`
          if (existing.has(title)) continue
          await createTask.mutateAsync({
            title,
            scheduled_on: day.dateKey,
            duration_minutes: block.minutes,
            estimated_minutes: block.minutes,
            priority: 'high',
            assignment_id: block.assignmentId,
            module_id: block.moduleId,
          })
          existing.add(title)
          created += 1
        }
      }
      setAppliedDays((prev) => new Set([...prev, ...days.map((day) => day.dateKey)]))
      toast.success(
        created > 0
          ? `${created} study block${created === 1 ? '' : 's'} added to your planner`
          : 'Those blocks are already in your planner',
      )
    } finally {
      setApplying(false)
    }
  }

  const stats = summary
    ? [
        { label: 'Planned study', value: formatMinutes(summary.totalMinutes), icon: Clock },
        { label: 'Study days', value: String(summary.activeDays), icon: CalendarDays },
        { label: 'Focus blocks', value: String(summary.blocks), icon: Layers },
        { label: 'Assignments', value: String(summary.assignmentsCovered), icon: GraduationCap },
      ]
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Smart Plan"
        description="StudentOS turns your assignments into a realistic study schedule"
        actions={
          plan ? (
            <Button variant="outline" onClick={generate}>
              <RefreshCw /> Regenerate
            </Button>
          ) : null
        }
      />

      <PlanGate
        feature="aiPlanner"
        title="The AI study planner is a Student Pro feature"
        description="Upgrade to turn your assignments into a day-by-day study schedule weighted by deadlines, grade impact and difficulty — then send it straight to your planner."
      >
        <SavedPlansRail
          plans={savedPlans}
          activeId={activeId}
          onOpen={openSaved}
          onRenameRequest={setRenameTarget}
          onDeleteRequest={setDeleteTarget}
        />

        {/* Plan settings */}
        <Card data-tour="plan-settings" className="gap-0 overflow-hidden py-0">
          <CardHeader className="from-primary/8 gap-1 border-b bg-gradient-to-r to-transparent px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                <Sparkles aria-hidden className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Plan settings</p>
                <p className="text-muted-foreground text-xs">
                  Deterministic and transparent — every block shows why it&rsquo;s there.
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 px-5 py-5">
            <div className="space-y-2">
              <Label>Plan for</Label>
              <div className="flex flex-wrap gap-1.5">
                {HORIZONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={horizon === option.value}
                    onClick={() => setSettings((s) => ({ ...s, horizon: option.value }))}
                    className={cn(
                      'focus-visible:ring-ring/60 inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2',
                      horizon === option.value
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'hover:bg-accent',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="plan-capacity">Daily study capacity</Label>
                  <span className="text-primary text-sm font-semibold tabular-nums">
                    {formatMinutes(capacityMinutes)}
                  </span>
                </div>
                <input
                  id="plan-capacity"
                  type="range"
                  min={60}
                  max={480}
                  step={30}
                  value={capacityMinutes}
                  onChange={(event) =>
                    setSettings((s) => ({ ...s, capacityMinutes: Number(event.target.value) }))
                  }
                  className="accent-primary h-2 w-full cursor-pointer"
                />
                <div className="text-muted-foreground flex justify-between text-[11px]">
                  <span>1h</span>
                  <span>8h</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="plan-stress">Stress level</Label>
                  <span className="text-primary text-sm font-semibold">{stressLabel(stress)}</span>
                </div>
                <input
                  id="plan-stress"
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={stress}
                  onChange={(event) =>
                    setSettings((s) => ({ ...s, stress: Number(event.target.value) }))
                  }
                  className="accent-primary h-2 w-full cursor-pointer"
                />
                <p className="text-muted-foreground text-[11px]">
                  Higher stress weights deadlines harder; calmer spreads work more evenly.
                </p>
              </div>
            </div>

            <Button onClick={generate} className="w-full sm:w-auto">
              {plan ? <RefreshCw /> : <Sparkles />}
              {plan ? 'Regenerate plan' : 'Generate my plan'}
            </Button>
          </CardContent>
        </Card>

        {plan ? (
          <>
            {/* Summary + the plan's own save / edit / delete controls */}
            <Card className="border-primary/25 bg-primary/5 gap-0 py-0">
              <CardContent className="space-y-4 px-5 py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">
                    {activePlan ? activePlan.name : 'Unsaved plan'}
                  </h2>
                  {activePlan ? (
                    dirty ? (
                      <Badge variant="warning">Unsaved changes</Badge>
                    ) : (
                      <Badge variant="success">
                        <Check aria-hidden /> Saved
                      </Badge>
                    )
                  ) : (
                    <Badge variant="muted">Not saved yet</Badge>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {stats.map((stat) => (
                    <div key={stat.label} className="flex items-start gap-2.5">
                      <span className="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
                        <stat.icon aria-hidden className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground text-xs">{stat.label}</dt>
                        <dd className="truncate text-lg leading-tight font-semibold">
                          {stat.value}
                        </dd>
                      </div>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    disabled={applying || !unappliedDays?.length}
                    onClick={() => void applyDays(unappliedDays ?? [])}
                  >
                    {applying ? <Loader2 className="animate-spin" /> : <CalendarCheck />}
                    {unappliedDays?.length
                      ? `Apply all ${unappliedDays.length} days`
                      : 'Whole plan applied'}
                  </Button>

                  {activePlan ? (
                    <Button
                      variant={dirty ? 'default' : 'outline'}
                      disabled={!dirty || updatePlan.isPending}
                      onClick={() => void handleSaveChanges()}
                    >
                      {updatePlan.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                      {dirty ? 'Save changes' : 'Saved'}
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
                      <Save /> Save plan
                    </Button>
                  )}

                  <Button
                    variant={editing ? 'secondary' : 'outline'}
                    onClick={() => setEditing((value) => !value)}
                  >
                    {editing ? <Check /> : <Pencil />}
                    {editing ? 'Done editing' : 'Edit blocks'}
                  </Button>

                  {activePlan ? (
                    <>
                      <Button variant="outline" onClick={() => setRenameTarget(activePlan)}>
                        <Pencil /> Rename
                      </Button>
                      <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
                        <Plus /> Save as copy
                      </Button>
                      <Button
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(activePlan)}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </>
                  ) : null}
                </div>

                {editing ? (
                  <p className="text-muted-foreground text-xs">
                    Adjust or drop blocks that don&rsquo;t fit your week. Time you remove goes back
                    to &ldquo;doesn&rsquo;t fit&rdquo; — the work still needs doing.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {notesLoading || plan.recommendations.length > 0 || aiNotes ? (
              <Card className="bg-secondary/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Lightbulb aria-hidden className="text-warning size-4" /> Coach notes
                    {aiNotes ? (
                      <Badge variant="secondary" className="gap-1">
                        <Sparkles aria-hidden className="size-3" /> AI
                      </Badge>
                    ) : null}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {notesLoading ? (
                    <p className="text-muted-foreground flex items-center gap-2 text-sm">
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                      Writing notes on your plan…
                    </p>
                  ) : (
                    <ul className="list-disc space-y-1.5 pl-5 text-sm">
                      {(aiNotes ?? plan.recommendations).map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {plan.days.map((day) => (
                <DayCard
                  key={day.dateKey}
                  day={day}
                  capacityMinutes={capacityMinutes}
                  moduleFor={moduleFor}
                  onApply={(d) => void applyDays([d])}
                  applied={appliedDays.has(day.dateKey)}
                  editing={editing}
                  onResizeBlock={resizeBlock}
                  onRemoveBlock={removeBlock}
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

        <PlanNameDialog
          open={saveDialogOpen}
          onOpenChange={setSaveDialogOpen}
          title={activePlan ? 'Save as a copy' : 'Save this plan'}
          description="Give it a name you'll recognise later — you can reopen, edit and re-apply it any time."
          submitLabel="Save plan"
          defaultName={
            activePlan ? `${activePlan.name} (copy)` : `${horizon}-day plan · ${format(new Date(), 'd MMM')}`
          }
          busy={savePlan.isPending}
          onSubmit={(name) => void handleSaveNew(name)}
        />

        <PlanNameDialog
          open={Boolean(renameTarget)}
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null)
          }}
          title="Rename plan"
          description="Only the name changes — the schedule stays exactly as it is."
          submitLabel="Save name"
          defaultName={renameTarget?.name ?? ''}
          busy={renamePlan.isPending}
          onSubmit={(name) => void handleRename(name)}
        />

        <DeletePlanDialog
          plan={deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          busy={deletePlan.isPending}
          onConfirm={() => void handleDelete()}
        />
      </PlanGate>
    </div>
  )
}
