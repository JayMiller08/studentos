import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Clock, CreditCard, ExternalLink, Loader2, ShieldCheck } from 'lucide-react'
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
  const checkoutAvailable = billingService.checkoutAvailable
  const [confirming, setConfirming] = React.useState(false)
  /** Guards against StrictMode's double effect run confirming twice. */
  const settledRef = React.useRef<string | null>(null)

  // Surface the checkout redirect result once.
  React.useEffect(() => {
    const status = searchParams.get('status')
    // Paystack appends the transaction reference to the callback URL.
    const reference = searchParams.get('reference') ?? searchParams.get('trxref')
    if (!status && !reference) return
    if (reference && settledRef.current === reference) return
    if (reference) settledRef.current = reference

    async function settle() {
      if (status === 'cancelled') toast('Checkout cancelled — no changes made.')

      if (reference) {
        setConfirming(true)
        try {
          // Verified against the provider server-side — the redirect itself is
          // not evidence that anything was paid.
          const outcome = await billingService.confirmCheckout(reference)
          if (outcome === false) {
            toast('Payment is still processing — your plan updates the moment it clears.')
          } else {
            toast.success('Subscription activated — welcome to the club! 🎉')
          }
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : "We couldn't confirm that payment. If you were charged, your plan will update shortly.",
          )
        } finally {
          setConfirming(false)
        }
      } else if (status === 'success') {
        toast.success('Subscription activated — welcome to the club! 🎉')
      }

      await refreshProfile()
      await refetch()
    }

    void settle()

    for (const key of ['status', 'reference', 'trxref']) searchParams.delete(key)
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, setSearchParams, refreshProfile, refetch])

  async function handleSelect(plan: Plan) {
    if (plan === 'free' || plan === currentPlan) return
    if (!checkoutAvailable) {
      toast('Paid plans are launching soon — hang tight!')
      return
    }
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

      {confirming ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-3 pt-1">
            <Loader2 aria-hidden className="text-primary size-5 shrink-0 animate-spin" />
            <div className="text-sm">
              <p className="font-medium">Confirming your payment…</p>
              <p className="text-muted-foreground">
                Checking with Paystack. This usually takes a couple of seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!checkoutAvailable && !isDemo ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 pt-1">
            <Clock aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Paid plans are launching soon</p>
              <p className="text-muted-foreground">
                We&rsquo;re setting up secure card payments with Paystack. Browse the plans below —
                you&rsquo;ll be able to upgrade here as soon as it&rsquo;s live. Everything on the
                Free plan stays free.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

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

      <div data-tour="billing-plans">
        <PricingTable
          currentPlan={currentPlan}
          onSelect={(selected) => void handleSelect(selected)}
          busyPlan={busyPlan}
          lockPaidPlans={!checkoutAvailable}
          ctaLabel={(planId) => {
            if (planId === currentPlan) return 'Current plan'
            if (!checkoutAvailable && planId !== 'free') return 'Coming soon'
            const order = { free: 0, pro: 1, elite: 2 }
            return order[planId] > order[currentPlan] ? `Upgrade to ${PLANS[planId].name}` : `Switch to ${PLANS[planId].name}`
          }}
        />
      </div>

      <Card className="bg-secondary/40">
        <CardContent className="flex items-start gap-3 pt-1">
          <ShieldCheck aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Secure billing</p>
            <p className="text-muted-foreground">
              {isDemo
                ? 'Demo mode simulates checkout — no real payment is taken.'
                : 'Payments are processed securely by Paystack. StudentOS never sees your card details, and you can cancel any time.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
