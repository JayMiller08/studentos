import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Placeholders for a page whose data has not arrived.
 *
 * Every page but Assignments defaulted its query to `[]` and rendered straight
 * away, so a student with fifty notes saw "No notes here yet" for a beat before
 * their notes appeared. An empty state is a claim that there is nothing; these
 * shapes say "not yet", which is the true one.
 */

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <Card className={className} aria-hidden>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent className="space-y-2.5">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton
            key={index}
            className="h-4"
            // Ragged widths: a stack of identical bars reads as a broken table
            // rather than as text that is still loading.
            style={{ width: `${[92, 74, 84, 62, 80][index % 5]}%` }}
          />
        ))}
      </CardContent>
    </Card>
  )
}

export function StatRowSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-3', className)} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-20 rounded-lg" />
      ))}
    </div>
  )
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5" style={{ width: `${[70, 55, 64, 48, 60][index % 5]}%` }} />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

export interface PageSkeletonProps {
  /** Cards to draw under the header. */
  cards?: number
  /** Draw a row of stat tiles above the cards. */
  stats?: number
  className?: string
}

/**
 * A whole page's worth of placeholders.
 *
 * Announced politely rather than silently: a screen reader user gets "Loading"
 * once, instead of either nothing at all or a stream of empty regions.
 */
export function PageSkeleton({ cards = 4, stats, className }: PageSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {stats ? <StatRowSkeleton count={stats} /> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, index) => (
          <CardSkeleton key={index} lines={index % 2 === 0 ? 4 : 3} />
        ))}
      </div>
    </div>
  )
}
