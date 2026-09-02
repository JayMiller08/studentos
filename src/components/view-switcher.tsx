import { cn } from '@/lib/utils'

interface ViewSwitcherProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
  /** Names the group for screen readers, e.g. "Planner view". */
  label: string
  className?: string
}

/**
 * A segmented control for switching what a page shows.
 *
 * Deliberately not `<Tabs>`. These controls change the content of the page
 * itself rather than revealing a tabpanel, so there is nothing for a tab's
 * `aria-controls` to point at — Radix emitted an id that never existed, which
 * axe flags as a critical `aria-valid-attr-value` failure. A radiogroup
 * describes what this actually is: pick one of several views.
 *
 * Styling matches TabsList/TabsTrigger so the change is invisible on screen.
 */
export function ViewSwitcher<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: ViewSwitcherProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-10 w-fit items-center justify-center rounded-lg p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'focus-visible:ring-ring/60 inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-2 focus-visible:outline-none',
              selected && 'bg-card text-foreground shadow-xs',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
