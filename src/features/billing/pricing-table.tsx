import { Check, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PLAN_ORDER, PLANS } from '@/lib/plans'
import { cn } from '@/lib/utils'
import type { Plan } from '@/types/models'

interface PricingTableProps {
  /** The user's current plan, if signed in. */
  currentPlan?: Plan
  /** Called with the chosen plan; parent decides checkout vs. sign-up. */
  onSelect: (plan: Plan) => void
  /** Disables buttons during an in-flight action. */
  busyPlan?: Plan | null
  ctaLabel?: (plan: Plan) => string
}

export function PricingTable({ currentPlan, onSelect, busyPlan, ctaLabel }: PricingTableProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {PLAN_ORDER.map((planId) => {
        const plan = PLANS[planId]
        const isCurrent = currentPlan === planId
        const highlighted = planId === 'pro'
        return (
          <Card
            key={planId}
            className={cn(
              'relative flex flex-col',
              highlighted && 'border-primary shadow-md ring-primary/20 ring-1',
            )}
          >
            {highlighted ? (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Sparkles className="size-3" /> Most popular
              </Badge>
            ) : null}
            <CardHeader>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-muted-foreground text-sm">{plan.tagline}</p>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold">
                  {plan.monthlyPriceUsd === 0 ? 'Free' : `$${plan.monthlyPriceUsd}`}
                </span>
                {plan.monthlyPriceUsd > 0 ? (
                  <span className="text-muted-foreground text-sm">/month</span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <ul className="mb-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={highlighted ? 'default' : 'outline'}
                className="w-full"
                disabled={isCurrent || busyPlan === planId}
                onClick={() => onSelect(planId)}
              >
                {isCurrent
                  ? 'Current plan'
                  : (ctaLabel?.(planId) ??
                    (planId === 'free' ? 'Get started' : `Choose ${plan.name}`))}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
