import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/auth-provider'
import { useAwardXp } from '@/hooks/use-award-xp'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { queryKeys } from '@/lib/query-keys'
import {
  type AssignmentInput,
  assignmentsService,
} from '@/services/assignments-service'
import { type ModuleInput, modulesService } from '@/services/modules-service'
import type { Assignment } from '@/types/models'

export function useModules() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('modules', userId, userId ? queryKeys.modules(userId) : [])
  return useQuery({
    queryKey: queryKeys.modules(userId ?? ''),
    queryFn: () => modulesService.list(userId!),
    enabled: Boolean(userId),
  })
}

export function useCreateModule() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ModuleInput) => modulesService.create(user!.id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.modules(user!.id) })
    },
  })
}

export function useDeleteModule() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => modulesService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.modules(user!.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments(user!.id) })
    },
  })
}

export function useAssignments() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('assignments', userId, userId ? queryKeys.assignments(userId) : [])
  return useQuery({
    queryKey: queryKeys.assignments(userId ?? ''),
    queryFn: () => assignmentsService.list(userId!),
    enabled: Boolean(userId),
  })
}

export function useCreateAssignment() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const awardXp = useAwardXp()
  return useMutation({
    mutationFn: (input: AssignmentInput) =>
      assignmentsService.create(user!.id, profile?.plan ?? 'free', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments(user!.id) })
      void awardXp('assignment_created')
    },
  })
}

export function useUpdateAssignment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const awardXp = useAwardXp()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<AssignmentInput> }) =>
      assignmentsService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      // Optimistic progress/status updates keep the list feeling instant.
      const key = queryKeys.assignments(user!.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Assignment[]>(key)
      // Reward the first transition into "submitted".
      const wasSubmitted = previous?.find((a) => a.id === id)?.status === 'submitted'
      if (previous) {
        queryClient.setQueryData<Assignment[]>(
          key,
          previous.map((a) => (a.id === id ? ({ ...a, ...patch } as Assignment) : a)),
        )
      }
      return { previous, justSubmitted: patch.status === 'submitted' && !wasSubmitted }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.assignments(user!.id), context.previous)
      }
    },
    onSuccess: (_data, _vars, context) => {
      if (context?.justSubmitted) void awardXp('assignment_submitted')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments(user!.id) })
    },
  })
}

export function useDeleteAssignment() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => assignmentsService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.assignments(user!.id) })
    },
  })
}
