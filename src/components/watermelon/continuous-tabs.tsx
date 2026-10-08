import { LayoutGroup, motion, type Transition } from 'motion/react'
import * as React from 'react'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { cn } from '@/lib/utils'

/**
 * Continuous tabs — adapted from WatermelonUI's `continuous-tabs`.
 *
 * Installed with `npx shadcn@latest add @watermelon/continuous-tabs`, kept for
 * its one idea: a pill that *slides* to the chosen option on a spring, over a
 * track pressed into the surface. Changed in five ways:
 *
 * 1. **Retokenised.** It shipped hex colours, `zinc-*` and its own `dark:`
 *    variants; the track is now `bg-muted` + `shadow-track`, the pill is a
 *    card. `tokens.test.ts` fails if a raw palette comes back.
 * 2. **Accessible.** The original was a `<nav>` of unlabelled buttons with no
 *    selected state. This is a radiogroup with roving focus — one tab stop,
 *    arrows to move — because these controls switch what a page shows rather
 *    than revealing a tabpanel, so there is nothing for `aria-controls` to
 *    point at (see the note on ViewSwitcher, which this now powers).
 * 3. **One pill per instance.** It hard-coded `layoutId="active-pill"`, so two
 *    on the same page animated a single shared pill back and forth between
 *    them. `LayoutGroup` is now namespaced with `useId()`.
 * 4. **No blank first frame.** It rendered `null` until mounted, which made the
 *    control pop in after the page and shift the layout under it. Nothing here
 *    needs the DOM before first paint, so it renders immediately.
 * 5. **Controlled, reduced-motion aware.** The page owns the value; under
 *    reduced motion the pill moves instantly instead of springing.
 */

const SPRING: Transition = { type: 'spring', stiffness: 380, damping: 30, mass: 0.9 }
const INSTANT: Transition = { duration: 0 }

export interface ContinuousTabsOption<T extends string> {
  value: T
  label: string
}

export interface ContinuousTabsProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  options: ReadonlyArray<ContinuousTabsOption<T>>
  /** Names the group for screen readers, e.g. "Planner view". */
  label: string
  className?: string
}

export function ContinuousTabs<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: ContinuousTabsProps<T>) {
  const groupId = React.useId()
  const reducedMotion = usePrefersReducedMotion()
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])

  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )

  /** Roving focus, as a radiogroup requires: arrows move and select. */
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const last = options.length - 1
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    if (next === null) return

    event.preventDefault()
    onValueChange(options[next]!.value)
    refs.current[next]?.focus()
  }

  return (
    <LayoutGroup id={groupId}>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn(
          'bg-muted shadow-track inline-flex h-10 w-fit items-center rounded-xl border p-1',
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
              tabIndex={index === selectedIndex ? 0 : -1}
              onClick={() => onValueChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'focus-visible:ring-ring/60 relative inline-flex h-8 flex-1 items-center justify-center rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-200 focus-visible:ring-2 focus-visible:outline-none',
                selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {selected ? (
                <motion.span
                  aria-hidden
                  layoutId="continuous-tabs-pill"
                  transition={reducedMotion ? INSTANT : SPRING}
                  className="bg-card shadow-e1 absolute inset-0 rounded-lg border"
                />
              ) : null}
              <span className="relative">{option.label}</span>
            </button>
          )
        })}
      </div>
    </LayoutGroup>
  )
}
