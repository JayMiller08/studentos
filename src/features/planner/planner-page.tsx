import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, Plus } from 'lucide-react'
import * as React from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useModules } from '@/features/assignments/hooks'
import { useCreateTask, useTasks, useUpdateTask } from '@/features/planner/hooks'
import { TaskFormDialog } from '@/features/planner/task-form-dialog'
import { TaskItem } from '@/features/planner/task-item'
import { cn, percent, toDateKey } from '@/lib/utils'
import type { Task } from '@/types/models'

type PlannerView = 'day' | 'week' | 'month'

const BACKLOG_ID = 'backlog'

function DroppableColumn({
  id,
  children,
  className,
}: {
  id: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(className, isOver && 'ring-primary/50 bg-primary/5 ring-2 rounded-xl')}
    >
      {children}
    </div>
  )
}

function QuickAdd({ dateKey }: { dateKey: string }) {
  const createTask = useCreateTask()
  const [title, setTitle] = React.useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    createTask.mutate({ title: trimmed, scheduled_on: dateKey })
    setTitle('')
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Quick add a task for this day…"
        aria-label="Quick add task"
      />
      <Button type="submit" size="icon" aria-label="Add task" disabled={createTask.isPending}>
        <Plus />
      </Button>
    </form>
  )
}

export function PlannerPage() {
  const { data: tasks = [] } = useTasks()
  const { data: modules = [] } = useModules()
  const updateTask = useUpdateTask()

  const [view, setView] = React.useState<PlannerView>('day')
  const [anchor, setAnchor] = React.useState<Date>(new Date())
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Task | null>(null)

  const moduleById = React.useMemo(
    () => new Map(modules.map((module) => [module.id, module])),
    [modules],
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const anchorKey = toDateKey(anchor)
  const dayTasks = tasks
    .filter((task) => task.scheduled_on === anchorKey)
    .sort((a, b) => (a.start_minutes ?? 9999) - (b.start_minutes ?? 9999))
  const backlogTasks = tasks.filter((task) => task.scheduled_on === null && task.status !== 'done')
  const dayDone = dayTasks.filter((task) => task.status === 'done').length
  const dayCompletion = percent(dayDone, dayTasks.length)

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(anchor, { weekStartsOn: 1 }) })

  const monthDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [anchor])

  function onDragEnd(event: DragEndEvent) {
    const task = event.active.data.current?.task as Task | undefined
    const overId = event.over?.id
    if (!task || typeof overId !== 'string') return
    if (overId === BACKLOG_ID) {
      if (task.scheduled_on !== null) {
        updateTask.mutate({ id: task.id, patch: { scheduled_on: null, start_minutes: null } })
      }
      return
    }
    if (overId.startsWith('day:')) {
      const dateKey = overId.slice(4)
      if (task.scheduled_on !== dateKey) {
        updateTask.mutate({ id: task.id, patch: { scheduled_on: dateKey } })
      }
    }
  }

  function navigate(direction: -1 | 1) {
    if (view === 'day') setAnchor(direction === 1 ? addDays(anchor, 1) : subDays(anchor, 1))
    else if (view === 'week') setAnchor(direction === 1 ? addDays(anchor, 7) : subDays(anchor, 7))
    else setAnchor(direction === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1))
  }

  function openEdit(task: Task) {
    setEditing(task)
    setFormOpen(true)
  }

  const rangeLabel =
    view === 'day'
      ? format(anchor, 'EEEE, d MMMM')
      : view === 'week'
        ? `${format(weekStart, 'd MMM')} – ${format(addDays(weekStart, 6), 'd MMM yyyy')}`
        : format(anchor, 'MMMM yyyy')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planner"
        description="Time-block your days; drag tasks to reschedule"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus /> New task
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(value) => setView(value as PlannerView)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous" onClick={() => navigate(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Next" onClick={() => navigate(1)}>
            <ChevronRight />
          </Button>
          <span className="text-muted-foreground ml-2 hidden text-sm font-medium sm:inline">
            {rangeLabel}
          </span>
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        {view === 'day' ? (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{format(anchor, 'EEEE, d MMMM')}</span>
                  <span className="text-muted-foreground text-sm font-normal">
                    {dayDone}/{dayTasks.length} done
                  </span>
                </CardTitle>
                {dayTasks.length > 0 ? (
                  <Progress value={dayCompletion} className="h-1.5" aria-label="Day completion" />
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                <QuickAdd dateKey={anchorKey} />
                <DroppableColumn id={`day:${anchorKey}`} className="min-h-24 space-y-2 pb-1">
                  {dayTasks.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                      Nothing planned — add a task or drag one from the backlog.
                    </p>
                  ) : (
                    dayTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        module={task.module_id ? moduleById.get(task.module_id) : undefined}
                        onEdit={openEdit}
                        draggable
                      />
                    ))
                  )}
                </DroppableColumn>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Inbox aria-hidden className="text-muted-foreground size-4" /> Backlog
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DroppableColumn id={BACKLOG_ID} className="min-h-24 space-y-2 pb-1">
                  {backlogTasks.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                      Backlog is clear 🎉
                    </p>
                  ) : (
                    backlogTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        module={task.module_id ? moduleById.get(task.module_id) : undefined}
                        onEdit={openEdit}
                        draggable
                        compact
                      />
                    ))
                  )}
                </DroppableColumn>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {view === 'week' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {weekDays.map((day) => {
              const dayKey = toDateKey(day)
              const items = tasks
                .filter((task) => task.scheduled_on === dayKey)
                .sort((a, b) => (a.start_minutes ?? 9999) - (b.start_minutes ?? 9999))
              return (
                <DroppableColumn key={dayKey} id={`day:${dayKey}`} className="flex flex-col">
                  <div
                    className={cn(
                      'mb-2 flex items-baseline justify-between rounded-lg px-2 py-1',
                      isToday(day) && 'bg-primary/10',
                    )}
                  >
                    <span className={cn('text-sm font-semibold', isToday(day) && 'text-primary')}>
                      {format(day, 'EEE d')}
                    </span>
                    <span className="text-muted-foreground text-xs">{items.length}</span>
                  </div>
                  <div className="min-h-28 flex-1 space-y-2">
                    {items.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        module={task.module_id ? moduleById.get(task.module_id) : undefined}
                        onEdit={openEdit}
                        draggable
                        compact
                      />
                    ))}
                  </div>
                </DroppableColumn>
              )
            })}
          </div>
        ) : null}

        {view === 'week' && backlogTasks.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays aria-hidden className="text-muted-foreground size-4" /> Backlog —
                drag onto a day
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {backlogTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    module={task.module_id ? moduleById.get(task.module_id) : undefined}
                    onEdit={openEdit}
                    draggable
                    compact
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </DndContext>

      {view === 'month' ? (
        <Card>
          <CardContent className="pt-1">
            <div className="text-muted-foreground grid grid-cols-7 gap-1 pb-2 text-center text-xs font-medium">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthDays.map((day) => {
                const dayKey = toDateKey(day)
                const items = tasks.filter((task) => task.scheduled_on === dayKey)
                const done = items.filter((task) => task.status === 'done').length
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => {
                      setAnchor(day)
                      setView('day')
                    }}
                    aria-label={`Open ${format(day, 'd MMMM')} — ${items.length} tasks`}
                    className={cn(
                      'hover:bg-accent flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border text-sm transition-colors sm:aspect-auto sm:min-h-16',
                      !isSameMonth(day, anchor) && 'text-muted-foreground/40 border-transparent',
                      isSameDay(day, new Date()) && 'border-primary text-primary font-semibold',
                    )}
                  >
                    <span>{format(day, 'd')}</span>
                    {items.length > 0 ? (
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-[10px] font-medium',
                          done === items.length
                            ? 'bg-success/15 text-success'
                            : 'bg-primary/10 text-primary',
                        )}
                      >
                        {done}/{items.length}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Plan your first day"
          description="Add tasks with a time and duration — StudentOS shows you exactly what's next."
          action={
            <Button
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus /> Add a task
            </Button>
          }
        />
      ) : null}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={editing}
        defaultDate={anchorKey}
      />
    </div>
  )
}
