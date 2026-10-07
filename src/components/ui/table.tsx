import type * as React from 'react'
import { cn } from '@/lib/utils'

const VARIANTS = {
  /** Rows of values: padded cells, a rule between rows. */
  data: '',
  /**
   * A grid of controls rather than a table of values — the habit tracker's
   * day toggles. Each cell is a button that sets its own hit area, so cell
   * padding only pushes them apart; rows are separated by space, not a rule.
   * Set here rather than at every call site: overriding four cell classes on
   * each of nine cells is how a primitive stops being one.
   */
  grid: 'border-separate border-spacing-y-1.5 [&_td]:px-0 [&_td]:py-0 [&_th]:h-auto [&_th]:px-0 [&_th]:pb-1',
} as const

export interface TableProps extends React.ComponentProps<'table'> {
  variant?: keyof typeof VARIANTS
}

/**
 * A plain, themed table.
 *
 * Three pages were hand-rolling `<table>` with their own spacing; this keeps
 * the semantics (which screen readers need) and gives them one appearance. The
 * wrapper scrolls horizontally so a wide table never widens the page on a phone.
 */
function Table({ className, variant = 'data', ...props }: TableProps) {
  return (
    <div data-slot="table-wrapper" className="w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', VARIANTS[variant], className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('hover:bg-accent/50 border-b transition-colors', className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-muted-foreground h-10 px-3 text-left align-middle text-xs font-medium',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td data-slot="table-cell" className={cn('px-3 py-2.5 align-middle', className)} {...props} />
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-muted-foreground mt-3 text-xs', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption }
