/**
 * Paystack — shared client and subscription sync.
 *
 * Paystack is StudentOS's live processor: Stripe does not support South
 * African businesses, and plans are priced in ZAR.
 *
 * Used by two functions that must agree on how a payment becomes an
 * entitlement:
 *   - `paystack`         (JWT-verified; starts checkout, opens the manage link,
 *                         confirms a redirect)
 *   - `paystack-webhook`  (no JWT; the authoritative subscription feed)
 *
 * Both write through `syncSubscription` so there is exactly one definition of
 * "this user is now on Pro".
 */

// deno-lint-ignore-file no-explicit-any

const API = 'https://api.paystack.co'

export const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')

/** Paystack plan codes (PLN_…), created once in the Paystack dashboard. */
export const PLAN_CODES: Record<string, string | undefined> = {
  pro: Deno.env.get('PAYSTACK_PLAN_PRO_MONTHLY'),
  elite: Deno.env.get('PAYSTACK_PLAN_ELITE_MONTHLY'),
}

export type PaidPlan = 'pro' | 'elite'
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'

export class PaystackError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'PaystackError'
    this.status = status
  }
}

/**
 * Call the Paystack REST API.
 *
 * Paystack signals failure both ways — an HTTP error, or 200 with
 * `status: false` — so both are normalized into a thrown PaystackError here
 * rather than at every call site.
 */
export async function paystackFetch<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!PAYSTACK_SECRET_KEY) throw new PaystackError('Paystack is not configured', 503)

  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  } catch (error) {
    console.error('[paystack] network error', path, error)
    throw new PaystackError('Could not reach Paystack', 502)
  }

  const body = (await response.json().catch(() => null)) as any
  if (!response.ok || body?.status === false) {
    const message = body?.message ?? `Paystack request failed (${response.status})`
    console.error('[paystack]', path, response.status, message)
    throw new PaystackError(message, response.status >= 400 ? response.status : 502)
  }
  return body?.data as T
}

/** Map a Paystack plan code back to the plan a StudentOS profile carries. */
export function planForCode(planCode: string | null | undefined): PaidPlan | null {
  if (!planCode) return null
  for (const [plan, code] of Object.entries(PLAN_CODES)) {
    if (code && code === planCode) return plan as PaidPlan
  }
  return null
}

/**
 * Paystack subscription status → ours.
 *
 * `non-renewing` is still a paid, working subscription — the student cancelled
 * but the period they paid for has not ended. Treating it as `canceled` would
 * take away access they are still owed, so it maps to active and is surfaced
 * through `cancel_at_period_end` instead.
 */
export function mapSubscriptionStatus(status: string | null | undefined): {
  status: SubscriptionStatus
  cancelAtPeriodEnd: boolean
} {
  switch (status) {
    case 'active':
      return { status: 'active', cancelAtPeriodEnd: false }
    case 'non-renewing':
      return { status: 'active', cancelAtPeriodEnd: true }
    case 'attention':
      return { status: 'past_due', cancelAtPeriodEnd: false }
    case 'cancelled':
    case 'canceled':
    case 'complete':
    case 'completed':
      return { status: 'canceled', cancelAtPeriodEnd: true }
    default:
      return { status: 'incomplete', cancelAtPeriodEnd: false }
  }
}

/** Statuses that entitle the student to their paid plan. */
export function isEntitled(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing'
}

export interface SubscriptionSync {
  userId: string
  plan: PaidPlan
  status: SubscriptionStatus
  customerCode?: string | null
  /** Paystack subscription code (SUB_…); absent on the first charge. */
  subscriptionCode?: string | null
  currentPeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
}

/**
 * Write a payment outcome into `subscriptions` and mirror the entitlement onto
 * `profiles.plan` (what the app actually gates on).
 *
 * Matching is deliberately two-step. Paystack sends `charge.success` before
 * `subscription.create`, and only the latter carries the subscription code —
 * so the first event has to find the user's row by user id, and the second has
 * to find that same row again and fill the code in. Keying only on the
 * subscription code would leave a duplicate row behind on every signup.
 */
export async function syncSubscription(admin: any, input: SubscriptionSync): Promise<void> {
  const byCode = input.subscriptionCode
    ? (
        await admin
          .from('subscriptions')
          .select('*')
          .eq('provider_subscription_id', input.subscriptionCode)
          .maybeSingle()
      ).data
    : null

  const existing =
    byCode ??
    (
      await admin
        .from('subscriptions')
        .select('*')
        .eq('user_id', input.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data

  const row = {
    user_id: input.userId,
    plan: input.plan,
    status: input.status,
    provider: 'paystack',
    provider_customer_id: input.customerCode ?? existing?.provider_customer_id ?? null,
    // Never clear a code we already hold: later events (an invoice, a failed
    // charge) legitimately arrive without one.
    provider_subscription_id:
      input.subscriptionCode ?? existing?.provider_subscription_id ?? null,
    current_period_end: input.currentPeriodEnd ?? existing?.current_period_end ?? null,
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
  }

  const { error } = existing
    ? await admin.from('subscriptions').update(row).eq('id', existing.id)
    : await admin.from('subscriptions').insert(row)
  if (error) throw new Error(`subscriptions write failed: ${error.message}`)

  const { error: profileError } = await admin
    .from('profiles')
    .update({ plan: isEntitled(input.status) ? input.plan : 'free' })
    .eq('id', input.userId)
  if (profileError) throw new Error(`profile write failed: ${profileError.message}`)
}

/**
 * Work out which StudentOS user a Paystack payload belongs to.
 *
 * Checkout stamps the user id into transaction metadata, but subscription and
 * invoice events are raised by Paystack itself and carry no metadata — hence
 * the fallbacks through the customer code we stored and, last, the email.
 */
export async function resolveUserId(
  admin: any,
  hints: { metadata?: any; customerCode?: string | null; email?: string | null },
): Promise<string | null> {
  const fromMetadata = hints.metadata?.supabase_user_id
  if (typeof fromMetadata === 'string' && fromMetadata) return fromMetadata

  if (hints.customerCode) {
    const { data } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('provider_customer_id', hints.customerCode)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data?.user_id) return data.user_id
  }

  if (hints.email) {
    // `limit(1)` rather than a bare `maybeSingle()`: a duplicate would throw,
    // the handler would 500, and Paystack would retry that event forever.
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('email', hints.email.toLowerCase())
      .limit(1)
      .maybeSingle()
    if (data?.id) return data.id
  }

  return null
}

/** Pull the plan code out of a payload, which types it inconsistently. */
export function planCodeFrom(payload: any): string | null {
  const plan = payload?.plan
  if (typeof plan === 'string' && plan) return plan
  if (plan?.plan_code) return String(plan.plan_code)
  if (payload?.plan_object?.plan_code) return String(payload.plan_object.plan_code)
  return null
}

/** ISO timestamp, or null when Paystack sent nothing usable. */
export function toIso(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
