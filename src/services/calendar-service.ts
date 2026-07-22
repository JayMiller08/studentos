import { addDays, addMonths, addWeeks, isBefore, isWithinInterval, parseISO } from 'date-fns'
import { byUser, table } from '@/services/db'
import type { Assignment, CalendarEvent, CalendarEventType, TaskRecurrence } from '@/types/models'

const events = () => table<CalendarEvent>('calendar_events')

export interface CalendarEventInput {
  title: string
  description?: string | null
  event_type: CalendarEventType
  starts_at: string
  ends_at: string
  all_day?: boolean
  location?: string | null
  color?: string | null
  module_id?: string | null
  assignment_id?: string | null
  recurrence?: TaskRecurrence | null
}

/**
 * A concrete occurrence to render. Recurring events (class timetables) are
 * expanded client-side for the visible range; `sourceId` points back at the
 * stored row.
 */
export interface EventOccurrence {
  sourceId: string
  occurrenceKey: string
  title: string
  event_type: CalendarEventType
  starts_at: Date
  ends_at: Date
  all_day: boolean
  location: string | null
  color: string | null
  module_id: string | null
  assignment_id: string | null
  isRecurring: boolean
}

const MAX_OCCURRENCES_PER_EVENT = 200

function expandEvent(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const base: Omit<EventOccurrence, 'starts_at' | 'ends_at' | 'occurrenceKey'> = {
    sourceId: event.id,
    title: event.title,
    event_type: event.event_type,
    all_day: event.all_day,
    location: event.location,
    color: event.color,
    module_id: event.module_id,
    assignment_id: event.assignment_id,
    isRecurring: Boolean(event.recurrence),
  }

  const start = parseISO(event.starts_at)
  const end = parseISO(event.ends_at)
  const durationMs = end.getTime() - start.getTime()

  if (!event.recurrence) {
    if (start > rangeEnd || end < rangeStart) return []
    return [{ ...base, starts_at: start, ends_at: end, occurrenceKey: event.id }]
  }

  const occurrences: EventOccurrence[] = []
  const { freq, interval } = event.recurrence
  const step = Math.max(1, interval)
  const weekdays = event.recurrence.weekdays

  let cursor = start
  let guard = 0
  while (isBefore(cursor, addDays(rangeEnd, 1)) && guard < MAX_OCCURRENCES_PER_EVENT) {
    guard += 1
    const matchesWeekday =
      freq !== 'weekly' || !weekdays?.length || weekdays.includes(cursor.getDay())
    if (
      matchesWeekday &&
      isWithinInterval(cursor, { start: addDays(rangeStart, -1), end: rangeEnd })
    ) {
      const occEnd = new Date(cursor.getTime() + durationMs)
      occurrences.push({
        ...base,
        starts_at: cursor,
        ends_at: occEnd,
        occurrenceKey: `${event.id}:${cursor.toISOString()}`,
      })
    }
    if (freq === 'daily') cursor = addDays(cursor, step)
    else if (freq === 'weekly')
      // Walk day-by-day inside a week so multiple weekdays are honored.
      cursor = weekdays?.length ? addDays(cursor, 1) : addWeeks(cursor, step)
    else cursor = addMonths(cursor, step)
  }
  return occurrences
}

/** Assignment deadlines surface on the calendar without duplicating data. */
export function assignmentOccurrences(
  assignmentList: Assignment[],
  rangeStart: Date,
  rangeEnd: Date,
): EventOccurrence[] {
  return assignmentList
    .filter((assignment) => {
      const due = parseISO(assignment.due_at)
      return due >= rangeStart && due <= rangeEnd
    })
    .map((assignment) => {
      const due = parseISO(assignment.due_at)
      return {
        sourceId: assignment.id,
        occurrenceKey: `assignment:${assignment.id}`,
        title: assignment.title,
        event_type: 'deadline' as const,
        starts_at: due,
        ends_at: due,
        all_day: false,
        location: null,
        color: null,
        module_id: assignment.module_id,
        assignment_id: assignment.id,
        isRecurring: false,
      }
    })
}

export const calendarService = {
  async list(userId: string): Promise<CalendarEvent[]> {
    return events().list({
      filters: byUser(userId),
      orderBy: { column: 'starts_at', ascending: true },
    })
  },

  /** Expanded occurrences (including recurring classes) for a visible range. */
  expandForRange(all: CalendarEvent[], rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
    return all
      .flatMap((event) => expandEvent(event, rangeStart, rangeEnd))
      .sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime())
  },

  async create(userId: string, input: CalendarEventInput): Promise<CalendarEvent> {
    return events().insert({
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      event_type: input.event_type,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      all_day: input.all_day ?? false,
      location: input.location ?? null,
      color: input.color ?? null,
      module_id: input.module_id ?? null,
      assignment_id: input.assignment_id ?? null,
      recurrence: input.recurrence ?? null,
    })
  },

  async update(id: string, patch: Partial<CalendarEventInput>): Promise<CalendarEvent> {
    return events().update(id, patch)
  },

  async remove(id: string): Promise<void> {
    return events().remove(id)
  },
}
