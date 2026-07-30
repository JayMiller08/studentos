import { describe, expect, it } from 'vitest'
import { buildStudyContext } from '@/services/study-context'
import type { Assignment, CalendarEvent, Module, Note, Task } from '@/types/models'

// Local-time constructors throughout: "due today" means the student's calendar
// day, so a UTC literal would flip the assertion depending on the test machine.
const NOW = new Date(2026, 2, 10, 8, 0)

/** ISO timestamp for a local wall-clock time, stable in any timezone. */
function localIso(year: number, monthIndex: number, day: number, hour = 9): string {
  return new Date(year, monthIndex, day, hour).toISOString()
}

function assignment(overrides: Partial<Assignment> & { id: string }): Assignment {
  return {
    user_id: 'u1',
    module_id: null,
    title: overrides.id,
    description: null,
    due_at: '2026-03-20T09:00:00Z',
    priority: 'medium',
    weight: 20,
    estimated_minutes: 120,
    difficulty: 3,
    status: 'not_started',
    progress: 0,
    grade: null,
    submission_url: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    user_id: 'u1',
    title: overrides.id,
    notes: null,
    scheduled_on: null,
    start_minutes: null,
    duration_minutes: null,
    priority: 'medium',
    status: 'todo',
    estimated_minutes: null,
    completed_at: null,
    assignment_id: null,
    module_id: null,
    recurrence: null,
    recurring_parent_id: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    user_id: 'u1',
    title: overrides.id,
    description: null,
    event_type: 'class',
    starts_at: '2026-03-11T09:00:00Z',
    ends_at: '2026-03-11T10:00:00Z',
    all_day: false,
    location: null,
    color: null,
    module_id: null,
    assignment_id: null,
    recurrence: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function note(overrides: Partial<Note> & { id: string }): Note {
  return {
    user_id: 'u1',
    folder_id: null,
    title: overrides.id,
    content_md: 'Some content about the topic.',
    tags: [],
    pinned: false,
    module_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const MODULE: Module = {
  id: 'm1',
  user_id: 'u1',
  semester_id: null,
  code: 'CSC2001',
  name: 'Data Structures',
  color: '#2563eb',
  credits: 16,
  instructor: null,
  archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function build(overrides: Partial<Parameters<typeof buildStudyContext>[0]> = {}) {
  return buildStudyContext({
    assignments: [],
    tasks: [],
    events: [],
    notes: [],
    modules: [MODULE],
    smart: true,
    now: NOW,
    ...overrides,
  })
}

describe('buildStudyContext', () => {
  it('says a section is empty rather than omitting it', () => {
    // The coach must be able to say "you have no notes on that" instead of
    // guessing from a silently missing section.
    const context = build()
    expect(context).toContain('ACTIVE ASSIGNMENTS: none')
    expect(context).toContain('UNFINISHED TASKS: none')
    expect(context).toContain('NOTES: none')
    expect(context).toContain('Today is Tuesday, 10 March 2026')
  })

  it('includes each source of work', () => {
    const context = build({
      assignments: [assignment({ id: 'a1', title: 'Graph practical', module_id: 'm1' })],
      tasks: [task({ id: 't1', title: 'Read chapter 4', scheduled_on: '2026-03-10' })],
      events: [event({ id: 'e1', title: 'DSA Lecture', location: 'CS 2A' })],
      notes: [note({ id: 'n1', title: 'Dijkstra', tags: ['algorithms'] })],
    })
    expect(context).toContain('Graph practical')
    expect(context).toContain('Read chapter 4')
    expect(context).toContain('DSA Lecture')
    expect(context).toContain('Dijkstra')
    // Module codes let the coach connect work across sections.
    expect(context).toContain('[CSC2001]')
  })

  it('flags overdue work explicitly', () => {
    const context = build({
      assignments: [assignment({ id: 'a1', due_at: '2026-03-05T09:00:00Z' })],
      tasks: [task({ id: 't1', title: 'Late task', scheduled_on: '2026-03-01' })],
    })
    expect(context).toContain('OVERDUE by 5d')
    expect(context).toContain('was due 2026-03-01')
  })

  it('marks work due today and tomorrow in words', () => {
    const context = build({
      assignments: [
        assignment({ id: 'a1', title: 'Today one', due_at: localIso(2026, 2, 10, 18) }),
        assignment({ id: 'a2', title: 'Tomorrow one', due_at: localIso(2026, 2, 11, 9) }),
      ],
    })
    expect(context).toMatch(/Today one.*due today/)
    expect(context).toMatch(/Tomorrow one.*due tomorrow/)
  })

  it('leaves out finished tasks and completed assignments', () => {
    const context = build({
      assignments: [assignment({ id: 'a1', title: 'Submitted work', status: 'submitted' })],
      tasks: [task({ id: 't1', title: 'Done task', status: 'done' })],
    })
    expect(context).not.toContain('Submitted work')
    expect(context).not.toContain('Done task')
  })

  it('only includes calendar events inside the horizon', () => {
    const context = build({
      events: [
        event({ id: 'past', title: 'Last week lecture', starts_at: '2026-03-01T09:00:00Z' }),
        event({ id: 'soon', title: 'Tomorrow lecture', starts_at: '2026-03-11T09:00:00Z' }),
        event({ id: 'far', title: 'Next month exam', starts_at: '2026-04-20T09:00:00Z' }),
      ],
    })
    expect(context).not.toContain('Last week lecture')
    expect(context).toContain('Tomorrow lecture')
    expect(context).not.toContain('Next month exam')
  })

  it('caps every section so a heavy account cannot flood the prompt', () => {
    const context = build({
      assignments: Array.from({ length: 40 }, (_, i) =>
        assignment({ id: `a${i}`, title: `Assignment ${i}` }),
      ),
      tasks: Array.from({ length: 200 }, (_, i) => task({ id: `t${i}`, title: `Task ${i}` })),
      events: Array.from({ length: 60 }, (_, i) =>
        event({ id: `e${i}`, title: `Event ${i}`, starts_at: '2026-03-11T09:00:00Z' }),
      ),
      notes: Array.from({ length: 80 }, (_, i) => note({ id: `n${i}`, title: `Note ${i}` })),
    })
    const count = (label: string) =>
      context.split('\n').filter((line) => line.startsWith(`- `) && line.includes(label)).length

    expect(count('Assignment ')).toBe(8)
    expect(count('Task ')).toBe(20)
    expect(count('Event ')).toBe(15)
    expect(count('Note ')).toBe(10)
    // Whole brief stays small enough to leave room for the actual question.
    expect(context.length).toBeLessThan(12_000)
  })

  it('truncates note bodies instead of sending them whole', () => {
    const context = build({
      notes: [note({ id: 'n1', title: 'Long note', content_md: 'x'.repeat(5000) })],
    })
    expect(context).toContain('…')
    expect(context.length).toBeLessThan(2000)
  })

  it('strips markdown noise out of note excerpts', () => {
    const context = build({
      notes: [
        note({
          id: 'n1',
          title: 'Formatted',
          content_md: '# Heading\n\n**bold** and `code`\n\n```js\nconst x = 1\n```\n\n- bullet',
        }),
      ],
    })
    const line = context.split('\n').find((l) => l.includes('"Formatted"')) ?? ''
    expect(line).not.toContain('#')
    expect(line).not.toContain('```')
    expect(line).toContain('bold')
    // Fenced code is dropped rather than pasted in as noise.
    expect(line).not.toContain('const x = 1')
  })

  it('puts pinned notes first', () => {
    const context = build({
      notes: [
        note({ id: 'n1', title: 'Ordinary', updated_at: '2026-03-09T00:00:00Z' }),
        note({ id: 'n2', title: 'Pinned one', pinned: true, updated_at: '2026-01-01T00:00:00Z' }),
      ],
    })
    expect(context.indexOf('Pinned one')).toBeLessThan(context.indexOf('Ordinary'))
  })

  it('puts dated tasks before the undated backlog', () => {
    const context = build({
      tasks: [
        task({ id: 't1', title: 'Backlog item' }),
        task({ id: 't2', title: 'Scheduled item', scheduled_on: '2026-03-12' }),
      ],
    })
    expect(context.indexOf('Scheduled item')).toBeLessThan(context.indexOf('Backlog item'))
  })

  it('tells the coach the note excerpts are only previews', () => {
    // Otherwise it will happily "quiz" a student off a truncated fragment.
    expect(build()).toContain('previews only')
  })
})
