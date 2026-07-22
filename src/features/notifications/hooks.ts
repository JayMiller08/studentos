import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useAuth } from '@/app/providers/auth-provider'
import { useAssignments } from '@/features/assignments/hooks'
import { useCalendarEvents } from '@/features/calendar/hooks'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { queryKeys } from '@/lib/query-keys'
import { notificationsService } from '@/services/notifications-service'

export function useNotifications() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('notifications', userId, userId ? queryKeys.notifications(userId) : [])
  return useQuery({
    queryKey: queryKeys.notifications(userId ?? ''),
    queryFn: () => notificationsService.list(userId!),
    enabled: Boolean(userId),
  })
}

export function useNotificationActions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(user!.id) })
  }
  const markRead = useMutation({
    mutationFn: (id: string) => notificationsService.markRead(id),
    onSuccess: invalidate,
  })
  const markAllRead = useMutation({
    mutationFn: () => notificationsService.markAllRead(user!.id),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => notificationsService.remove(id),
    onSuccess: invalidate,
  })
  return { markRead, markAllRead, remove }
}

/**
 * Generates today's assignment/exam reminders once per app session,
 * after the underlying data has loaded.
 */
export function useReminderGeneration() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()
  const { data: assignments } = useAssignments()
  const { data: events } = useCalendarEvents()
  const ranRef = React.useRef(false)

  React.useEffect(() => {
    if (ranRef.current) return
    if (!user || !profile || !assignments || !events) return
    ranRef.current = true
    void notificationsService
      .generateReminders(user.id, {
        assignments,
        events,
        prefs: profile.notification_prefs,
      })
      .then((fresh) => {
        if (fresh.length > 0) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(user.id) })
        }
      })
      .catch((error) => console.error('[reminders]', error))
  }, [user, profile, assignments, events, queryClient])
}
