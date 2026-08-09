import { env } from '@/lib/env'
import { requireSupabase } from '@/lib/supabase'
import type {
  BillingProvider,
  CheckoutConfirmation,
  CheckoutRequest,
  CheckoutSession,
  PortalSession,
} from '@/services/billing/provider'

/**
 * Paystack provider — StudentOS's live processor (Stripe does not support
 * South African businesses, and plans are priced in ZAR).
 *
 * The browser never touches the secret key. Checkout, the subscription
 * management link and redirect confirmation are all created by the `paystack`
 * Edge Function (supabase/functions/paystack), which holds the secret and maps
 * plans → Paystack plan codes. Here we just invoke it with the user's JWT.
 *
 * Entitlement is never taken from the browser: `paystack-webhook` is the
 * authoritative feed, and `confirmCheckout` re-verifies the reference
 * server-side rather than trusting the redirect it came back on.
 */
export class PaystackProvider implements BillingProvider {
  readonly id = 'paystack' as const
  readonly available = true

  private async invoke<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const supabase = requireSupabase()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('You need to be signed in to manage billing.')

    let response: Response
    try {
      response = await fetch(`${env.supabaseUrl}/functions/v1/paystack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, ...payload }),
      })
    } catch {
      // Network error / function unreachable (fetch rejects before a response).
      throw new Error(
        "Couldn't reach the payment service. Please check your connection and try again.",
      )
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      // 404 = function not deployed; 503 = deployed but Paystack keys missing.
      if (response.status === 404 || response.status === 503) {
        throw new Error(
          body?.error ?? 'Payments are not enabled on this deployment yet. Please try again later.',
        )
      }
      throw new Error(body?.error ?? `Billing request failed (${response.status}).`)
    }
    return (await response.json()) as T
  }

  createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    return this.invoke<CheckoutSession>('create_checkout', {
      plan: request.plan,
      successUrl: request.successUrl,
      cancelUrl: request.cancelUrl,
    })
  }

  createPortalSession(_returnUrl: string): Promise<PortalSession> {
    // Paystack's manage link is generated per subscription and returns the
    // cardholder to Paystack, so there is no return URL to hand it.
    return this.invoke<PortalSession>('create_portal', {})
  }

  confirmCheckout(reference: string): Promise<CheckoutConfirmation> {
    return this.invoke<CheckoutConfirmation>('confirm', { reference })
  }
}
