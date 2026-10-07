import type * as React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** A small label above the title — the date, a section, a count. */
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/**
 * Standard page heading with optional action buttons.
 *
 * Sized as the page's one headline: the title was the same 24px as a card's
 * hero text, so nothing told the eye where a page begins.
 */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      {/* `data-tour` hooks give every page two anchors for free, and double as
          the "this page has rendered" signal the tour waits on. */}
      <div data-tour="page-header" className="min-w-0">
        {eyebrow ? (
          // primary-strong in light mode: small primary text on the lit
          // backdrop measured 4.40:1. Dark mode keeps the lighter primary,
          // which is the one that clears 4.5:1 against a dark page.
          <p className="text-primary-strong dark:text-primary mb-1.5 text-xs font-semibold tracking-[0.14em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="truncate text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-[0.9375rem]">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div data-tour="page-actions" className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
