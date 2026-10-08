import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/auth-provider'
import { useAwardXp } from '@/hooks/use-award-xp'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { queryKeys } from '@/lib/query-keys'
import { type TaskInput, tasksService } from '@/services/tasks-service'
import type { Task } from '@/types/models'

export function useTasks() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('tasks', userId, userId ? queryKeys.tasks(userId) : [])
  return useQuery({
    queryKey: queryKeys.tasks(userId ?? ''),
    queryFn: () => tasksService.list(userId!),
    enabled: Boolean(userId),
  })
}

export function useCreateTask() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskInput) =>
      tasksService.create(user!.id, profile?.plan ?? 'free', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(user!.id) })
    },
  })
}

export function useUpdateTask() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) =>
      tasksService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      const key = queryKeys.tasks(user!.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Task[]>(key)
      if (previous) {
        queryClient.setQueryData<Task[]>(
          key,
          previous.map((task) => (task.id === id ? { ...task, ...patch } : task)),
        )
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.tasks(user!.id), context.previous)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(user!.id) })
    },
  })
}

export function useToggleTask() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const awardXp = useAwardXp()
  return useMutation({
    mutationFn: ({ task, completed }: { task: Task; completed: boolean }) =>
      tasksService.setCompleted(task, completed),
    onMutate: async ({ task, completed }) => {
      const key = queryKeys.tasks(user!.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Task[]>(key)
      if (previous) {
        queryClient.setQueryData<Task[]>(
          key,
          previous.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: completed ? 'done' : 'todo',
                  completed_at: completed ? new Date().toISOString() : null,
                }
              : t,
          ),
        )
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.tasks(user!.id), context.previous)
    },
    onSuccess: (_data, { task, completed }) => {
      // Every completion is reported: it counts toward the daily streak, and
      // the ledger — keyed on the task — pays only the first. Un-ticking and
      // re-ticking used to pay again, because the old check could only see the
      // task's status at that moment.
      if (completed) void awardXp('task_completed', task.id)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(user!.id) })
    },
  })
}

export function useDeleteTask() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks(user!.id) })
    },
  })
}
