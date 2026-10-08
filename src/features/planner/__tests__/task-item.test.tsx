// @vitest-environment jsdom
import { DndContext } from '@dnd-kit/core'
import axe from 'axe-core'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '@/types/models'

/**
 * A task in a week column. In one row, the drag handle, checkbox, priority
 * dot and the edit and delete buttons took all of a 91px column and left the
 * title none, so the week showed cards with no words on them. The stacked
 * layout gives the title its own line and floats the buttons over the card.
 */

vi.mock('@/features/planner/hooks', () => ({
  useToggleTask: () => ({ mutate: vi.fn() }),
  useDeleteTask: () => ({ mutate: vi.fn() }),
}))

const { TaskItem } = await import('@/features/planner/task-item')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(() => {
  React.act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function render(node: React.ReactNode): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  React.act(() => root!.render(<DndContext>{node}</DndContext>))
  return container
}

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  user_id: 'user-1',
  title: 'Review Dijkstra lecture notes',
  notes: null,
  scheduled_on: '2026-10-07',
  start_minutes: 9 * 60,
  duration_minutes: 45,
  priority: 'high',
  status: 'todo',
  estimated_minutes: null,
  completed_at: null,
  assignment_id: null,
  module_id: null,
  recurrence: null,
  recurring_parent_id: null,
  sort_order: 0,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
})

async function violations(element: HTMLElement) {
  const results = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } })
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help}`)
}

describe('TaskItem, stacked for a week column', () => {
  it('gives the title a line of its own that wraps rather than truncates', () => {
    const element = render(<TaskItem task={task()} onEdit={() => {}} draggable stacked />)
    const title = [...element.querySelectorAll('p')].find((p) => p.textContent === 'Review Dijkstra lecture notes')!
    expect(title).toBeDefined()
    expect(title.className).not.toMatch(/\btruncate\b/)
    // Nothing shares the title's line: the controls sit in the row beneath it.
    expect(title.parentElement!.firstElementChild).toBe(title)
    expect(title.nextElementSibling!.querySelector('[role="checkbox"]')).not.toBeNull()
  })

  it('keeps every control, named for the task', () => {
    const element = render(<TaskItem task={task()} onEdit={() => {}} draggable stacked />)
    const names = [...element.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual(
      expect.arrayContaining([
        'Drag Review Dijkstra lecture notes',
        'Mark "Review Dijkstra lecture notes" complete',
        'Edit Review Dijkstra lecture notes',
        'Delete Review Dijkstra lecture notes',
      ]),
    )
  })

  it('floats edit and delete over the card, untouchable until shown', () => {
    const element = render(<TaskItem task={task()} onEdit={() => {}} draggable stacked />)
    const overlay = element.querySelector('[aria-label="Delete Review Dijkstra lecture notes"]')!.parentElement!
    expect(overlay.className).toMatch(/\babsolute\b/)
    expect(overlay.className).toMatch(/\bpointer-events-none\b/)
    expect(overlay.className).toMatch(/group-focus-within:pointer-events-auto/)
  })

  it('edits the task it belongs to', () => {
    const onEdit = vi.fn()
    const element = render(<TaskItem task={task()} onEdit={onEdit} draggable stacked />)
    React.act(() => element.querySelector<HTMLButtonElement>('[aria-label="Edit Review Dijkstra lecture notes"]')!.click())
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }))
  })

  it('has no serious violations in either layout, done or not', async () => {
    const element = render(
      <main>
        <h1>Planner</h1>
        <TaskItem task={task()} onEdit={() => {}} draggable stacked />
        <TaskItem
          task={task({ id: 'task-2', status: 'done', recurrence: { freq: 'weekly', interval: 1 } })}
          onEdit={() => {}}
          draggable
          stacked
        />
        <TaskItem task={task({ id: 'task-3' })} onEdit={() => {}} draggable compact />
      </main>,
    )
    expect(await violations(element)).toEqual([])
  })
})
