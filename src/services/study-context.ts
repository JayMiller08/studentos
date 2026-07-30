import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { orderAssignments } from '@/services/priority-engine'
import { isActiveAssignment } from '@/services/assignments-service'
import { isUnfinishedTask } from '@/services/tasks-service'
import type { Assignment, CalendarEvent, Module, Note, Task } from '@/types/models'

/**
 * The snapshot of a student's workload handed to the AI coach.
 *
 * Two rules shape everything here:
 *
 *  1. **Bounded.** Every section is capped, so a student with 400 tasks costs
 *     the same as one with 12 and the prompt never crowds out the question
 *     they actually asked.
 *  2. **Only what is true.** Nothing is inferred or padded. The coach is told
 *     explicitly when a section is empty, so it says "you have no notes on
 *     that" rather than inventing some.
 *
 * Notes are summarised (title, tags, short excerpt) rather than sent whole:
 * a semester of notes would dominate the budget, and full text belongs in an
 * attachment the student chooses to send.
 */

const LIMITS = {
  assignments: 8,
  tasks: 20,
  events: 15,
  notes: 10,
  /** Characters of each note's body used as a "what is in here" hint. */
  noteExcerpt: 280,
  /** Days ahead to include calendar events for. */
  eventHorizonDays: 14,
} as const

export interface StudyContextInput {
  assignments: Assignment[]
  tasks: Task[]
  events: CalendarEvent[]
  notes: Note[]
  modules: Module[]
  /** Whether the plan ranks by the priority engine or plain due date. */
  smart: boolean
  now?: Date
}

function moduleLabel(modules: Map<string, Module>, moduleId: string | null): string {
  if (!moduleId) return ''
  const module = modules.get(moduleId)
  if (!module) return ''
  return ` [${module.code ?? module.name}]`
}

function dueLabel(iso: string, now: Date): string {
  const days = differenceInCalendarDays(parseISO(iso), now)
  if (days < 0) return `OVERDUE by ${Math.abs(days)}d`
  if (days === 0) return 'due today'
  if (days === 1) return 'due tomorrow'
  return `due in ${days}d`
}

/** Collapse markdown/whitespace into a single-line excerpt. */
function excerpt(markdown: string, max: number): string {
  const flat = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`\-|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function section(title: string, lines: string[], emptyNote: string): string {
  return lines.length > 0
    ? `${title}:\n${lines.join('\n')}`
    : `${title}: none${emptyNote ? ` (${emptyNote})` : ''}`
}

/**
 * Build the plain-text brief injected into the coach's system prompt. Plain
 * text rather than JSON — it reads better to the model at this size and keeps
 * the token cost down.
 */
export function buildStudyContext(input: StudyContextInput): string {
  const now = input.now ?? new Date()
  const modules = new Map(input.modules.map((module) => [module.id, module]))
  const today = format(now, 'yyyy-MM-dd')

  // ── Assignments: the ranked shortlist, same order the app shows ──────────
  const active = input.assignments.filter(isActiveAssignment)
  const assignmentLines = orderAssignments(active, { smart: input.smart, now })
    .items.slice(0, LIMITS.assignments)
    .map((assignment) => {
      const remaining = Math.round(
        (assignment.estimated_minutes * (1 - assignment.progress / 100)) / 60,
      )
      return `- "${assignment.title}"${moduleLabel(modules, assignment.module_id)} — ${dueLabel(assignment.due_at, now)}, ${assignment.progress}% done, worth ${assignment.weight}% of the grade, ~${remaining}h left`
    })

  // ── Tasks: overdue and scheduled first, then a little backlog ────────────
  const unfinished = input.tasks.filter(isUnfinishedTask)
  const scheduled = unfinished
    .filter((task) => task.scheduled_on !== null)
    .sort((a, b) => (a.scheduled_on ?? '').localeCompare(b.scheduled_on ?? ''))
  const backlog = unfinished.filter((task) => task.scheduled_on === null)
  const taskLines = [...scheduled, ...backlog].slice(0, LIMITS.tasks).map((task) => {
    const when = task.scheduled_on
      ? task.scheduled_on < today
        ? `was due ${task.scheduled_on}`
        : task.scheduled_on === today
          ? 'today'
          : task.scheduled_on
      : 'backlog (no date)'
    return `- "${task.title}"${moduleLabel(modules, task.module_id)} — ${when}, priority ${task.priority}`
  })

  // ── Calendar: only the near horizon; past events are noise here ──────────
  const eventLines = input.events
    .filter((event) => {
      const days = differenceInCalendarDays(parseISO(event.starts_at), now)
      return days >= 0 && days <= LIMITS.eventHorizonDays
    })
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, LIMITS.events)
    .map((event) => {
      const starts = parseISO(event.starts_at)
      const when = event.all_day
        ? format(starts, 'EEE d MMM')
        : format(starts, 'EEE d MMM, HH:mm')
      const where = event.location ? ` at ${event.location}` : ''
      return `- ${event.event_type}: "${event.title}"${moduleLabel(modules, event.module_id)} — ${when}${where}`
    })

  // ── Notes: an index, not the contents ────────────────────────────────────
  const noteLines = [...input.notes]
    .sort((a, b) => {
      // Pinned first, then most recently touched.
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned)
      return b.updated_at.localeCompare(a.updated_at)
    })
    .slice(0, LIMITS.notes)
    .map((note) => {
      const tags = note.tags.length > 0 ? ` (tags: ${note.tags.join(', ')})` : ''
      const body = excerpt(note.content_md, LIMITS.noteExcerpt)
      return `- "${note.title}"${moduleLabel(modules, note.module_id)}${tags}${body ? ` — ${body}` : ' — (empty)'}`
    })

  return [
    `Today is ${format(now, 'EEEE, d MMMM yyyy')}.`,
    '',
    section('ACTIVE ASSIGNMENTS', assignmentLines, 'nothing outstanding'),
    '',
    section('UNFINISHED TASKS', taskLines, 'the planner is clear'),
    '',
    section(
      `UPCOMING CALENDAR (next ${LIMITS.eventHorizonDays} days)`,
      eventLines,
      'nothing scheduled',
    ),
    '',
    section('NOTES', noteLines, 'no notes saved yet'),
    '',
    'Note excerpts above are previews only — if the student wants to be quizzed on a note, ask them to attach it.',
  ].join('\n')
}
