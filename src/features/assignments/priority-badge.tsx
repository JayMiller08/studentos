import { Badge } from '@/components/ui/badge'
import type { PriorityScore } from '@/services/priority-engine'

const BAND_VARIANT: Record<
  PriorityScore['band'],
  'destructive' | 'warning' | 'secondary' | 'muted'
> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'secondary',
  low: 'muted',
}

/**
 * The smart-prioritization score, shown wherever ranked work appears. Only
 * rendered for plans that include the feature — callers pass `undefined` for
 * everyone else, so there is no half-explained number on screen.
 */
export function PriorityBadge({ score }: { score: PriorityScore }) {
  return (
    <Badge variant={BAND_VARIANT[score.band]} title={score.reason}>
      ⚡ {score.score}
    </Badge>
  )
}
