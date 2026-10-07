import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface SectionCardProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  /** Rendered top-right — a filter, a "See all" link. */
  action?: React.ReactNode
  /** Drops the inner padding, for cards whose content is a table or a list. */
  flush?: boolean
  children: React.ReactNode
}

/**
 * The card every page was already building by hand.
 *
 * `CardTitle` + `text-base` + a `size-4 text-primary` icon appeared on nearly
 * every surface with the spacing retyped each time. One component means a new
 * page matches the others by default.
 */
function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  flush = false,
  className,
  children,
  ...props
}: SectionCardProps) {
  return (
    <Card className={className} {...props}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-base">
          {Icon ? <Icon aria-hidden className="text-primary size-4" /> : null}
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn(flush && 'px-0')}>{children}</CardContent>
    </Card>
  )
}

export { SectionCard }
