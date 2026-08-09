import { format, parseISO } from 'date-fns'
import { CalendarRange, Clock, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn, formatMinutes } from '@/lib/utils'
import type { SavedStudyPlan } from '@/types/models'

/** Longest a plan name may be — keeps the rail cards readable. */
export const MAX_PLAN_NAME = 60

function planSubtitle(plan: SavedStudyPlan): string {
  const minutes = (plan.days ?? []).reduce((sum, day) => sum + day.totalMinutes, 0)
  const activeDays = (plan.days ?? []).filter((day) => day.totalMinutes > 0).length
  return `${plan.horizon_days}-day plan · ${formatMinutes(minutes)} across ${activeDays} day${activeDays === 1 ? '' : 's'}`
}

/**
 * Horizontal rail of the student's saved plans. Clicking one loads it back
 * into the planner; the menu raises rename/delete to the page, which owns the
 * dialogs so the same ones serve the rail and the plan's own action bar.
 */
export function SavedPlansRail({
  plans,
  activeId,
  onOpen,
  onRenameRequest,
  onDeleteRequest,
}: {
  plans: SavedStudyPlan[]
  activeId: string | null
  onOpen: (plan: SavedStudyPlan) => void
  onRenameRequest: (plan: SavedStudyPlan) => void
  onDeleteRequest: (plan: SavedStudyPlan) => void
}) {
  if (plans.length === 0) return null

  return (
    <section aria-label="Saved plans" className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Saved plans</h2>
        <span className="text-muted-foreground text-xs">{plans.length}</span>
      </div>
      {/* Scrolls sideways on a phone rather than stacking a dozen cards above
          the planner the student actually came here to use. */}
      <ul className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {plans.map((plan) => {
          const active = plan.id === activeId
          return (
            <li key={plan.id} className="shrink-0">
              <div
                className={cn(
                  'bg-card relative w-60 rounded-xl border p-3 transition-colors',
                  active ? 'border-primary ring-primary/25 ring-2' : 'hover:border-primary/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => onOpen(plan)}
                  className="block w-full pr-7 text-left"
                >
                  <p className="truncate text-sm font-medium">{plan.name}</p>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {planSubtitle(plan)}
                  </p>
                  <p className="text-muted-foreground mt-1.5 flex items-center gap-1 text-[11px]">
                    <Clock aria-hidden className="size-3" />
                    Edited {format(parseISO(plan.updated_at), 'd MMM')}
                  </p>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-2 right-1.5"
                      aria-label={`Actions for ${plan.name}`}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onOpen(plan)}>
                      <CalendarRange /> Open
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onRenameRequest(plan)}>
                      <Pencil /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => onDeleteRequest(plan)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Name a plan. Serves both "save this plan" and "rename that plan" — the only
 * difference is the wording, and duplicating a dialog to change two strings
 * is how two dialogs drift apart.
 */
export function PlanNameDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  defaultName,
  busy,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  submitLabel: string
  defaultName: string
  busy?: boolean
  onSubmit: (name: string) => void
}) {
  const [name, setName] = React.useState(defaultName)

  // Re-seed each time it opens: the default depends on which plan (or which
  // generated schedule) triggered it.
  React.useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  const trimmed = name.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!trimmed || busy) return
            onSubmit(trimmed)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="my-5 space-y-2">
            <Label htmlFor="plan-name">Plan name</Label>
            <Input
              id="plan-name"
              value={name}
              autoFocus
              maxLength={MAX_PLAN_NAME}
              placeholder="e.g. Exam block, Week 7 catch-up"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || busy}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Confirm before destroying a saved plan — deleting one is not undoable. */
export function DeletePlanDialog({
  plan,
  onOpenChange,
  busy,
  onConfirm,
}: {
  plan: SavedStudyPlan | null
  onOpenChange: (open: boolean) => void
  busy?: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(plan)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{plan?.name}”?</DialogTitle>
          <DialogDescription>
            This removes the saved schedule. Study blocks you already applied stay in your
            planner — only the saved plan goes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            <Trash2 /> Delete plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
