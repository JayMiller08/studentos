import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Progress } from '@/components/ui/progress'
import type { QuotaUsage } from '@/hooks/use-plan'
import { cn } from '@/lib/utils'

interface QuotaMeterProps {
  usage: QuotaUsage
  /** Plural noun for what is being counted, e.g. "notes". */
  noun: string
  className?: string
}

/**
 * Compact "12 of 30 notes" meter with an upgrade link once the cap is close.
 * Renders nothing on unlimited plans — a paid user should never be reminded of
 * a ceiling they do not have.
 */
export function QuotaMeter({ usage, noun, className }: QuotaMeterProps) {
  if (usage.unlimited || usage.limit === null) return null

  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100))
  // Stay quiet until it is nearly relevant; nagging from the first item is noise.
  const nearLimit = percent >= 70
  if (!nearLimit) return null

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={cn('font-medium', usage.atLimit && 'text-destructive')}>
          {usage.used} of {usage.limit} {noun}
        </span>
        <Link
          to="/app/billing"
          className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          <Sparkles aria-hidden className="size-3.5" />
          {usage.atLimit ? 'Upgrade for unlimited' : 'Go unlimited'}
        </Link>
      </div>
      <Progress
        value={percent}
        className="h-1.5"
        indicatorClassName={cn(usage.atLimit && 'bg-destructive')}
      />
    </div>
  )
}
