import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/auth-provider'
import { useAwardXp } from '@/hooks/use-award-xp'
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
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const awardXp = useAwardXp()
  return useMutation({
    mutationFn: (input: LogSessionInput) => focusService.logSession(user!.id, input),
    onSuccess: (session, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studySessions(user!.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.pomodoroSessions(user!.id) })
      // A finished focus phase pays XP. Any other time studied — deep work, a
      // pomodoro stopped early — pays nothing but still keeps the streak.
      // Either way the database advances the streak, once a day.
      if (input.pomodoro?.kind === 'focus' && input.pomodoro.completed) {
        void awardXp('pomodoro_completed', session.id)
      } else if (input.minutes > 0) {
        void awardXp('study_session', session.id)
      }
    },
  })
}
