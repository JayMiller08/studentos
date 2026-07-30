import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/**
 * Shown while a lazy route chunk is still loading. React Router also requires a
 * HydrateFallback on the root route — without one it warns on every page load,
 * because every feature page in this app is code-split.
 */
export function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <Loader2 aria-hidden className="text-muted-foreground size-6 animate-spin" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

/**
 * Route-level error page.
 *
 * The top-level <ErrorBoundary> cannot catch these: React Router intercepts
 * errors thrown inside routes and renders its own (developer-facing) screen
 * unless a route supplies an errorElement. This gives those failures the same
 * friendly treatment as the rest of the app.
 */
export function RouteError() {
  const error = useRouteError()

  const message = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred.'

  // A stale chunk after a deploy is the common case and a reload fixes it.
  const isChunkError =
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed/.test(
      error.message,
    )

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
        <AlertTriangle aria-hidden className="size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">This page didn’t load</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          {isChunkError
            ? 'A new version of StudentOS was just released. Reload to pick it up.'
            : 'Your data is safe. Try again, and if this keeps happening please contact support.'}
        </p>
        <p className="text-muted-foreground/70 max-w-md pt-1 font-mono text-xs break-words">
          {message}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => window.location.reload()}>
          <RotateCcw /> Reload
        </Button>
        <Button asChild variant="outline">
          <Link to="/app">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
