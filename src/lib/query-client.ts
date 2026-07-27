import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { friendlyDbErrorMessage } from '@/services/db'

/**
 * Shared TanStack Query client.
 * - Queries: 30s freshness window keeps navigation snappy without hammering
 *   the backend; window refocus revalidates so realtime-ish data stays honest.
 * - Mutations: failures surface as toasts globally so features don't have to
 *   repeat error plumbing (they can still override with their own onError).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      // Background refetch failures should be quiet unless nothing is cached;
      // TanStack only calls this for hard failures.
      console.error('[query]', error)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      // Raw database errors (constraint names, table/column internals) are
      // never shown as-is — only short, plain-language messages reach users.
      toast.error(friendlyDbErrorMessage(error))
    },
  }),
})
