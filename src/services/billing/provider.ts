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

export interface CheckoutConfirmation {
  /** Whether the payment has completed. False means still pending or failed. */
  settled: boolean
  plan?: Plan
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
  /**
   * Optional: settle the redirect back from the provider.
   *
   * Paystack appends a transaction `reference` to the callback URL; verifying
   * it server-side upgrades the account immediately instead of leaving the
   * student on a stale Free plan until the webhook lands. Providers whose
   * webhook is the only signal (Stripe) omit this.
   *
   * The reference is only ever an identifier — the outcome is read from the
   * provider, never from the browser.
   */
  confirmCheckout?(reference: string): Promise<CheckoutConfirmation>
}
