import { ChevronDown } from 'lucide-react'
import { motion, MotionConfig, type Transition } from 'motion/react'
import * as React from 'react'
import useMeasure from 'react-use-measure'
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'
import { cn } from '@/lib/utils'

/**
 * Split accordion — adapted from WatermelonUI's `card-split-accordian`.
 *
 * Installed with `npx shadcn@latest add @watermelon/card-split-accordian`,
 * then changed in four ways, all of which the house rules require:
 *
 * 1. **Retokenised.** It shipped `zinc-*` utilities with their own `dark:`
 *    variants and two hex literals. Those ignore our theme and do not follow a
 *    theme change; `tokens.test.ts` fails the build if they come back.
 * 2. **react-icons dropped.** It was imported solely for five demo items. The
 *    items are a prop now, so the whole package leaves the bundle.
 * 3. **Made accessible.** The original was a bare `<button>` with no
 *    `aria-expanded` and collapsed panels left in the accessibility tree —
 *    a screen reader read every answer whether or not it was open.
 * 4. **Reduced motion honoured**, and the fixed `w-xs` width removed so it
 *    fills whatever card it is put in.
 */

const SPRING: Transition = { type: 'spring', stiffness: 600, damping: 50, mass: 1 }
const INSTANT: Transition = { duration: 0 }

/** The open panel lifts away from its neighbours; this is that gap, and the radius. */
const OPEN_MARGIN = '10px'
const RADIUS = 20

export interface SplitAccordionItem {
  id: string
  title: string
  content: React.ReactNode
  icon?: React.ReactNode
}

interface ItemProps {
  item: SplitAccordionItem
  index: number
  total: number
  openIndex: number
  onToggle: (id: string | null) => void
}

function AccordionRow({ item, index, total, openIndex, onToggle }: ItemProps) {
  const [ref, bounds] = useMeasure()
  const panelId = React.useId()

  const isOpen = index === openIndex
  const isFirst = index === 0
  const isLast = index === total - 1
  const isBeforeOpen = index === openIndex - 1
  const isAfterOpen = index === openIndex + 1
  // A neighbour of the open row that is also at an end has nothing left to
  // join onto, so it rounds on all four corners rather than two.
  const isAlone = (isAfterOpen && isLast) || (isBeforeOpen && isFirst)

  // Rows share edges until one opens, at which point the stack splits and the
  // corners on either side of the gap round off.
  const radii =
    isOpen || isAlone
      ? { topLeft: RADIUS, topRight: RADIUS, bottomLeft: RADIUS, bottomRight: RADIUS }
      : isBeforeOpen
        ? { topLeft: 0, topRight: 0, bottomLeft: RADIUS, bottomRight: RADIUS }
        : isAfterOpen || isFirst
          ? { topLeft: RADIUS, topRight: RADIUS, bottomLeft: 0, bottomRight: 0 }
          : isLast
            ? { topLeft: 0, topRight: 0, bottomLeft: RADIUS, bottomRight: RADIUS }
            : { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 }

  return (
    <motion.li layout>
      <motion.div
        animate={{
          borderTopLeftRadius: radii.topLeft,
          borderTopRightRadius: radii.topRight,
          borderBottomLeftRadius: radii.bottomLeft,
          borderBottomRightRadius: radii.bottomRight,
          marginBlock: isOpen ? OPEN_MARGIN : '0px',
        }}
        className="border-border bg-card overflow-hidden border-solid will-change-transform"
        style={{
          // Shared edges are collapsed to 0 so adjacent rows do not draw a
          // double rule between them.
          borderTopWidth: isFirst || isAfterOpen || isOpen ? '1px' : '0px',
          borderBottomWidth: isLast || isBeforeOpen || isOpen ? '1px' : '0px',
          borderLeftWidth: '1px',
          borderRightWidth: '1px',
        }}
      >
        <button
          type="button"
          onClick={() => onToggle(isOpen ? null : item.id)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="hover:bg-accent/50 focus-visible:ring-ring flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="flex min-w-0 items-center gap-3">
            {item.icon ? (
              <span className="text-primary flex shrink-0 items-center">{item.icon}</span>
            ) : null}
            <span className="truncate text-sm font-semibold md:text-base">{item.title}</span>
          </span>
          <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="shrink-0">
            <ChevronDown aria-hidden className="text-muted-foreground size-5" />
          </motion.span>
        </button>

        <motion.div
          id={panelId}
          role="region"
          initial={false}
          animate={{ height: isOpen ? bounds.height : 0, opacity: isOpen ? 1 : 0 }}
          className="overflow-hidden will-change-transform"
          // Height alone does not hide a panel from a screen reader, and its
          // links stay in the tab order. Both need saying explicitly.
          aria-hidden={!isOpen}
          inert={!isOpen}
        >
          <div ref={ref}>
            <div className="text-muted-foreground px-3 pb-4 text-sm">{item.content}</div>
          </div>
        </motion.div>
      </motion.div>
    </motion.li>
  )
}

export interface SplitAccordionProps {
  items: SplitAccordionItem[]
  className?: string
}

/**
 * A stack of rows that splits apart to reveal the open one.
 *
 * One row open at a time — this is a list to skim, not a set of panels to
 * compare side by side.
 */
export function SplitAccordion({ items, className }: SplitAccordionProps) {
  const [openId, setOpenId] = React.useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const openIndex = items.findIndex((item) => item.id === openId)

  return (
    <MotionConfig transition={reducedMotion ? INSTANT : SPRING}>
      <ul className={cn('w-full', className)}>
        {items.map((item, index) => (
          <AccordionRow
            key={item.id}
            item={item}
            index={index}
            total={items.length}
            openIndex={openIndex}
            onToggle={setOpenId}
          />
        ))}
      </ul>
    </MotionConfig>
  )
}
