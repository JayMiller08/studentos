import { CreditCard, Loader2, Lock } from 'lucide-react'
import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPlanPrice, PLANS } from '@/lib/plans'
import { billingService } from '@/services/billing/billing-service'
import type { Plan } from '@/types/models'

/**
 * Demo-mode simulated checkout. Stands in for Stripe's hosted page so the full
 * upgrade flow is testable without a payment provider. Never shown when
 * Supabase + Stripe are configured (the real hosted checkout is used instead).
 */
export function MockCheckoutPage() {
  const { user, refreshProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [processing, setProcessing] = React.useState(false)

  const plan = (searchParams.get('plan') ?? 'pro') as Exclude<Plan, 'free'>
  const redirect = searchParams.get('redirect') ?? '/app/billing?status=success'
  const planDef = PLANS[plan]

  async function pay() {
    if (!user) return
    setProcessing(true)
    await billingService.simulateActivation(user.id, plan)
    await refreshProfile()
    const url = new URL(redirect, window.location.origin)
    navigate(`${url.pathname}${url.search}`, { replace: true })
  }

  return (
    <div className="bg-muted/40 flex min-h-dvh flex-col items-center justify-center p-4">
      <div className="mb-6">
        <Logo />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="text-muted-foreground size-4" /> Simulated checkout
          </CardTitle>
          <CardDescription>
            This is a demo — no real payment is processed. Connect Stripe for live billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">{planDef.name}</p>
              <p className="text-muted-foreground text-sm">Billed monthly · cancel anytime</p>
            </div>
            <p className="text-xl font-bold">{formatPlanPrice(planDef.monthlyPrice)}</p>
          </div>

          {/* Inert fields — visual only; the demo never collects card data. */}
          <div className="space-y-2 opacity-60" aria-hidden>
            <div className="bg-muted h-10 rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-muted h-10 rounded-lg" />
              <div className="bg-muted h-10 rounded-lg" />
            </div>
          </div>

          <Button className="w-full" onClick={() => void pay()} disabled={processing}>
            {processing ? <Loader2 className="animate-spin" /> : <CreditCard />}
            Pay {formatPlanPrice(planDef.monthlyPrice)} &amp; activate
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => navigate('/app/billing?status=cancelled', { replace: true })}
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
