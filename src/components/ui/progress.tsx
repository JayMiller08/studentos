import * as ProgressPrimitive from '@radix-ui/react-progress'
import type * as React from 'react'
import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('bg-primary/15 relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
      // After the spread so a caller's own label wins. role="progressbar"
      // without a name is a serious axe violation and every bar in the app
      // inherited it; this is the floor, not an excuse to skip a real one.
      aria-label={props['aria-label'] ?? 'Progress'}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn('bg-primary h-full w-full flex-1 transition-transform duration-500', indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
