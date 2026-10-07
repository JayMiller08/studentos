import type { LucideIcon } from 'lucide-react'
import type * as React from 'react'
import { ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface ChartCardProps {
  title: React.ReactNode
  description?: React.ReactNode
  /** Drawn as the card's icon tile, like every other card title. */
  icon?: LucideIcon
  /** Rendered top-right — a range picker, an export button. */
  action?: React.ReactNode
  /** Plot height in pixels. */
  height?: number
  /**
   * When set, this sentence replaces the chart. Recharts renders an empty grid
   * with no explanation for an empty array, which reads as a broken chart.
   */
  empty?: string
  className?: string
  children: React.ReactElement
}

/**
 * A chart in a card, sized and themed.
 *
 * `ResponsiveContainer` measures its parent, so the height has to live on the
 * element around it — every chart in the app was setting `h-64` by hand and
 * would silently collapse to nothing if that were forgotten. Axis, grid and
 * tooltip styling live in `@/lib/chart-theme`.
 */
export function ChartCard({
  title,
  description,
  icon: Icon,
  action,
  height = 256,
  empty,
  className,
  children,
}: ChartCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-base">
          {Icon ? <Icon aria-hidden className="text-primary" /> : null}
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? (
          <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">{action}</div>
        ) : null}
      </CardHeader>
      <CardContent className={cn(empty && 'flex items-center justify-center')} style={{ height }}>
        {empty ? (
          <p className="text-muted-foreground text-center text-sm">{empty}</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
