import { AlertTriangle, Check, ExternalLink, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { ModuleBadge } from '@/features/assignments/module-badge'
import { useDeleteAssignment, useUpdateAssignment } from '@/features/assignments/hooks'
import { isOverdue } from '@/services/assignments-service'
import type { PriorityScore } from '@/services/priority-engine'
import { cn, formatDueDistance, formatMinutes } from '@/lib/utils'
import type { Assignment, Module, Priority } from '@/types/models'

const PRIORITY_VARIANT: Record<Priority, 'muted' | 'secondary' | 'warning' | 'destructive'> = {
  low: 'muted',
  medium: 'secondary',
  high: 'warning',
  urgent: 'destructive',
}

const STATUS_LABEL: Record<Assignment['status'], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  graded: 'Graded',
}

const BAND_VARIANT: Record<PriorityScore['band'], 'destructive' | 'warning' | 'secondary' | 'muted'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'secondary',
  low: 'muted',
}

interface AssignmentCardProps {
  assignment: Assignment
  module: Module | undefined
  onEdit: (assignment: Assignment) => void
  /** Present when the user's plan includes smart prioritization. */
  score?: PriorityScore
}

export function AssignmentCard({ assignment, module, onEdit, score }: AssignmentCardProps) {
  const updateAssignment = useUpdateAssignment()
  const deleteAssignment = useDeleteAssignment()
  const overdue = isOverdue(assignment)
  const done = assignment.status === 'submitted' || assignment.status === 'graded'

  return (
    <Card className={cn('gap-3 py-4 transition-shadow hover:shadow-md', overdue && 'border-destructive/40')}>
      <div className="flex items-start gap-3 px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ModuleBadge module={module} />
            {score && !done ? (
              <Badge variant={BAND_VARIANT[score.band]} title={score.reason}>
                ⚡ {score.score}
              </Badge>
            ) : null}
            <Badge variant={PRIORITY_VARIANT[assignment.priority]} className="capitalize">
              {assignment.priority}
            </Badge>
            {overdue ? (
              <Badge variant="destructive">
                <AlertTriangle /> Overdue
              </Badge>
            ) : null}
            {done ? <Badge variant="success">{STATUS_LABEL[assignment.status]}</Badge> : null}
          </div>
          <h3 className={cn('mt-1.5 font-medium', done && 'text-muted-foreground line-through')}>
            {assignment.title}
          </h3>
          <p className={cn('text-sm', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
            {formatDueDistance(assignment.due_at)} · {formatMinutes(assignment.estimated_minutes)} est
            {assignment.weight > 0 ? ` · ${assignment.weight}% of grade` : ''}
            {assignment.grade !== null ? ` · scored ${assignment.grade}%` : ''}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${assignment.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit(assignment)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            {!done ? (
              <DropdownMenuItem
                onSelect={() => {
                  updateAssignment.mutate(
                    { id: assignment.id, patch: { status: 'submitted', progress: 100 } },
                    { onSuccess: () => toast.success('Marked as submitted 🎉') },
                  )
                }}
              >
                <Check /> Mark submitted
              </DropdownMenuItem>
            ) : null}
            {assignment.submission_url ? (
              <DropdownMenuItem asChild>
                <a href={assignment.submission_url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> Open submission link
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                deleteAssignment.mutate(assignment.id, {
                  onSuccess: () => toast.success('Assignment deleted'),
                })
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!done ? (
        <div className="flex items-center gap-3 px-4">
          <Progress
            value={assignment.progress}
            className="h-1.5"
            aria-label={`${assignment.progress}% complete`}
          />
          <span className="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">
            {assignment.progress}%
          </span>
        </div>
      ) : null}
    </Card>
  )
}
