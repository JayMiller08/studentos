import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  setHours,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { CalendarPlus, ChevronLeft, ChevronRight, GraduationCap, MapPin } from 'lucide-react'
import * as React from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAssignments } from '@/features/assignments/hooks'
import { EventFormDialog } from '@/features/calendar/event-form-dialog'
import { useCalendarEvents, useUpdateEvent } from '@/features/calendar/hooks'
import {
  assignmentOccurrences,
  calendarService,
  type EventOccurrence,
} from '@/services/calendar-service'
import { cn, formatDueDistance, toDateKey } from '@/lib/utils'
import type { CalendarEvent } from '@/types/models'

type CalendarView = 'month' | 'week' | 'exams'

const TYPE_STYLES: Record<EventOccurrence['event_type'], string> = {
  class: 'bg-primary/12 text-primary',
  exam: 'bg-destructive/12 text-destructive',
  event: 'bg-secondary text-secondary-foreground',
  study_block: 'bg-success/12 text-success',
  deadline: 'bg-warning/15 text-warning-foreground dark:text-warning',
}

function EventChip({
  occurrence,
  onClick,
  draggable,
}: {
  occurrence: EventOccurrence
  onClick?: () => void
  draggable?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: occurrence.occurrenceKey,
    data: { occurrence },
    // Only single (non-recurring) real events can be dragged to a new day.
    disabled: !draggable || occurrence.isRecurring || occurrence.event_type === 'deadline',
  })

  const style = occurrence.color
    ? { backgroundColor: `color-mix(in oklab, ${occurrence.color} 14%, transparent)`, color: occurrence.color }
    : undefined

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Translate.toString(transform), ...style }}
      className={cn(
        'w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] leading-4 font-medium transition-shadow',
        !style && TYPE_STYLES[occurrence.event_type],
        isDragging && 'z-50 opacity-80 shadow-lg',
      )}
      aria-label={`${occurrence.title}, ${format(occurrence.starts_at, 'd MMMM HH:mm')}`}
    >
      {!occurrence.all_day && occurrence.event_type !== 'deadline'
        ? `${format(occurrence.starts_at, 'HH:mm')} `
        : occurrence.event_type === 'deadline'
          ? '⚑ '
          : ''}
      {occurrence.title}
    </button>
  )
}

function DroppableDay({
  day,
  children,
  className,
  onDoubleClick,
}: {
  day: Date
  children: React.ReactNode
  className?: string
  onDoubleClick?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cal-day:${toDateKey(day)}` })
  return (
    <div
      ref={setNodeRef}
      onDoubleClick={onDoubleClick}
      className={cn(className, isOver && 'ring-primary/50 ring-2')}
    >
      {children}
    </div>
  )
}

export function CalendarPage() {
  const { data: events = [] } = useCalendarEvents()
  const { data: assignments = [] } = useAssignments()
  const updateEvent = useUpdateEvent()

  const [view, setView] = React.useState<CalendarView>('month')
  const [anchor, setAnchor] = React.useState(new Date())
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CalendarEvent | null>(null)
  const [defaultStart, setDefaultStart] = React.useState<Date | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const eventById = React.useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  const monthStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })
  const monthEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(anchor, { weekStartsOn: 1 }),
  })

  const rangeStart = view === 'week' ? weekStart : monthStart
  const rangeEnd = view === 'week' ? endOfWeek(anchor, { weekStartsOn: 1 }) : monthEnd

  const occurrences = React.useMemo(() => {
    const expanded = calendarService.expandForRange(events, rangeStart, rangeEnd)
    const deadlines = assignmentOccurrences(assignments, rangeStart, rangeEnd)
    return [...expanded, ...deadlines].sort(
      (a, b) => a.starts_at.getTime() - b.starts_at.getTime(),
    )
  }, [events, assignments, rangeStart, rangeEnd])

  const byDay = React.useMemo(() => {
    const map = new Map<string, EventOccurrence[]>()
    for (const occurrence of occurrences) {
      const key = toDateKey(occurrence.starts_at)
      const list = map.get(key) ?? []
      list.push(occurrence)
      map.set(key, list)
    }
    return map
  }, [occurrences])

  const upcomingExams = React.useMemo(() => {
    const now = startOfDay(new Date())
    const horizon = addDays(now, 120)
    return calendarService
      .expandForRange(events, now, horizon)
      .filter((occurrence) => occurrence.event_type === 'exam')
      .slice(0, 12)
  }, [events])

  function onDragEnd(event: DragEndEvent) {
    const occurrence = event.active.data.current?.occurrence as EventOccurrence | undefined
    const overId = event.over?.id
    if (!occurrence || typeof overId !== 'string' || !overId.startsWith('cal-day:')) return
    const targetDay = parseISO(overId.slice(8))
    const source = eventById.get(occurrence.sourceId)
    if (!source) return

    const starts = parseISO(source.starts_at)
    const ends = parseISO(source.ends_at)
    const dayShift = differenceInCalendarDays(targetDay, starts)
    if (dayShift === 0) return
    updateEvent.mutate({
      id: source.id,
      patch: {
        starts_at: addDays(starts, dayShift).toISOString(),
        ends_at: addDays(ends, dayShift).toISOString(),
      },
    })
  }

  function openCreate(start?: Date) {
    setEditing(null)
    setDefaultStart(start ?? setHours(anchor, 9))
    setFormOpen(true)
  }

  function openOccurrence(occurrence: EventOccurrence) {
    if (occurrence.event_type === 'deadline') return
    const source = eventById.get(occurrence.sourceId)
    if (source) {
      setEditing(source)
      setFormOpen(true)
    }
  }

  const rangeLabel = view === 'week'
    ? `${format(weekStart, 'd MMM')} – ${format(addDays(weekStart, 6), 'd MMM yyyy')}`
    : format(anchor, 'MMMM yyyy')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Classes, exams, deadlines and study blocks in one place"
        actions={
          <Button onClick={() => openCreate()}>
            <CalendarPlus /> New event
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(value) => setView(value as CalendarView)}>
          <TabsList>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="exams">Exams</TabsTrigger>
          </TabsList>
        </Tabs>
        {view !== 'exams' ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous"
              onClick={() =>
                setAnchor(view === 'week' ? addDays(anchor, -7) : subMonths(anchor, 1))
              }
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next"
              onClick={() => setAnchor(view === 'week' ? addDays(anchor, 7) : addMonths(anchor, 1))}
            >
              <ChevronRight />
            </Button>
            <span className="text-muted-foreground ml-2 hidden text-sm font-medium sm:inline">
              {rangeLabel}
            </span>
          </div>
        ) : null}
      </div>

      {view === 'month' ? (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <Card className="py-3">
            <CardContent className="px-3">
              <div className="text-muted-foreground grid grid-cols-7 gap-1 pb-2 text-center text-xs font-medium">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                  <div key={label}>{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((day) => {
                  const items = byDay.get(toDateKey(day)) ?? []
                  return (
                    <DroppableDay
                      key={toDateKey(day)}
                      day={day}
                      onDoubleClick={() => openCreate(setHours(day, 9))}
                      className={cn(
                        'flex min-h-20 flex-col gap-1 rounded-lg border p-1.5 sm:min-h-24',
                        !isSameMonth(day, anchor) && 'bg-muted/40 border-transparent',
                      )}
                    >
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isToday(day)
                            ? 'bg-primary text-primary-foreground inline-flex size-5 items-center justify-center rounded-full'
                            : 'text-muted-foreground',
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        {items.slice(0, 3).map((occurrence) => (
                          <EventChip
                            key={occurrence.occurrenceKey}
                            occurrence={occurrence}
                            draggable
                            onClick={() => openOccurrence(occurrence)}
                          />
                        ))}
                        {items.length > 3 ? (
                          <span className="text-muted-foreground px-1 text-[10px]">
                            +{items.length - 3} more
                          </span>
                        ) : null}
                      </div>
                    </DroppableDay>
                  )
                })}
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                Tip: double-click a day to add an event; drag one-off events to move them.
              </p>
            </CardContent>
          </Card>
        </DndContext>
      ) : null}

      {view === 'week' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {weekDays.map((day) => {
            const items = byDay.get(toDateKey(day)) ?? []
            return (
              <Card key={toDateKey(day)} className={cn('gap-2 py-3', isToday(day) && 'border-primary/50')}>
                <CardHeader className="px-3">
                  <CardTitle className={cn('text-sm', isToday(day) && 'text-primary')}>
                    {format(day, 'EEE d MMM')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 px-3">
                  {items.length === 0 ? (
                    <p className="text-muted-foreground text-xs">Free</p>
                  ) : (
                    items.map((occurrence) => (
                      <div key={occurrence.occurrenceKey} className="space-y-0.5">
                        <EventChip
                          occurrence={occurrence}
                          onClick={() => openOccurrence(occurrence)}
                        />
                        {occurrence.location ? (
                          <p className="text-muted-foreground flex items-center gap-1 px-1 text-[10px]">
                            <MapPin aria-hidden className="size-2.5" /> {occurrence.location}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : null}

      {view === 'exams' ? (
        upcomingExams.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No exams scheduled"
            description='Add events with type "Exam" and they will line up here with countdowns.'
            action={
              <Button onClick={() => openCreate()}>
                <CalendarPlus /> Add an exam
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {upcomingExams.map((occurrence) => {
              const daysAway = differenceInCalendarDays(occurrence.starts_at, new Date())
              return (
                <li key={occurrence.occurrenceKey}>
                  <Card className="gap-2 py-4">
                    <CardContent className="flex items-center gap-4">
                      <div className="bg-destructive/10 text-destructive flex size-12 shrink-0 flex-col items-center justify-center rounded-xl">
                        <span className="text-lg leading-5 font-bold">{format(occurrence.starts_at, 'd')}</span>
                        <span className="text-[10px] uppercase">{format(occurrence.starts_at, 'MMM')}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{occurrence.title}</p>
                        <p className="text-muted-foreground text-sm">
                          {format(occurrence.starts_at, 'EEEE HH:mm')}
                          {occurrence.location ? ` · ${occurrence.location}` : ''}
                        </p>
                      </div>
                      <Badge variant={daysAway <= 7 ? 'destructive' : 'secondary'}>
                        {daysAway <= 0
                          ? 'Today'
                          : formatDueDistance(occurrence.starts_at.toISOString())}
                      </Badge>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        )
      ) : null}

      {events.length === 0 && view !== 'exams' ? (
        <EmptyState
          icon={CalendarPlus}
          title="Your calendar is empty"
          description="Add your class timetable once (weekly repeat) and every week fills itself in."
          action={
            <Button onClick={() => openCreate()}>
              <CalendarPlus /> Add your first event
            </Button>
          }
        />
      ) : null}

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editing}
        defaultStart={defaultStart}
      />
    </div>
  )
}
