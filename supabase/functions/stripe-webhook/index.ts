/**
 * Stripe webhook — Supabase Edge Function.
 *
 * The ONLY trusted source of subscription state. Verifies the Stripe
 * signature, then syncs `subscriptions` and `profiles.plan` with the service
 * role. Deploy WITHOUT JWT verification:
 *   supabase functions deploy stripe-webhook --no-verify-jwt
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' })
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function planFromMetadata(metadata: Record<string, string> | null): 'pro' | 'elite' {
  return metadata?.plan === 'elite' ? 'elite' : 'pro'
}

/** Map Stripe subscription status → our enum. */
function mapStatus(status: string): string {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
    case 'incomplete':
      return status
    case 'incomplete_expired':
    case 'unpaid':
      return 'canceled'
    default:
      return 'incomplete'
  }
}

async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata.supabase_user_id
  if (!userId) {
    console.warn('[webhook] subscription without supabase_user_id', subscription.id)
    return
  }
  const plan = planFromMetadata(subscription.metadata)
  const status = mapStatus(subscription.status)
  const active = status === 'active' || status === 'trialing'

  await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      plan,
      status,
      provider: 'stripe',
      provider_customer_id: String(subscription.customer),
      provider_subscription_id: subscription.id,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: 'provider_subscription_id' },
  )

  // Reflect entitlement on the profile (what the app reads for gating).
  await admin
    .from('profiles')
    .update({ plan: active ? plan : 'free' })
    .eq('id', userId)
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const payload = await req.text()
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, STRIPE_WEBHOOK_SECRET)
  } catch (error) {
    console.error('[webhook] signature verification failed', error)
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(String(session.subscription))
          await syncSubscription(subscription)
        }
        break
      }
      default:
        // Unhandled event types are fine — acknowledge them.
        break
    }
  } catch (error) {
    console.error('[webhook] handler error', error)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
