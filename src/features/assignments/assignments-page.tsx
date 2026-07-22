import { BookOpen, FolderKanban, Plus, Sparkles } from 'lucide-react'
import * as React from 'react'
import { useAuth } from '@/app/providers/auth-provider'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssignmentCard } from '@/features/assignments/assignment-card'
import { AssignmentFormDialog } from '@/features/assignments/assignment-form-dialog'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { ModulesDialog } from '@/features/assignments/modules-dialog'
import { PLANS } from '@/lib/plans'
import { isActiveAssignment } from '@/services/assignments-service'
import type { Assignment } from '@/types/models'

type FilterTab = 'active' | 'done' | 'all'

export function AssignmentsPage() {
  const { profile } = useAuth()
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

  const plan = profile?.plan ?? 'free'
  const limit = PLANS[plan].limits.assignments
  const activeCount = (assignments ?? []).filter(isActiveAssignment).length
  const atLimit = limit !== null && activeCount >= limit

  const visible = React.useMemo(() => {
    const list = assignments ?? []
    if (filter === 'active') return list.filter(isActiveAssignment)
    if (filter === 'done') return list.filter((a) => !isActiveAssignment(a))
    return list
  }, [assignments, filter])

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

      <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterTab)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="done">Completed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

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
        <ul className="space-y-3">
          {visible.map((assignment) => (
            <li key={assignment.id}>
              <AssignmentCard
                assignment={assignment}
                module={assignment.module_id ? moduleById.get(assignment.module_id) : undefined}
                onEdit={openEdit}
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
