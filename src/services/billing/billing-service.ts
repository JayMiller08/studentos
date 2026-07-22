import { isSupabaseConfigured } from '@/lib/env'
import { byUser, table } from '@/services/db'
import type { BillingProvider } from '@/services/billing/provider'
import { MockProvider } from '@/services/billing/mock-provider'
import { StripeProvider } from '@/services/billing/stripe-provider'
import type { Plan, Subscription } from '@/types/models'

/**
 * The single place where a concrete billing provider is chosen. Swapping
 * providers (or adding a regional one) happens here and nowhere else.
 */
export const billingProvider: BillingProvider = isSupabaseConfigured
  ? new StripeProvider()
  : new MockProvider()

const subscriptions = () => table<Subscription>('subscriptions')

export const billingService = {
  provider: billingProvider,

  async getSubscription(userId: string): Promise<Subscription | null> {
    const rows = await subscriptions().list({
      filters: byUser(userId),
      orderBy: { column: 'created_at', ascending: false },
      limit: 1,
    })
    return rows[0] ?? null
  },

  async startCheckout(plan: Exclude<Plan, 'free'>): Promise<void> {
    const origin = window.location.origin
    const session = await billingProvider.createCheckout({
      plan,
      successUrl: `${origin}/app/billing?status=success`,
      cancelUrl: `${origin}/app/billing?status=cancelled`,
    })
    window.location.assign(session.url)
  },

  async openPortal(): Promise<void> {
    const session = await billingProvider.createPortalSession(`${window.location.origin}/app/billing`)
    window.location.assign(session.url)
  },

  /**
   * Demo-mode only: simulate a completed checkout by writing the subscription
   * and upgrading the profile locally. In production this is done server-side
   * by the Stripe webhook (never trusted from the browser).
   */
  async simulateActivation(userId: string, plan: Exclude<Plan, 'free'>): Promise<void> {
    if (isSupabaseConfigured) {
      throw new Error('Activation is handled by Stripe webhooks in production.')
    }
    const periodEnd = new Date()
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    const existing = await billingService.getSubscription(userId)
    const payload = {
      user_id: userId,
      plan,
      status: 'active' as const,
      provider: 'manual' as const,
      provider_customer_id: null,
      provider_subscription_id: `mock_${crypto.randomUUID()}`,
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
    }
    if (existing) await subscriptions().update(existing.id, payload)
    else await subscriptions().insert(payload)

    await table<{ id: string }>('profiles').update(userId, { plan })
  },

  /** Demo-mode only: cancel the simulated subscription and drop to Free. */
  async simulateCancel(userId: string): Promise<void> {
    if (isSupabaseConfigured) {
      throw new Error('Cancellation is handled by the Stripe portal in production.')
    }
    const existing = await billingService.getSubscription(userId)
    if (existing) {
      await subscriptions().update(existing.id, {
        status: 'canceled',
        cancel_at_period_end: true,
      })
    }
    await table<{ id: string }>('profiles').update(userId, { plan: 'free' })
  },
}
