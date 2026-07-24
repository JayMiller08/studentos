import type {
  BillingProvider,
  CheckoutRequest,
  CheckoutSession,
  PortalSession,
} from '@/services/billing/provider'

const COMING_SOON = 'Paid plans are launching soon — card payments are being set up.'

/**
 * Paystack provider — the intended live processor for StudentOS (Stripe does
 * not support South African businesses). Marked `available: false` while the
 * Paystack account approval is pending; the billing UI shows a "coming soon"
 * state instead of attempting a charge.
 *
 * When approved, implement these methods against a Supabase Edge Function that
 * holds the Paystack secret key (initialize transaction → return authorization
 * URL; verify via webhook) and set `available = true`. The rest of the app is
 * unchanged: it depends only on the BillingProvider port. See stripe-provider.ts
 * for the same pattern.
 */
export class PaystackProvider implements BillingProvider {
  readonly id = 'paystack' as const
  readonly available = false

  async createCheckout(_request: CheckoutRequest): Promise<CheckoutSession> {
    throw new Error(COMING_SOON)
  }

  async createPortalSession(_returnUrl: string): Promise<PortalSession> {
    throw new Error(COMING_SOON)
  }
}
