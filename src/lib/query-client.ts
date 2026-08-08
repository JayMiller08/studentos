import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CircuitOpenError, isTransportFailure } from '@/lib/request-guard'
import { friendlyDbErrorMessage } from '@/services/db'

/** Cap on how long a retry waits, so a stale tab isn't stuck for minutes. */
const MAX_RETRY_DELAY_MS = 20_000

/**
 * Exponential backoff with full jitter.
 *
 * The default backoff is exponential but deterministic, so every client that
 * failed at the same moment — which is what a backend wobble produces — comes
 * back at the same moment too, and the retry wave is as heavy as the original
 * one. Randomising the delay spreads that arrival out.
 */
function retryDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS)
  return Math.round(base * (0.5 + Math.random() * 0.5))
}

/**
 * Retry only what could plausibly succeed next time.
 *
 * A request the server *answered* — 403, 404, a constraint violation — will be
 * answered the same way on every attempt. Retrying those spends the user's
 * connection and the backend's capacity to arrive at the identical failure.
 * And once the breaker is open, retrying is exactly the pile-up it exists to
 * prevent.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof CircuitOpenError) return false
  if (!isTransportFailure(error)) return false
  return failureCount < 2
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: shouldRetry,
      retryDelay,
      refetchOnWindowFocus: true,
      // Don't fire queries the browser already knows cannot leave the device;
      // TanStack resumes them itself once connectivity returns.
      networkMode: 'online',
    },
    mutations: {
      // A write that failed mid-flight may have landed. Replaying it is the
      // caller's decision, not a default.
      retry: 0,
      networkMode: 'online',
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
