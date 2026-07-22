import { zodResolver } from '@hookform/resolvers/zod'
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
import { useModules } from '@/features/assignments/hooks'
import { useCreateTask, useUpdateTask } from '@/features/planner/hooks'
import { optionalNumberField } from '@/lib/forms'
import { cn } from '@/lib/utils'
import type { Task, TaskRecurrence } from '@/types/models'

const NO_MODULE = 'none'
const WEEKDAYS = [
  { value: 1, label: 'M', name: 'Monday' },
  { value: 2, label: 'T', name: 'Tuesday' },
  { value: 3, label: 'W', name: 'Wednesday' },
  { value: 4, label: 'T', name: 'Thursday' },
  { value: 5, label: 'F', name: 'Friday' },
  { value: 6, label: 'S', name: 'Saturday' },
  { value: 0, label: 'S', name: 'Sunday' },
] as const

const taskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: z.string().trim().max(2000),
  scheduledOn: z.string(),
  startTime: z.string(),
  durationMinutes: optionalNumberField(z.number().min(5).max(720)),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  moduleId: z.string(),
  recurrenceFreq: z.enum(['none', 'daily', 'weekly', 'monthly']),
  weekdays: z.array(z.number()),
})
type TaskFormValues = z.input<typeof taskSchema>

interface TaskFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: Task | null
  /** Prefill for creation, e.g. the planner's visible day. */
  defaultDate?: string | null
}

function minutesToTime(minutes: number | null): string {
  if (minutes === null) return ''
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

function timeToMinutes(time: string): number | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function TaskFormDialog({ open, onOpenChange, task, defaultDate }: TaskFormDialogProps) {
  const { data: modules = [] } = useModules()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const isEditing = Boolean(task)

  const defaults = React.useMemo<TaskFormValues>(
    () => ({
      title: task?.title ?? '',
      notes: task?.notes ?? '',
      scheduledOn: task?.scheduled_on ?? defaultDate ?? '',
      startTime: minutesToTime(task?.start_minutes ?? null),
      durationMinutes: task?.duration_minutes ?? ('' as string | number),
      priority: task?.priority ?? 'medium',
      moduleId: task?.module_id ?? NO_MODULE,
      recurrenceFreq: task?.recurrence?.freq ?? 'none',
      weekdays: task?.recurrence?.weekdays ?? [],
    }),
    [task, defaultDate],
  )

  const form = useForm({
    resolver: zodResolver(taskSchema),
    values: defaults,
  })

  const recurrenceFreq = form.watch('recurrenceFreq')

  async function onSubmit(values: z.output<typeof taskSchema>) {
    const recurrence: TaskRecurrence | null =
      values.recurrenceFreq === 'none'
        ? null
        : {
            freq: values.recurrenceFreq,
            interval: 1,
            ...(values.recurrenceFreq === 'weekly' && values.weekdays.length
              ? { weekdays: values.weekdays }
              : {}),
          }

    const payload = {
      title: values.title,
      notes: values.notes || null,
      scheduled_on: values.scheduledOn || null,
      start_minutes: timeToMinutes(values.startTime),
      duration_minutes: values.durationMinutes,
      estimated_minutes: values.durationMinutes,
      priority: values.priority,
      module_id: values.moduleId === NO_MODULE ? null : values.moduleId,
      recurrence,
    }

    if (task) {
      await updateTask.mutateAsync({ id: task.id, patch: payload })
      toast.success('Task updated')
    } else {
      await createTask.mutateAsync(payload)
      toast.success('Task added')
    }
    onOpenChange(false)
  }

  const busy = createTask.isPending || updateTask.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>
            Tasks without a date live in the backlog until you schedule them.
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
                    <Input placeholder="Review lecture notes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scheduledOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="durationMinutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (minutes)</FormLabel>
                  <FormControl>
                    <Input type="number" min={5} max={720} step={5} inputMode="numeric" {...field} />
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
                          {module.code ?? module.name}
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
              name="recurrenceFreq"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repeats</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Never</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {recurrenceFreq === 'weekly' ? (
              <FormField
                control={form.control}
                name="weekdays"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>On days</FormLabel>
                    <FormControl>
                      <div className="flex gap-1.5" role="group" aria-label="Repeat on days">
                        {WEEKDAYS.map((day) => {
                          const selected = field.value.includes(day.value)
                          return (
                            <button
                              key={day.value}
                              type="button"
                              aria-pressed={selected}
                              aria-label={day.name}
                              onClick={() =>
                                field.onChange(
                                  selected
                                    ? field.value.filter((v: number) => v !== day.value)
                                    : [...field.value, day.value],
                                )
                              }
                              className={cn(
                                'size-9 rounded-full border text-sm font-medium transition-colors',
                                selected
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'hover:bg-accent',
                              )}
                            >
                              {day.label}
                            </button>
                          )
                        })}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
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
                {isEditing ? 'Save task' : 'Add task'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
