import * as React from 'react'
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
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])

  /**
   * Roving focus, as a radiogroup requires: one tab stop for the whole group,
   * arrows to move between options. Tabs gave this for free — without it,
   * replacing them would leave every option as its own tab stop and make the
   * control slower to get past with a keyboard, not faster.
   */
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = options.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === null) return

    event.preventDefault()
    // Arrows select as well as move, which is the radiogroup convention.
    onValueChange(options[next]!.value)
    refs.current[next]?.focus()
  }

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'bg-muted text-muted-foreground inline-flex h-10 w-fit items-center justify-center rounded-lg p-1',
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            // Only the active option is in the tab order; arrows reach the rest.
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
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
