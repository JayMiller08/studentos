import { Sparkles } from 'lucide-react'
import type * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PLANS, type PlanLimits } from '@/lib/plans'

interface PlanGateProps {
  feature: keyof Omit<PlanLimits, 'assignments'>
  title: string
  description: string
  children: React.ReactNode
}

/**
 * Renders children when the user's plan includes `feature`, otherwise an
 * upgrade prompt. Server-side enforcement (RLS + edge functions) is the real
 * boundary; this is the UX layer.
 */
export function PlanGate({ feature, title, description, children }: PlanGateProps) {
  const { profile } = useAuth()
  const plan = PLANS[profile?.plan ?? 'free']

  if (plan.limits[feature]) return children

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
          <Sparkles aria-hidden className="size-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-muted-foreground mx-auto max-w-md text-sm">{description}</p>
        </div>
        <Button asChild>
          <Link to="/app/billing">Upgrade to Student Pro</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
