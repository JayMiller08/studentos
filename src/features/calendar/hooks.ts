import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/auth-provider'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { queryKeys } from '@/lib/query-keys'
import { type CalendarEventInput, calendarService } from '@/services/calendar-service'
import type { CalendarEvent } from '@/types/models'

export function useCalendarEvents() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('calendar_events', userId, userId ? queryKeys.allCalendarEvents(userId) : [])
  return useQuery({
    queryKey: queryKeys.allCalendarEvents(userId ?? ''),
    queryFn: () => calendarService.list(userId!),
    enabled: Boolean(userId),
  })
}

export function useCreateEvent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CalendarEventInput) => calendarService.create(user!.id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allCalendarEvents(user!.id) })
    },
  })
}

export function useUpdateEvent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CalendarEventInput> }) =>
      calendarService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      const key = queryKeys.allCalendarEvents(user!.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CalendarEvent[]>(key)
      if (previous) {
        queryClient.setQueryData<CalendarEvent[]>(
          key,
          previous.map((event) =>
            event.id === id ? ({ ...event, ...patch } as CalendarEvent) : event,
          ),
        )
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.allCalendarEvents(user!.id), context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allCalendarEvents(user!.id) })
    },
  })
}

export function useDeleteEvent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => calendarService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.allCalendarEvents(user!.id) })
    },
  })
}
