import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import { Check, Flame, MoreHorizontal, Plus, Sprout, Trash2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '@/app/providers/auth-provider'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { useAwardXp } from '@/hooks/use-award-xp'
import { numberField } from '@/lib/forms'
import { queryKeys } from '@/lib/query-keys'
import { cn, toDateKey, todayKey } from '@/lib/utils'
import { MODULE_COLORS } from '@/services/modules-service'
import {
  completedThisPeriod,
  completionRate,
  dailyStreak,
  habitsService,
} from '@/services/habits-service'
import type { Habit } from '@/types/models'

const HEATMAP_DAYS = 84 // 12 weeks
const EMOJI_CHOICES = ['✅', '📖', '💪', '😴', '💧', '🧘', '🏃', '🥗', '🧹', '💻', '🎸', '🌅']

const habitSchema = z.object({
  name: z.string().trim().min(2, 'Give the habit a name').max(80),
  emoji: z.string(),
  color: z.string(),
  cadence: z.enum(['daily', 'weekly', 'monthly']),
  targetCount: numberField(z.number().min(1).max(50)),
})
type HabitFormValues = z.input<typeof habitSchema>

function useHabits() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('habits', userId, userId ? queryKeys.habits(userId) : [])
  return useQuery({
    queryKey: queryKeys.habits(userId ?? ''),
    queryFn: () => habitsService.list(userId!),
    enabled: Boolean(userId),
  })
}

function useHabitLogs() {
  const { user } = useAuth()
  const userId = user?.id
  const from = toDateKey(subDays(new Date(), HEATMAP_DAYS))
  const to = todayKey()
  useRealtimeTable('habit_logs', userId, userId ? queryKeys.allHabitLogs(userId) : [])
  return useQuery({
    queryKey: queryKeys.habitLogs(userId ?? '', from, to),
    queryFn: () => habitsService.listLogs(userId!, from, to),
    enabled: Boolean(userId),
  })
}

function HabitFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const form = useForm({
    resolver: zodResolver(habitSchema),
    defaultValues: {
      name: '',
      emoji: '✅',
      color: MODULE_COLORS[0],
      cadence: 'daily',
      targetCount: 1,
    } satisfies HabitFormValues,
  })

  async function onSubmit(values: z.output<typeof habitSchema>) {
    await habitsService.create(user!.id, {
      name: values.name,
      emoji: values.emoji,
      color: values.color,
      cadence: values.cadence,
      target_count: values.targetCount,
    })
    void queryClient.invalidateQueries({ queryKey: queryKeys.habits(user!.id) })
    toast.success('Habit created')
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New habit</DialogTitle>
          <DialogDescription>Small, repeatable, kind to future-you.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Morning review" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="emoji"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Habit icon">
                      {EMOJI_CHOICES.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          role="radio"
                          aria-checked={field.value === emoji}
                          onClick={() => field.onChange(emoji)}
                          className={cn(
                            'flex size-9 items-center justify-center rounded-lg border text-lg transition-colors',
                            field.value === emoji ? 'border-primary bg-primary/10' : 'hover:bg-accent',
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="cadence"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cadence</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Times per period</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={50} inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Habit color">
                      {MODULE_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={field.value === color}
                          aria-label={`Color ${color}`}
                          onClick={() => field.onChange(color)}
                          className={cn(
                            'size-7 rounded-full border-2 transition-transform',
                            field.value === color ? 'border-foreground scale-110' : 'border-transparent',
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                <Plus /> Create habit
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function HabitsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const awardXp = useAwardXp()
  const { data: habitList = [] } = useHabits()
  const { data: logs = [] } = useHabitLogs()
  const [formOpen, setFormOpen] = React.useState(false)

  const logDatesByHabit = React.useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const log of logs) {
      const set = map.get(log.habit_id) ?? new Set<string>()
      set.add(log.log_date)
      map.set(log.habit_id, set)
    }
    return map
  }, [logs])

  const toggleLog = useMutation({
    mutationFn: ({ habit, dateKey }: { habit: Habit; dateKey: string }) =>
      habitsService.toggleLog(user!.id, habit.id, dateKey),
    onSuccess: (completed) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allHabitLogs(user!.id) })
      if (completed) void awardXp('habit_completed')
    },
  })

  const removeHabit = useMutation({
    mutationFn: (id: string) => habitsService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.habits(user!.id) })
      toast.success('Habit deleted')
    },
  })

  const last7Days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() })
  const heatmapDays = eachDayOfInterval({
    start: subDays(new Date(), HEATMAP_DAYS - 1),
    end: new Date(),
  })
  const logCountByDay = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const log of logs) map.set(log.log_date, (map.get(log.log_date) ?? 0) + 1)
    return map
  }, [logs])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Habits"
        description="Consistency beats intensity — build streaks that stick"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus /> New habit
          </Button>
        }
      />

      {habitList.length === 0 ? (
        <EmptyState
          icon={Sprout}
          title="No habits yet"
          description="Start with one tiny daily habit — review your notes for 10 minutes, drink water, sleep on time."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus /> Create your first habit
            </Button>
          }
        />
      ) : (
        <>
          {/* Today + weekly grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This week</CardTitle>
              <CardDescription>Tap any day to toggle it</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-130 border-separate border-spacing-y-1.5">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <th className="w-56 pb-1 text-left font-medium">Habit</th>
                    {last7Days.map((day) => (
                      <th key={toDateKey(day)} className="pb-1 text-center font-medium">
                        <span className={cn(toDateKey(day) === todayKey() && 'text-primary font-semibold')}>
                          {format(day, 'EEEEE')}
                          <br />
                          {format(day, 'd')}
                        </span>
                      </th>
                    ))}
                    <th className="w-20 pb-1 text-right font-medium">Streak</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {habitList.map((habit) => {
                    const dates = logDatesByHabit.get(habit.id) ?? new Set<string>()
                    const streak = dailyStreak(dates)
                    const rate = completionRate(dates, habit.created_at, 30)
                    const period = completedThisPeriod(habit, logs)
                    return (
                      <tr key={habit.id}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span
                              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-base"
                              style={{ backgroundColor: `color-mix(in oklab, ${habit.color} 15%, transparent)` }}
                              aria-hidden
                            >
                              {habit.emoji}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{habit.name}</p>
                              <p className="text-muted-foreground text-xs">
                                {habit.cadence === 'daily'
                                  ? `${rate}% last 30 days`
                                  : `${period.count}/${habit.target_count} this ${habit.cadence === 'weekly' ? 'week' : 'month'}`}
                              </p>
                            </div>
                          </div>
                        </td>
                        {last7Days.map((day) => {
                          const dayKey = toDateKey(day)
                          const done = dates.has(dayKey)
                          return (
                            <td key={dayKey} className="text-center">
                              <button
                                type="button"
                                aria-label={`${habit.name} on ${format(day, 'EEEE d MMMM')}: ${done ? 'done' : 'not done'}`}
                                aria-pressed={done}
                                onClick={() => toggleLog.mutate({ habit, dateKey: dayKey })}
                                className={cn(
                                  'inline-flex size-7 items-center justify-center rounded-md border transition-colors',
                                  done ? 'border-transparent text-white' : 'hover:bg-accent',
                                )}
                                style={done ? { backgroundColor: habit.color } : undefined}
                              >
                                {done ? <Check className="size-4" strokeWidth={3} /> : null}
                              </button>
                            </td>
                          )
                        })}
                        <td className="text-right">
                          {streak > 0 ? (
                            <span className="text-warning-foreground dark:text-warning inline-flex items-center gap-1 text-sm font-semibold">
                              <Flame aria-hidden className="size-4" /> {streak}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Options for ${habit.name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={() => removeHabit.mutate(habit.id)}
                              >
                                <Trash2 /> Delete habit
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last 12 weeks</CardTitle>
              <CardDescription>Habit completions per day, across all habits</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-1"
                role="img"
                aria-label="Habit completion heatmap for the last 12 weeks"
              >
                {heatmapDays.map((day) => {
                  const dayKey = toDateKey(day)
                  const count = logCountByDay.get(dayKey) ?? 0
                  const intensity =
                    habitList.length === 0 ? 0 : Math.min(1, count / habitList.length)
                  return (
                    <Tooltip key={dayKey}>
                      <TooltipTrigger asChild>
                        <div
                          className="size-3.5 rounded-[4px]"
                          style={{
                            backgroundColor:
                              count === 0
                                ? 'var(--muted)'
                                : `color-mix(in oklab, var(--primary) ${25 + intensity * 75}%, var(--muted))`,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {format(parseISO(dayKey), 'd MMM')}: {count} completion{count === 1 ? '' : 's'}
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <HabitFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
