import { env } from '@/lib/env'
import { requireSupabase } from '@/lib/supabase'
import type {
  BillingProvider,
  CheckoutRequest,
  CheckoutSession,
  PortalSession,
} from '@/services/billing/provider'

/**
 * Stripe provider.
 *
 * The browser never touches the secret key. Checkout and portal sessions are
 * created by the `billing` Edge Function (supabase/functions/billing) which
 * holds the Stripe secret and maps plans → price ids. Here we just invoke it
 * with the user's JWT.
 */
export class StripeProvider implements BillingProvider {
  readonly id = 'stripe' as const

  private async invoke<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    const supabase = requireSupabase()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('You need to be signed in to manage billing.')

    const response = await fetch(`${env.supabaseUrl}/functions/v1/billing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `Billing request failed (${response.status})`)
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

  createPortalSession(returnUrl: string): Promise<PortalSession> {
    return this.invoke<PortalSession>('create_portal', { returnUrl })
  }
}
