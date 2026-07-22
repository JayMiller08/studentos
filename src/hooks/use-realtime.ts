import { useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { localDb } from '@/lib/local-db'
import { supabase } from '@/lib/supabase'

/**
 * Keeps queries fresh when a table changes underneath them.
 * - Supabase mode: subscribes to Postgres changes for the user's rows.
 * - Demo mode: subscribes to the local store's change events.
 * Any change invalidates the given query key prefix, so open views update in
 * realtime across tabs/devices.
 */
export function useRealtimeTable(
  tableName: string,
  userId: string | undefined,
  queryKeyPrefix: readonly unknown[],
): void {
  const queryClient = useQueryClient()
  // Serialize so the effect doesn't resubscribe on referentially-new keys.
  const keyJson = JSON.stringify(queryKeyPrefix)

  React.useEffect(() => {
    if (!userId) return
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: JSON.parse(keyJson) as unknown[] })
    }

    if (!supabase) {
      return localDb.subscribe(tableName, invalidate)
    }

    const channel = supabase
      .channel(`realtime:${tableName}:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName, filter: `user_id=eq.${userId}` },
        invalidate,
      )
      .subscribe()

    return () => {
      void supabase?.removeChannel(channel)
    }
  }, [tableName, userId, keyJson, queryClient])
}
