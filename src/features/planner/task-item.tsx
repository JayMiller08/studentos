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
}

export function TaskItem({ task, module, onEdit, draggable = false, compact = false }: TaskItemProps) {
  const toggleTask = useToggleTask()
  const deleteTask = useDeleteTask()
  const done = task.status === 'done'
  const start = formatStart(task.start_minutes)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !draggable,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'group bg-card flex items-center gap-2.5 rounded-lg border p-2.5 transition-shadow',
        isDragging && 'z-50 opacity-80 shadow-lg',
        compact ? 'p-2' : '',
      )}
    >
      {draggable ? (
        <button
          type="button"
          aria-label={`Drag ${task.title}`}
          className="text-muted-foreground/50 hover:text-muted-foreground -ml-1 cursor-grab touch-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      ) : null}

      <Checkbox
        checked={done}
        onCheckedChange={(checked) => toggleTask.mutate({ task, completed: checked === true })}
        aria-label={`Mark "${task.title}" ${done ? 'incomplete' : 'complete'}`}
      />

      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', PRIORITY_DOT[task.priority])} />

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', done && 'text-muted-foreground line-through')}>
          {task.title}
        </p>
        {!compact && (start || task.duration_minutes || module || task.recurrence) ? (
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            {start ? <span className="tabular-nums">{start}</span> : null}
            {task.duration_minutes ? <span>{formatMinutes(task.duration_minutes)}</span> : null}
            {module ? <span style={{ color: module.color }}>{module.code ?? module.name}</span> : null}
            {task.recurrence ? (
              <span className="inline-flex items-center gap-0.5">
                <Repeat aria-hidden className="size-3" /> repeats
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="flex opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${task.title}`}
          onClick={() => onEdit(task)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${task.title}`}
          onClick={() => deleteTask.mutate(task.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
