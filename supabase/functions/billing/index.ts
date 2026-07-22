/**
 * Billing — Supabase Edge Function (Stripe).
 *
 * Actions (called from the browser with the user's JWT):
 *   - create_checkout: hosted Checkout session for a plan upgrade
 *   - create_portal:   customer portal session to manage/cancel
 *
 * Secrets (supabase secrets set …):
 *   STRIPE_SECRET_KEY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_ELITE_MONTHLY
 *
 * The Stripe webhook is a separate function (stripe-webhook) so it can run
 * without JWT verification.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { corsPreflight, jsonResponse } from '../_shared/cors.ts'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PRICE_IDS: Record<string, string | undefined> = {
  pro: Deno.env.get('STRIPE_PRICE_PRO_MONTHLY'),
  elite: Deno.env.get('STRIPE_PRICE_ELITE_MONTHLY'),
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!STRIPE_SECRET_KEY) return jsonResponse({ error: 'Billing is not configured' }, 503)

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonResponse({ error: 'Unauthorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const body = (await req.json().catch(() => ({}))) as Record<string, string>
  const action = body.action

  // Reuse a Stripe customer per user (stored on the subscription row).
  async function getOrCreateCustomer(): Promise<string> {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('user_id', user!.id)
      .not('provider_customer_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (sub?.provider_customer_id) return sub.provider_customer_id

    const customer = await stripe.customers.create({
      email: user!.email,
      metadata: { supabase_user_id: user!.id },
    })
    return customer.id
  }

  try {
    if (action === 'create_checkout') {
      const priceId = PRICE_IDS[body.plan]
      if (!priceId) return jsonResponse({ error: `Unknown plan: ${body.plan}` }, 400)
      const customerId = await getOrCreateCustomer()
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: body.successUrl,
        cancel_url: body.cancelUrl,
        client_reference_id: user.id,
        subscription_data: { metadata: { supabase_user_id: user.id, plan: body.plan } },
        allow_promotion_codes: true,
      })
      return jsonResponse({ url: session.url })
    }

    if (action === 'create_portal') {
      const customerId = await getOrCreateCustomer()
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: body.returnUrl,
      })
      return jsonResponse({ url: session.url })
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  } catch (error) {
    console.error('[billing]', error)
    return jsonResponse({ error: 'Billing request failed.' }, 502)
  }
})
