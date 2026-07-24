import type { Plan } from '@/types/models'

/**
 * Payment provider abstraction.
 *
 * The rest of the app depends only on this interface — never on Stripe
 * directly. Swapping to Paddle, LemonSqueezy, Paystack, etc. is implementing
 * this port and changing one line in `billing-service.ts`.
 */

export interface CheckoutRequest {
  plan: Exclude<Plan, 'free'>
  /** Where the provider returns the user after success/cancel. */
  successUrl: string
  cancelUrl: string
}

export interface CheckoutSession {
  /** Hosted checkout URL to redirect the browser to. */
  url: string
}

export interface PortalSession {
  /** Hosted billing-management URL (update card, cancel, invoices). */
  url: string
}

export interface BillingProvider {
  readonly id: 'stripe' | 'paystack' | 'mock'
  /** Whether checkout is live. When false the UI shows a "coming soon" state
   * instead of attempting a charge. */
  readonly available: boolean
  /** Create a hosted checkout session for a plan upgrade. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>
  /** Create a customer portal session for managing an existing subscription. */
  createPortalSession(returnUrl: string): Promise<PortalSession>
}
