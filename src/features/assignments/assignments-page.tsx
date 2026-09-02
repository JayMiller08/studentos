import { BookOpen, FolderKanban, Plus, Sparkles } from 'lucide-react'
import * as React from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { QuotaMeter } from '@/components/quota-meter'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ViewSwitcher } from '@/components/view-switcher'
import { AssignmentCard } from '@/features/assignments/assignment-card'
import { AssignmentFormDialog } from '@/features/assignments/assignment-form-dialog'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { ModulesDialog } from '@/features/assignments/modules-dialog'
import { usePlan } from '@/hooks/use-plan'
import { isActiveAssignment } from '@/services/assignments-service'
import { orderAssignments } from '@/services/priority-engine'
import type { Assignment } from '@/types/models'

type FilterTab = 'active' | 'done' | 'all'

export function AssignmentsPage() {
  const { data: assignments, isLoading } = useAssignments()
  const { data: modules = [] } = useModules()

  const [filter, setFilter] = React.useState<FilterTab>('active')
  const [formOpen, setFormOpen] = React.useState(false)
  const [modulesOpen, setModulesOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Assignment | null>(null)
  const [limitHit, setLimitHit] = React.useState(false)

  const moduleById = React.useMemo(
    () => new Map(modules.map((module) => [module.id, module])),
    [modules],
  )

  const { has, quota } = usePlan()
  const smartOrdering = has('smartPrioritization')
  const activeCount = (assignments ?? []).filter(isActiveAssignment).length
  const assignmentQuota = quota('assignments', activeCount)
  const atLimit = assignmentQuota.atLimit
  const limit = assignmentQuota.limit

  // One ordering rule for the whole app: the priority engine on plans that
  // include it, earliest-deadline-first otherwise.
  const ordering = React.useMemo(
    () => orderAssignments((assignments ?? []).filter(isActiveAssignment), { smart: smartOrdering }),
    [assignments, smartOrdering],
  )
  const scoreById = ordering.scoreById

  const visible = React.useMemo(() => {
    const list = assignments ?? []
    if (filter === 'active') return ordering.items
    if (filter === 'done') return list.filter((a) => !isActiveAssignment(a))
    return list
  }, [assignments, filter, ordering])

  function openCreate() {
    if (atLimit) {
      setLimitHit(true)
      return
    }
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(assignment: Assignment) {
    setEditing(assignment)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description={
          limit !== null
            ? `${activeCount} of ${limit} active assignments on the Free plan`
            : `${activeCount} active`
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setModulesOpen(true)}>
              <FolderKanban /> Modules
            </Button>
            <Button onClick={openCreate}>
              <Plus /> New assignment
            </Button>
          </>
        }
      />

      <QuotaMeter usage={assignmentQuota} noun="active assignments" />

      {(limitHit || atLimit) && limit !== null ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
              <Sparkles aria-hidden className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">You've reached the Free plan limit</p>
              <p className="text-muted-foreground text-sm">
                Finish or submit an assignment to free a slot, or upgrade to Student Pro for
                unlimited assignments and the AI planner.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div data-tour="assignment-filters">
        <ViewSwitcher
          label="Filter assignments"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'done', label: 'Completed' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filter === 'done' ? 'Nothing completed yet' : 'No assignments here'}
          description={
            filter === 'done'
              ? 'Submitted and graded assignments will appear here.'
              : 'Add your first assignment and StudentOS will keep you ahead of every deadline.'
          }
          action={
            filter !== 'done' ? (
              <Button onClick={openCreate}>
                <Plus /> Add assignment
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul data-tour="assignment-list" className="space-y-3">
          {visible.map((assignment) => (
            <li key={assignment.id}>
              <AssignmentCard
                assignment={assignment}
                module={assignment.module_id ? moduleById.get(assignment.module_id) : undefined}
                onEdit={openEdit}
                score={scoreById.get(assignment.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <AssignmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        assignment={editing}
        onLimitReached={() => setLimitHit(true)}
      />
      <ModulesDialog open={modulesOpen} onOpenChange={setModulesOpen} />
    </div>
  )
}
