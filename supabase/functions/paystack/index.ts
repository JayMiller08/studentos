/**
 * Paystack — Supabase Edge Function.
 *
 * Actions (called from the browser with the user's JWT):
 *   - create_checkout: hosted Paystack payment page for a plan upgrade
 *   - create_portal:   Paystack's subscription management link (card / cancel)
 *   - confirm:         verify the reference Paystack appends to the callback
 *                      URL, so the app reflects the upgrade immediately
 *                      instead of waiting on the webhook
 *
 * Secrets (supabase secrets set …):
 *   PAYSTACK_SECRET_KEY, PAYSTACK_PLAN_PRO_MONTHLY, PAYSTACK_PLAN_ELITE_MONTHLY
 *
 * The webhook is a separate function (paystack-webhook) so it can run without
 * JWT verification. Both are server-side, so both are trusted; the browser is
 * never the source of an entitlement.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsPreflight, jsonResponse } from '../_shared/cors.ts'
import {
  PAYSTACK_SECRET_KEY,
  PLAN_CODES,
  planCodeFrom,
  planForCode,
  type PaidPlan,
  paystackFetch,
  PaystackError,
  syncSubscription,
} from '../_shared/paystack.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!PAYSTACK_SECRET_KEY) {
    return jsonResponse({ error: 'Payments are not enabled on this deployment yet.' }, 503)
  }

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

  try {
    switch (body.action) {
      case 'create_checkout':
        return await createCheckout(user, body)
      case 'create_portal':
        return await createPortal(admin, user)
      case 'confirm':
        return await confirmCheckout(admin, user, body.reference)
      default:
        return jsonResponse({ error: `Unknown action: ${body.action}` }, 400)
    }
  } catch (error) {
    if (error instanceof PaystackError) {
      console.error('[paystack]', body.action, error.message)
      // Paystack's own copy is aimed at developers; keep the student-facing
      // message generic and let the logs carry the detail.
      return jsonResponse({ error: 'Payment request failed. Please try again.' }, 502)
    }
    console.error('[paystack] unexpected', error)
    return jsonResponse({ error: 'Payment request failed. Please try again.' }, 500)
  }
})

/**
 * Start a subscription.
 *
 * The amount is read from the Paystack plan rather than duplicated here: the
 * dashboard is the single source of truth for what a plan costs, and a price
 * that lives in two places is a price that will disagree with itself.
 */
async function createCheckout(
  user: { id: string; email?: string },
  body: Record<string, string>,
): Promise<Response> {
  const plan = body.plan
  const planCode = PLAN_CODES[plan]
  if (!planCode) return jsonResponse({ error: `Unknown plan: ${plan}` }, 400)
  if (!user.email) return jsonResponse({ error: 'Your account has no email address.' }, 400)

  const paystackPlan = await paystackFetch(`/plan/${planCode}`)

  // No customer lookup: Paystack keys customers on email, and a StudentOS
  // account's email is stable, so initializing with it reuses the same
  // customer record rather than creating a second one.
  const transaction = await paystackFetch('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: user.email,
      amount: paystackPlan.amount,
      currency: paystackPlan.currency ?? 'ZAR',
      plan: planCode,
      callback_url: body.successUrl,
      metadata: {
        supabase_user_id: user.id,
        plan,
        cancel_action: body.cancelUrl,
      },
    }),
  })

  return jsonResponse({ url: transaction.authorization_url })
}

/**
 * Paystack's equivalent of a billing portal: a one-time link that lets the
 * cardholder update their card or cancel. It is generated per subscription, so
 * a student with nothing active gets a clear message instead of a dead link.
 */
async function createPortal(admin: any, user: { id: string }): Promise<Response> {
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('provider_subscription_id')
    .eq('user_id', user.id)
    .eq('provider', 'paystack')
    .not('provider_subscription_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!subscription?.provider_subscription_id) {
    return jsonResponse(
      { error: "We couldn't find an active subscription to manage on this account." },
      404,
    )
  }

  const link = await paystackFetch(
    `/subscription/${subscription.provider_subscription_id}/manage/link`,
  )
  return jsonResponse({ url: link.link })
}

/**
 * Confirm the transaction Paystack redirected back with.
 *
 * Verification is a server-to-server call to Paystack, so this is as trusted
 * as the webhook — the browser only supplies a reference, never an outcome.
 * The subscription code is not part of a verify response; the webhook fills
 * that in moments later, which is why `syncSubscription` merges rather than
 * overwrites.
 */
async function confirmCheckout(
  admin: any,
  user: { id: string },
  reference: string | undefined,
): Promise<Response> {
  if (!reference) return jsonResponse({ error: 'Missing transaction reference' }, 400)

  const transaction = await paystackFetch(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  )

  // A reference proves a payment happened, not *whose* it was. Checkout stamps
  // the buyer's id into metadata, so require an exact match — anything else
  // (another student's reference, a payment raised outside the app) would let
  // the caller claim a plan somebody else paid for. Nothing is lost by
  // refusing: the webhook still credits the real buyer.
  if (transaction?.metadata?.supabase_user_id !== user.id) {
    console.warn('[paystack] confirm rejected: reference does not belong to caller')
    return jsonResponse({ error: 'That payment reference is not yours.' }, 403)
  }

  if (transaction?.status !== 'success') {
    return jsonResponse({ settled: false, status: transaction?.status ?? 'unknown' })
  }

  const plan = planForCode(planCodeFrom(transaction)) ?? asPaidPlan(transaction?.metadata?.plan)
  if (!plan) {
    // Better to leave it to the webhook than to guess a tier — guessing wrong
    // either short-changes the student or gives away Elite for a Pro payment.
    console.warn('[paystack] confirm could not identify the plan; deferring to webhook')
    return jsonResponse({ settled: false, status: 'pending' })
  }

  await syncSubscription(admin, {
    userId: user.id,
    plan,
    // A verified successful charge is, by definition, a paid-up subscription;
    // the webhook refines this with the real subscription status and code.
    status: 'active',
    cancelAtPeriodEnd: false,
    customerCode: transaction?.customer?.customer_code ?? null,
  })

  return jsonResponse({ settled: true, plan })
}

function asPaidPlan(value: unknown): PaidPlan | null {
  return value === 'pro' || value === 'elite' ? value : null
}
