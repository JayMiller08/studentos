import { zodResolver } from '@hookform/resolvers/zod'
import { format, parseISO } from 'date-fns'
import { Loader2, Trash2 } from 'lucide-react'
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
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '@/features/calendar/hooks'
import { cn } from '@/lib/utils'
import type { CalendarEvent, TaskRecurrence } from '@/types/models'

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

const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().max(2000),
    eventType: z.enum(['class', 'exam', 'event', 'study_block']),
    startsAt: z.string().min(1, 'Start is required'),
    endsAt: z.string().min(1, 'End is required'),
    location: z.string().trim().max(200),
    moduleId: z.string(),
    recurrenceFreq: z.enum(['none', 'daily', 'weekly', 'monthly']),
    weekdays: z.array(z.number()),
  })
  .refine((values) => new Date(values.endsAt) >= new Date(values.startsAt), {
    path: ['endsAt'],
    message: 'End must be after start',
  })
type EventFormValues = z.input<typeof eventSchema>

interface EventFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: CalendarEvent | null
  /** Prefill start when creating from a calendar cell. */
  defaultStart?: Date | null
}

export function EventFormDialog({ open, onOpenChange, event, defaultStart }: EventFormDialogProps) {
  const { data: modules = [] } = useModules()
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const deleteEvent = useDeleteEvent()
  const isEditing = Boolean(event)

  const defaults = React.useMemo<EventFormValues>(() => {
    const start = event ? parseISO(event.starts_at) : (defaultStart ?? new Date())
    const end = event ? parseISO(event.ends_at) : new Date(start.getTime() + 60 * 60 * 1000)
    return {
      title: event?.title ?? '',
      description: event?.description ?? '',
      eventType: event && event.event_type !== 'deadline' ? event.event_type : 'event',
      startsAt: format(start, "yyyy-MM-dd'T'HH:mm"),
      endsAt: format(end, "yyyy-MM-dd'T'HH:mm"),
      location: event?.location ?? '',
      moduleId: event?.module_id ?? NO_MODULE,
      recurrenceFreq: event?.recurrence?.freq ?? 'none',
      weekdays: event?.recurrence?.weekdays ?? [],
    }
  }, [event, defaultStart])

  const form = useForm({
    resolver: zodResolver(eventSchema),
    values: defaults,
  })

  const recurrenceFreq = form.watch('recurrenceFreq')

  async function onSubmit(values: z.output<typeof eventSchema>) {
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

    const module = modules.find((m) => m.id === values.moduleId)
    const payload = {
      title: values.title,
      description: values.description || null,
      event_type: values.eventType,
      starts_at: new Date(values.startsAt).toISOString(),
      ends_at: new Date(values.endsAt).toISOString(),
      location: values.location || null,
      module_id: values.moduleId === NO_MODULE ? null : values.moduleId,
      color: module?.color ?? null,
      recurrence,
    }

    if (event) {
      await updateEvent.mutateAsync({ id: event.id, patch: payload })
      toast.success('Event updated')
    } else {
      await createEvent.mutateAsync(payload)
      toast.success('Event added')
    }
    onOpenChange(false)
  }

  const busy = createEvent.isPending || updateEvent.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit event' : 'New event'}</DialogTitle>
          <DialogDescription>
            Classes can repeat weekly — pick the days below and your timetable builds itself.
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
                    <Input placeholder="Linear Algebra lecture" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="eventType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="class">Class</SelectItem>
                      <SelectItem value="exam">Exam</SelectItem>
                      <SelectItem value="study_block">Study block</SelectItem>
                      <SelectItem value="event">Other</SelectItem>
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
              name="startsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Starts</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ends</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="Lecture hall 2A" {...field} />
                  </FormControl>
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
              name="description"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="sm:col-span-2 sm:justify-between">
              {isEditing ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (event) {
                      deleteEvent.mutate(event.id, {
                        onSuccess: () => {
                          toast.success('Event deleted')
                          onOpenChange(false)
                        },
                      })
                    }
                  }}
                >
                  <Trash2 /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {isEditing ? 'Save event' : 'Add event'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
