/**
 * Paystack webhook — Supabase Edge Function.
 *
 * The authoritative source of subscription state. Verifies Paystack's
 * signature (HMAC-SHA512 of the raw body, keyed with the secret key), then
 * syncs `subscriptions` and `profiles.plan` with the service role.
 *
 * Deploy WITHOUT JWT verification — Paystack does not send one:
 *   supabase functions deploy paystack-webhook --no-verify-jwt
 * Secrets: PAYSTACK_SECRET_KEY, PAYSTACK_PLAN_PRO_MONTHLY, PAYSTACK_PLAN_ELITE_MONTHLY
 *
 * Paystack retries on a non-2xx, so anything we cannot yet act on is
 * acknowledged rather than failed — only genuine handler errors return 500.
 */
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  mapSubscriptionStatus,
  PAYSTACK_SECRET_KEY,
  planCodeFrom,
  planForCode,
  type PaidPlan,
  resolveUserId,
  type SubscriptionStatus,
  syncSubscription,
  toIso,
} from '../_shared/paystack.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const encoder = new TextEncoder()

/** Constant-time compare — a fast `!==` on a signature leaks it byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Paystack signs the exact bytes it sent, so the signature must be checked
 * against the raw body — re-serializing parsed JSON would change key order and
 * whitespace and never match.
 */
async function isSignatureValid(rawBody: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(PAYSTACK_SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  return timingSafeEqual(toHex(mac), signature.toLowerCase())
}

/** Resolve the plan an event refers to, preferring the plan code over metadata. */
function planFrom(payload: any): PaidPlan | null {
  const fromCode = planForCode(planCodeFrom(payload))
  if (fromCode) return fromCode
  const fromMetadata = payload?.metadata?.plan
  return fromMetadata === 'pro' || fromMetadata === 'elite' ? fromMetadata : null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!PAYSTACK_SECRET_KEY) {
    console.error('[paystack-webhook] PAYSTACK_SECRET_KEY is not set')
    return new Response('Not configured', { status: 503 })
  }

  const signature = req.headers.get('x-paystack-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const rawBody = await req.text()
  if (!(await isSignatureValid(rawBody, signature))) {
    console.error('[paystack-webhook] signature verification failed')
    return new Response('Invalid signature', { status: 401 })
  }

  let event: { event?: string; data?: any }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid payload', { status: 400 })
  }

  const data = event.data ?? {}
  const customerCode: string | null = data?.customer?.customer_code ?? null
  const email: string | null = data?.customer?.email ?? null

  try {
    switch (event.event) {
      // First successful charge, and every renewal.
      case 'charge.success':
      case 'invoice.update':
      case 'invoice.payment_failed':
      case 'subscription.create':
      case 'subscription.enable':
      case 'subscription.disable':
      case 'subscription.not_renew': {
        const userId = await resolveUserId(admin, { metadata: data.metadata, customerCode, email })
        if (!userId) {
          // Almost always a payment made outside the app (a test charge, a
          // manual invoice). Nothing to entitle — acknowledge so Paystack
          // stops retrying.
          console.warn('[paystack-webhook] no matching user for', event.event, customerCode)
          break
        }

        const plan = planFrom(data) ?? planFrom(data.subscription) ?? null
        if (!plan) {
          console.warn('[paystack-webhook] unrecognised plan for', event.event)
          break
        }

        const { status, cancelAtPeriodEnd } = statusFor(event.event, data)

        await syncSubscription(admin, {
          userId,
          plan,
          status,
          cancelAtPeriodEnd,
          customerCode,
          subscriptionCode: data.subscription_code ?? data.subscription?.subscription_code ?? null,
          currentPeriodEnd: toIso(
            data.next_payment_date ?? data.subscription?.next_payment_date ?? data.period_end,
          ),
        })
        break
      }

      default:
        // Unhandled event types are fine — acknowledge them.
        break
    }
  } catch (error) {
    // A 500 asks Paystack to retry, which is what we want for a transient
    // database failure.
    console.error('[paystack-webhook] handler error', event.event, error)
    return new Response('Handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

/**
 * Derive our status from the event type.
 *
 * `status` means different things on different Paystack payloads — on a charge
 * or invoice it describes the *transaction* ('success' / 'failed'), on a
 * subscription event it describes the subscription ('active' / 'non-renewing'
 * / 'complete'). Feeding the first kind through the subscription map would
 * read 'success' as unrecognised and quietly strip a paying student's plan, so
 * each event states its own meaning here.
 */
function statusFor(
  eventType: string | undefined,
  data: any,
): { status: SubscriptionStatus; cancelAtPeriodEnd: boolean } {
  switch (eventType) {
    case 'charge.success':
      return { status: 'active', cancelAtPeriodEnd: false }

    case 'invoice.update':
      return data?.paid === true || data?.status === 'success'
        ? { status: 'active', cancelAtPeriodEnd: false }
        : { status: 'past_due', cancelAtPeriodEnd: false }

    case 'invoice.payment_failed':
      return { status: 'past_due', cancelAtPeriodEnd: false }

    case 'subscription.not_renew':
      return mapSubscriptionStatus('non-renewing')

    case 'subscription.disable': {
      // Paystack disables a subscription the moment it is cancelled, but the
      // student has already paid through to `next_payment_date`. Taking Pro
      // away that instant would be charging for time and not delivering it —
      // so access runs out with the period, and the UI says so.
      const paidUntil = toIso(data?.next_payment_date)
      const stillPaidFor = paidUntil ? new Date(paidUntil) > new Date() : false
      return stillPaidFor
        ? { status: 'active', cancelAtPeriodEnd: true }
        : { status: 'canceled', cancelAtPeriodEnd: true }
    }

    default:
      return mapSubscriptionStatus(data?.status ?? data?.subscription?.status ?? 'active')
  }
}
