import type * as React from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

/** Standard page heading with optional action buttons. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {/* `data-tour` hooks give every page two anchors for free, and double as
          the "this page has rendered" signal the tour waits on. */}
      <div data-tour="page-header" className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground mt-1 text-sm">{description}</p> : null}
      </div>
      {actions ? (
        <div data-tour="page-actions" className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
