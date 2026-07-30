import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/auth-provider'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { queryKeys } from '@/lib/query-keys'
import { notesService } from '@/services/notes-service'

/** The user's notes, kept live. Shared so every reader hits the same cache. */
export function useNotes() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('notes', userId, userId ? queryKeys.notes(userId) : [])
  return useQuery({
    queryKey: queryKeys.notes(userId ?? ''),
    queryFn: () => notesService.list(userId!),
    enabled: Boolean(userId),
  })
}

export function useNoteFolders() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('note_folders', userId, userId ? queryKeys.noteFolders(userId) : [])
  return useQuery({
    queryKey: queryKeys.noteFolders(userId ?? ''),
    queryFn: () => notesService.listFolders(userId!),
    enabled: Boolean(userId),
  })
}
