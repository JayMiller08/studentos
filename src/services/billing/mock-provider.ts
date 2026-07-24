import { sleep } from '@/lib/utils'
import type {
  BillingProvider,
  CheckoutRequest,
  CheckoutSession,
  PortalSession,
} from '@/services/billing/provider'

/**
 * Demo-mode billing provider.
 *
 * No real payments — routes to an in-app simulated checkout page so the whole
 * upgrade → active-subscription → manage flow is exercisable without Stripe.
 */
export class MockProvider implements BillingProvider {
  readonly id = 'mock' as const
  readonly available = true

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    await sleep(200)
    const params = new URLSearchParams({
      plan: request.plan,
      redirect: request.successUrl,
    })
    return { url: `/checkout/mock?${params.toString()}` }
  }

  async createPortalSession(returnUrl: string): Promise<PortalSession> {
    await sleep(200)
    return { url: `/checkout/mock-portal?redirect=${encodeURIComponent(returnUrl)}` }
  }
}
