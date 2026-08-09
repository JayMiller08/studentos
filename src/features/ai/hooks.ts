import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/auth-provider'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { queryKeys } from '@/lib/query-keys'
import { type SaveStudyPlanInput, studyPlansService } from '@/services/study-plans-service'

/** The student's saved study plans, most recently edited first. */
export function useStudyPlans() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('study_plans', userId, userId ? queryKeys.studyPlans(userId) : [])
  return useQuery({
    queryKey: queryKeys.studyPlans(userId ?? ''),
    queryFn: () => studyPlansService.list(userId!),
    enabled: Boolean(userId),
  })
}

/** Invalidate the saved-plan list after a write. */
function useInvalidatePlans() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.studyPlans(user!.id) })
  }
}

export function useSaveStudyPlan() {
  const { user } = useAuth()
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: (input: SaveStudyPlanInput) => studyPlansService.create(user!.id, input),
    onSuccess: invalidate,
  })
}

export function useUpdateStudyPlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SaveStudyPlanInput }) =>
      studyPlansService.update(id, input),
    onSuccess: invalidate,
  })
}

export function useRenameStudyPlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => studyPlansService.rename(id, name),
    onSuccess: invalidate,
  })
}

export function useDeleteStudyPlan() {
  const invalidate = useInvalidatePlans()
  return useMutation({
    mutationFn: (id: string) => studyPlansService.remove(id),
    onSuccess: invalidate,
  })
}
