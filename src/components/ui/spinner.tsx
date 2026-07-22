import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  label?: string
}

function Spinner({ className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2">
      <Loader2 aria-hidden className={cn('size-4 animate-spin text-muted-foreground', className)} />
      <span className="sr-only">{label}…</span>
    </span>
  )
}

/** Centered full-area loading state used by route suspense boundaries. */
function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <Spinner className="size-6" label={label} />
    </div>
  )
}

export { Spinner, PageLoader }
