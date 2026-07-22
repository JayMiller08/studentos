import { describe, expect, it } from 'vitest'
import { MockProvider } from '@/services/billing/mock-provider'

describe('MockProvider', () => {
  const provider = new MockProvider()

  it('identifies itself as the mock provider', () => {
    expect(provider.id).toBe('mock')
  })

  it('creates an in-app checkout URL carrying plan and redirect', async () => {
    const session = await provider.createCheckout({
      plan: 'pro',
      successUrl: 'https://app.test/app/billing?status=success',
      cancelUrl: 'https://app.test/app/billing?status=cancelled',
    })
    expect(session.url).toContain('/checkout/mock')
    const params = new URLSearchParams(session.url.split('?')[1])
    expect(params.get('plan')).toBe('pro')
    expect(params.get('redirect')).toBe('https://app.test/app/billing?status=success')
  })

  it('creates a portal URL that returns to the given page', async () => {
    const session = await provider.createPortalSession('https://app.test/app/billing')
    expect(session.url).toContain('/checkout/mock-portal')
    expect(session.url).toContain(encodeURIComponent('https://app.test/app/billing'))
  })
})
