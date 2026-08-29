# Security model

StudentOS is built deny-by-default. The browser holds only the Supabase **anon**
key, which is safe to ship because Row Level Security is the real enforcement
boundary.

## Row Level Security (RLS)

Enabled on **every** table (`supabase/migrations/00003_rls_policies.sql`).

- **User-owned tables** (assignments, tasks, notes, budgets, habits, …) — a
  user can only `select/insert/update/delete` rows where `auth.uid() = user_id`.
- **`profiles`** — a user reads/updates only their own row. The update policy
  additionally **freezes `role` and `plan`**: a user cannot escalate to `admin`
  or grant themselves a paid plan. Admins have a separate policy.
- **`subscriptions`** — read-only to the owner; written exclusively by the
  payment provider's server-side functions via the service role.
- **Catalog tables** (universities, degrees, badges, feature flags, published
  announcements) — readable by any authenticated user; writable only by admins.
- **Support tickets** — owner CRUD + admin triage.

`is_admin()` is a `SECURITY DEFINER` function so admin checks don't recurse
through `profiles` RLS.

## Secrets

| Secret | Where it lives | Never in |
|--------|----------------|----------|
| Supabase anon key | browser (safe by design) | — |
| Supabase service-role key | edge-function env only | browser, git |
| Gemini API key | `ai-chat` / `ai-plan` function env | browser |
| Paystack secret key | `paystack` / `paystack-webhook` env | browser |
| Cron secret | `send-reminders` env | browser, git |
| Stripe secret key *(dormant)* | `billing` / `stripe-webhook` env | browser |
| Stripe webhook secret *(dormant)* | `stripe-webhook` env | browser |

`CRON_SECRET` guards the one function that runs with the service role and so
bypasses RLS entirely. `send-reminders` fails closed — 503 when the secret is
unset, 401 when the `x-cron-secret` header does not match — so an unset secret
disables the job rather than leaving it open. If it was ever deployed without
one, rotate it and update the scheduler.

The Stripe rows are the dormant provider (`StripeProvider` is not imported
anywhere; `PaystackProvider` is the live one). Leave them unset unless you
switch processors — an unused secret is still a secret worth not having.

Paystack has no separate webhook secret: it signs the raw request body with
HMAC-SHA512 keyed on the secret key, which is why that one key covers both rows.

The frontend never calls Paystack or Gemini directly — it calls an edge function
that holds the key and enforces entitlements. Every AI function runs the same
`requirePaidCaller` check (`_shared/auth.ts`): the client's `PlanGate` is UX
only, and a request can always be replayed by hand.

## Billing integrity

- Subscription state is written **only** by server-side code that has confirmed
  the payment with the provider:
  - `paystack-webhook` verifies Paystack's HMAC-SHA512 signature against the
    **raw** body (re-serialized JSON would never match) using a constant-time
    compare, before trusting anything in the payload.
  - The `confirm` action on the `paystack` function re-verifies the transaction
    reference by calling Paystack directly, and refuses a reference whose
    metadata names a different user. The browser supplies an identifier, never
    an outcome.
- `profiles.plan` (what the app gates on) is updated to match the live
  subscription; the client can never set it — RLS freezes `plan` on `profiles`.
- Client-side `PlanGate` is UX only — the server (RLS + the `ai-chat` function's
  plan check) is the actual gate.

## Input validation

- All form input is validated with **Zod** before submission.
- Runtime environment config is validated with Zod (`lib/env.ts`); a half-set
  Supabase pair fails loudly rather than silently degrading in production.
- React escapes rendered content by default; Markdown is rendered with
  `react-markdown` (no raw HTML injection).

## Storage

Two buckets with owner-scoped policies keyed on the path's first segment
(`{user_id}/…`): `avatars` (public read, owner write) and `attachments`
(fully private).

## AI safety

The AI coach system prompt forbids inventing deadlines, dates or grades — it may
only reference the assignments the user actually entered (passed as explicit
context). This is enforced in both the edge function prompt and the offline
rule-based fallback.

## Reporting

For a real deployment, add a `SECURITY.md` contact and a responsible-disclosure
policy, and enable Supabase's built-in rate limiting and CAPTCHA on auth.
