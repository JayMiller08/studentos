import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import * as React from 'react'
import { localDb } from '@/lib/local-db'
import { supabase } from '@/lib/supabase'

/**
 * Shared realtime channel registry.
 *
 * Supabase-js dedupes channels by topic, so calling `supabase.channel(topic)`
 * twice for the same topic returns the SAME channel — and adding a
 * `postgres_changes` binding to an already-subscribed channel throws
 * ("cannot add postgres_changes callbacks ... after subscribe()").
 *
 * Multiple components legitimately subscribe to the same table at once (e.g.
 * the layout's reminder hook and the dashboard both read assignments). To make
 * that safe we keep exactly ONE channel per (table, user) and fan every change
 * out to all registered listeners. `.on()` is therefore only ever called once,
 * before `.subscribe()`. Listeners are ref-counted; the channel is torn down
 * when the last subscriber leaves.
 */
interface ChannelEntry {
  channel: RealtimeChannel
  listeners: Set<() => void>
}

const registry = new Map<string, ChannelEntry>()

function subscribeShared(
  topic: string,
  tableName: string,
  userId: string,
  onChange: () => void,
): () => void {
  const client = supabase
  if (!client) return () => {}

  let entry = registry.get(topic)
  if (!entry) {
    const listeners = new Set<() => void>()
    const channel = client
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName, filter: `user_id=eq.${userId}` },
        () => {
          for (const listener of listeners) listener()
        },
      )
      .subscribe()
    entry = { channel, listeners }
    registry.set(topic, entry)
  }

  entry.listeners.add(onChange)

  return () => {
    const current = registry.get(topic)
    if (!current) return
    current.listeners.delete(onChange)
    if (current.listeners.size === 0) {
      registry.delete(topic)
      void client.removeChannel(current.channel)
    }
  }
}

/**
 * Keeps queries fresh when a table changes underneath them.
 * - Supabase mode: subscribes (via the shared registry) to Postgres changes
 *   for the user's rows.
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

    // One channel per table+user; the topic must be stable so subscribers share it.
    return subscribeShared(`db:${tableName}:${userId}`, tableName, userId, invalidate)
  }, [tableName, userId, keyJson, queryClient])
}
