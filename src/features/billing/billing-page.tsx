import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { CreditCard, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/auth-provider'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PricingTable } from '@/features/billing/pricing-table'
import { PLANS } from '@/lib/plans'
import { queryKeys } from '@/lib/query-keys'
import { billingService } from '@/services/billing/billing-service'
import type { Plan } from '@/types/models'

export function BillingPage() {
  const { user, profile, isDemo, refreshProfile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [busyPlan, setBusyPlan] = React.useState<Plan | null>(null)
  const [managingPortal, setManagingPortal] = React.useState(false)

  const { data: subscription, refetch } = useQuery({
    queryKey: queryKeys.subscription(user?.id ?? ''),
    queryFn: () => billingService.getSubscription(user!.id),
    enabled: Boolean(user),
  })

  const currentPlan = profile?.plan ?? 'free'

  // Surface the checkout redirect result once.
  React.useEffect(() => {
    const status = searchParams.get('status')
    if (!status) return
    if (status === 'success') toast.success('Subscription activated — welcome to the club! 🎉')
    if (status === 'cancelled') toast('Checkout cancelled — no changes made.')
    void refreshProfile()
    void refetch()
    searchParams.delete('status')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams, refreshProfile, refetch])

  async function handleSelect(plan: Plan) {
    if (plan === 'free' || plan === currentPlan) return
    setBusyPlan(plan)
    try {
      await billingService.startCheckout(plan)
      // Real Stripe redirects away; the mock provider navigates in-app.
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start checkout')
      setBusyPlan(null)
    }
  }

  async function handleManage() {
    if (isDemo) {
      // Demo: simulate cancellation back to Free.
      await billingService.simulateCancel(user!.id)
      await refreshProfile()
      await refetch()
      toast.success('Subscription cancelled — back to Free plan.')
      return
    }
    setManagingPortal(true)
    try {
      await billingService.openPortal()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open billing portal')
      setManagingPortal(false)
    }
  }

  const plan = PLANS[currentPlan]
  const isPaid = currentPlan !== 'free'

  return (
    <div className="space-y-6">
      <PageHeader title="Billing & plans" description="Manage your StudentOS subscription" />

      {/* Current plan */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                {plan.name}
                {isPaid ? (
                  <Badge variant={subscription?.status === 'active' ? 'success' : 'warning'}>
                    {subscription?.cancel_at_period_end
                      ? 'Cancels at period end'
                      : (subscription?.status ?? 'active')}
                  </Badge>
                ) : (
                  <Badge variant="muted">Free</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {isPaid && subscription?.current_period_end
                  ? `Renews ${format(parseISO(subscription.current_period_end), 'd MMMM yyyy')}`
                  : 'Upgrade any time to unlock AI planning and analytics'}
              </CardDescription>
            </div>
            {isPaid ? (
              <Button variant="outline" onClick={() => void handleManage()} disabled={managingPortal}>
                {managingPortal ? <Loader2 className="animate-spin" /> : <CreditCard />}
                {isDemo ? 'Cancel subscription' : 'Manage subscription'}
                {!isDemo ? <ExternalLink className="size-3.5" /> : null}
              </Button>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <PricingTable
        currentPlan={currentPlan}
        onSelect={(selected) => void handleSelect(selected)}
        busyPlan={busyPlan}
        ctaLabel={(planId) => {
          if (planId === currentPlan) return 'Current plan'
          const order = { free: 0, pro: 1, elite: 2 }
          return order[planId] > order[currentPlan] ? `Upgrade to ${PLANS[planId].name}` : `Switch to ${PLANS[planId].name}`
        }}
      />

      <Card className="bg-secondary/40">
        <CardContent className="flex items-start gap-3 pt-1">
          <ShieldCheck aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Secure billing</p>
            <p className="text-muted-foreground">
              {isDemo
                ? 'Demo mode simulates checkout — no real payment is taken. Connect Stripe to accept live payments.'
                : 'Payments are processed securely by Stripe. StudentOS never sees your card details. Cancel any time.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
