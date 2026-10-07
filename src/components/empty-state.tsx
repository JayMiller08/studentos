import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { Mascot } from '@/components/art'
import type { ArtName } from '@/lib/art'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  /**
   * Show the mascot instead of the icon disc. Worth it on a page a student
   * lands on with nothing yet — the first note, the first habit — where the
   * screen is otherwise empty and a small grey glyph reads as a failure state.
   */
  art?: ArtName
  className?: string
}

/** Consistent empty state used across features. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  art,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        // The glow sits behind the art and fades out well before the dashed
        // edge, so the border still reads as a boundary rather than a halo.
        'relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed px-6 py-12 text-center',
        'before:from-primary/8 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-40 before:bg-gradient-to-b before:to-transparent',
        className,
      )}
    >
      {art ? (
        <Mascot art={art} className="relative" />
      ) : (
        <div className="bg-secondary text-secondary-foreground relative flex size-12 items-center justify-center rounded-full">
          <Icon aria-hidden className="size-6" />
        </div>
      )}
      <div className="relative space-y-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>
        ) : null}
      </div>
      {action ? <div className="relative mt-1">{action}</div> : null}
    </div>
  )
}
