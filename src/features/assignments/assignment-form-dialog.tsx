import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCreateAssignment, useModules, useUpdateAssignment } from '@/features/assignments/hooks'
import { numberField, optionalNumberField } from '@/lib/forms'
import { PlanLimitError } from '@/services/assignments-service'
import type { Assignment } from '@/types/models'

const NO_MODULE = 'none'

const assignmentSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(200),
  description: z.string().trim().max(2000),
  moduleId: z.string(),
  dueAt: z.string().min(1, 'Due date is required'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  weight: numberField(z.number().min(0, 'Min 0').max(100, 'Max 100')),
  estimatedHours: numberField(z.number().min(0.25, 'At least 15 minutes').max(200)),
  difficulty: z.enum(['1', '2', '3', '4', '5']),
  status: z.enum(['not_started', 'in_progress', 'submitted', 'graded']),
  progress: numberField(z.number().min(0).max(100)),
  grade: optionalNumberField(z.number().min(0).max(100)),
  submissionUrl: z.union([z.literal(''), z.url('Enter a valid URL')]),
  notes: z.string().trim().max(4000),
})
type AssignmentFormValues = z.input<typeof assignmentSchema>

interface AssignmentFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided the dialog edits; otherwise it creates. */
  assignment?: Assignment | null
  onLimitReached?: () => void
}

function toLocalInputValue(iso: string): string {
  return format(parseISO(iso), "yyyy-MM-dd'T'HH:mm")
}

export function AssignmentFormDialog({
  open,
  onOpenChange,
  assignment,
  onLimitReached,
}: AssignmentFormDialogProps) {
  const { data: modules = [] } = useModules()
  const createAssignment = useCreateAssignment()
  const updateAssignment = useUpdateAssignment()
  const isEditing = Boolean(assignment)

  const defaults = React.useMemo<AssignmentFormValues>(
    () => ({
      title: assignment?.title ?? '',
      description: assignment?.description ?? '',
      moduleId: assignment?.module_id ?? NO_MODULE,
      dueAt: assignment ? toLocalInputValue(assignment.due_at) : '',
      priority: assignment?.priority ?? 'medium',
      weight: assignment?.weight ?? 10,
      estimatedHours: assignment ? assignment.estimated_minutes / 60 : 2,
      difficulty: String(assignment?.difficulty ?? 3) as '1' | '2' | '3' | '4' | '5',
      status: assignment?.status ?? 'not_started',
      progress: assignment?.progress ?? 0,
      grade: assignment?.grade ?? '',
      submissionUrl: assignment?.submission_url ?? '',
      notes: assignment?.notes ?? '',
    }),
    [assignment],
  )

  const form = useForm({
    resolver: zodResolver(assignmentSchema),
    values: defaults,
  })

  async function onSubmit(values: z.output<typeof assignmentSchema>) {
    const payload = {
      title: values.title,
      description: values.description || null,
      module_id: values.moduleId === NO_MODULE ? null : values.moduleId,
      due_at: new Date(values.dueAt).toISOString(),
      priority: values.priority,
      weight: values.weight,
      estimated_minutes: Math.round(values.estimatedHours * 60),
      difficulty: Number(values.difficulty),
      status: values.status,
      progress: values.progress,
      grade: values.grade,
      submission_url: values.submissionUrl || null,
      notes: values.notes || null,
    }

    try {
      if (assignment) {
        await updateAssignment.mutateAsync({ id: assignment.id, patch: payload })
        toast.success('Assignment updated')
      } else {
        await createAssignment.mutateAsync(payload)
        toast.success('Assignment created')
      }
      onOpenChange(false)
    } catch (error) {
      if (error instanceof PlanLimitError) {
        onOpenChange(false)
        onLimitReached?.()
      }
      // Other errors surface via the global mutation toast.
    }
  }

  const busy = createAssignment.isPending || updateAssignment.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit assignment' : 'New assignment'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details — priority scores recalculate automatically.'
              : 'Add the details once; StudentOS plans the work for you.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Graph algorithms practical" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="moduleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Module</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_MODULE}>No module</SelectItem>
                      {modules.map((module) => (
                        <SelectItem key={module.id} value={module.id}>
                          {module.code ? `${module.code} — ${module.name}` : module.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dueAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date &amp; time</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Difficulty</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1">1 — Very easy</SelectItem>
                      <SelectItem value="2">2 — Easy</SelectItem>
                      <SelectItem value="3">3 — Moderate</SelectItem>
                      <SelectItem value="4">4 — Hard</SelectItem>
                      <SelectItem value="5">5 — Very hard</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="weight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Weight (% of grade)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} max={100} step={0.5} inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="estimatedHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated hours</FormLabel>
                  <FormControl>
                    <Input type="number" min={0.25} max={200} step={0.25} inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="not_started">Not started</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="graded">Graded</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="progress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Progress: {field.value}%</FormLabel>
                  <FormControl>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={Number(field.value)}
                      onChange={(event) => field.onChange(Number(event.target.value))}
                      className="accent-primary h-2 w-full cursor-pointer"
                      aria-label="Progress percentage"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch('status') === 'graded' ? (
              <FormField
                control={form.control}
                name="grade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade (%)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={100} step={0.5} inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="submissionUrl"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Submission link</FormLabel>
                  <FormControl>
                    <Input type="url" placeholder="https://…" inputMode="url" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Requirements, rubric, links…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Your working notes…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {isEditing ? 'Save changes' : 'Create assignment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
