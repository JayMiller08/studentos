import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Repeat, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useDeleteTask, useToggleTask } from '@/features/planner/hooks'
import { cn, formatMinutes } from '@/lib/utils'
import type { Module, Priority, Task } from '@/types/models'

const PRIORITY_DOT: Record<Priority, string> = {
  low: 'bg-muted-foreground/50',
  medium: 'bg-primary',
  high: 'bg-warning',
  urgent: 'bg-destructive',
}

function formatStart(minutes: number | null): string | null {
  if (minutes === null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface TaskItemProps {
  task: Task
  module?: Module | undefined
  onEdit: (task: Task) => void
  /** Enables cross-day dragging inside a DndContext. */
  draggable?: boolean
  compact?: boolean
  /**
   * The title on a line of its own, wrapping, with the controls beneath it.
   * For a week column: in one row, the handle, checkbox, dot and the edit and
   * delete buttons took the whole of a narrow column and left the title none.
   */
  stacked?: boolean
}

export function TaskItem({
  task,
  module,
  onEdit,
  draggable = false,
  compact = false,
  stacked = false,
}: TaskItemProps) {
  const toggleTask = useToggleTask()
  const deleteTask = useDeleteTask()
  const done = task.status === 'done'
  const start = formatStart(task.start_minutes)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !draggable,
  })

  const grip = draggable ? (
    <button
      type="button"
      aria-label={`Drag ${task.title}`}
      className={cn(
        'text-muted-foreground/50 hover:text-muted-foreground cursor-grab touch-none active:cursor-grabbing',
        stacked ? 'ml-auto shrink-0' : '-ml-1',
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  ) : null

  const checkbox = (
    <Checkbox
      checked={done}
      onCheckedChange={(checked) => toggleTask.mutate({ task, completed: checked === true })}
      aria-label={`Mark "${task.title}" ${done ? 'incomplete' : 'complete'}`}
    />
  )

  const dot = <span aria-hidden className={cn('size-2 shrink-0 rounded-full', PRIORITY_DOT[task.priority])} />

  const actions = (className: string) => (
    <div className={className}>
      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${task.title}`} onClick={() => onEdit(task)}>
        <Pencil className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${task.title}`} onClick={() => deleteTask.mutate(task.id)}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )

  const style = { transform: CSS.Translate.toString(transform) }

  if (stacked) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'group bg-card relative rounded-lg border p-2 transition-shadow',
          isDragging && 'z-50 opacity-80 shadow-lg',
        )}
      >
        {/* Wraps instead of truncating, and breaks a word too long for the
            column rather than pushing out of it. */}
        <p
          className={cn(
            'text-sm leading-snug font-medium [overflow-wrap:anywhere]',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          {checkbox}
          {dot}
          {start ? <span className="text-muted-foreground text-xs tabular-nums">{start}</span> : null}
          {task.recurrence ? (
            <Repeat role="img" aria-label="Repeats" className="text-muted-foreground size-3 shrink-0" />
          ) : null}
          {grip}
        </div>
        {/* Over the card rather than beside the title, so they cost it no
            width; and untouchable until shown, so a tap meant for the card
            can never land on an invisible delete. */}
        {actions(
          'bg-card shadow-e1 pointer-events-none absolute top-1 right-1 flex rounded-md border opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
        )}
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group bg-card flex items-center gap-2.5 rounded-lg border p-2.5 transition-shadow',
        isDragging && 'z-50 opacity-80 shadow-lg',
        compact ? 'p-2' : '',
      )}
    >
      {grip}

      {checkbox}

      {dot}

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', done && 'text-muted-foreground line-through')}>
          {task.title}
        </p>
        {!compact && (start || task.duration_minutes || module || task.recurrence) ? (
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            {start ? <span className="tabular-nums">{start}</span> : null}
            {task.duration_minutes ? <span>{formatMinutes(task.duration_minutes)}</span> : null}
            {module ? (
              // Same blend as ModuleBadge: a student-chosen colour tuned for
              // white can miss 4.5:1 on the dark theme, so pull it toward the
              // current foreground while keeping the hue.
              <span style={{ color: `color-mix(in oklab, ${module.color} 65%, var(--foreground))` }}>
                {module.code ?? module.name}
              </span>
            ) : null}
            {task.recurrence ? (
              <span className="inline-flex items-center gap-0.5">
                <Repeat aria-hidden className="size-3" /> repeats
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {actions('flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100')}
    </div>
  )
}
