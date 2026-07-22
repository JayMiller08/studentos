import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/auth-provider'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { queryKeys } from '@/lib/query-keys'
import { focusService, type LogSessionInput } from '@/services/focus-service'

export function useStudySessions() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('study_sessions', userId, userId ? queryKeys.studySessions(userId) : [])
  return useQuery({
    queryKey: queryKeys.studySessions(userId ?? ''),
    queryFn: () => focusService.listSessions(userId!),
    enabled: Boolean(userId),
  })
}

export function useLogSession() {
  const { user, profile, refreshProfile } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LogSessionInput) => focusService.logSession(user!.id, profile, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studySessions(user!.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.pomodoroSessions(user!.id) })
      void refreshProfile() // streak may have advanced
    },
  })
}
