import { addDays, addMonths, addWeeks, format, parseISO } from 'date-fns'
import { toDateKey } from '@/lib/utils'
import { byUser, table } from '@/services/db'
import type { Priority, Task, TaskRecurrence, TaskStatus } from '@/types/models'

const tasks = () => table<Task>('tasks')

export interface TaskInput {
  title: string
  notes?: string | null
  scheduled_on?: string | null
  start_minutes?: number | null
  duration_minutes?: number | null
  priority?: Priority
  status?: TaskStatus
  estimated_minutes?: number | null
  assignment_id?: string | null
  module_id?: string | null
  recurrence?: TaskRecurrence | null
  sort_order?: number
}

/** Next occurrence date for a recurring task completed on `fromDateKey`. */
export function nextOccurrence(fromDateKey: string, recurrence: TaskRecurrence): string {
  const from = parseISO(fromDateKey)
  const interval = Math.max(1, recurrence.interval)
  switch (recurrence.freq) {
    case 'daily':
      return format(addDays(from, interval), 'yyyy-MM-dd')
    case 'weekly': {
      const weekdays = recurrence.weekdays?.length
        ? [...recurrence.weekdays].sort((a, b) => a - b)
        : [from.getDay()]
      // Find the next listed weekday after `from`, wrapping into next interval-week.
      for (let offset = 1; offset <= 7; offset += 1) {
        const candidate = addDays(from, offset)
        if (weekdays.includes(candidate.getDay())) {
          // When wrapping past the week's last listed day, skip (interval-1) weeks.
          const wrapped = candidate.getDay() <= from.getDay()
          return format(wrapped && interval > 1 ? addWeeks(candidate, interval - 1) : candidate, 'yyyy-MM-dd')
        }
      }
      return format(addWeeks(from, interval), 'yyyy-MM-dd')
    }
    case 'monthly':
      return format(addMonths(from, interval), 'yyyy-MM-dd')
  }
}

export const tasksService = {
  async list(userId: string): Promise<Task[]> {
    return tasks().list({
      filters: byUser(userId),
      orderBy: { column: 'sort_order', ascending: true },
    })
  },

  async listForRange(userId: string, fromKey: string, toKey: string): Promise<Task[]> {
    return tasks().list({
      filters: byUser(userId, [
        { column: 'scheduled_on', op: 'gte', value: fromKey },
        { column: 'scheduled_on', op: 'lte', value: toKey },
      ]),
      orderBy: { column: 'sort_order', ascending: true },
    })
  },

  async listBacklog(userId: string): Promise<Task[]> {
    return tasks().list({
      filters: byUser(userId, [{ column: 'scheduled_on', op: 'is', value: null }]),
      orderBy: { column: 'sort_order', ascending: true },
    })
  },

  async create(userId: string, input: TaskInput): Promise<Task> {
    return tasks().insert({
      user_id: userId,
      title: input.title,
      notes: input.notes ?? null,
      scheduled_on: input.scheduled_on ?? null,
      start_minutes: input.start_minutes ?? null,
      duration_minutes: input.duration_minutes ?? null,
      priority: input.priority ?? 'medium',
      status: input.status ?? 'todo',
      estimated_minutes: input.estimated_minutes ?? null,
      completed_at: null,
      assignment_id: input.assignment_id ?? null,
      module_id: input.module_id ?? null,
      recurrence: input.recurrence ?? null,
      recurring_parent_id: null,
      sort_order: input.sort_order ?? 0,
    })
  },

  async update(id: string, patch: Partial<Task>): Promise<Task> {
    return tasks().update(id, patch)
  },

  /**
   * Complete (or un-complete) a task. Completing a recurring task spawns the
   * next occurrence so the habit of planning never breaks.
   */
  async setCompleted(task: Task, completed: boolean): Promise<Task> {
    const updated = await tasks().update(task.id, {
      status: completed ? 'done' : 'todo',
      completed_at: completed ? new Date().toISOString() : null,
    })

    if (completed && task.recurrence && task.status !== 'done') {
      const baseDate = task.scheduled_on ?? toDateKey(new Date())
      await tasks().insert({
        user_id: task.user_id,
        title: task.title,
        notes: task.notes,
        scheduled_on: nextOccurrence(baseDate, task.recurrence),
        start_minutes: task.start_minutes,
        duration_minutes: task.duration_minutes,
        priority: task.priority,
        status: 'todo',
        estimated_minutes: task.estimated_minutes,
        completed_at: null,
        assignment_id: task.assignment_id,
        module_id: task.module_id,
        recurrence: task.recurrence,
        recurring_parent_id: task.recurring_parent_id ?? task.id,
        sort_order: task.sort_order,
      })
    }

    return updated
  },

  async remove(id: string): Promise<void> {
    return tasks().remove(id)
  },
}
