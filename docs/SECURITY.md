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
  Stripe webhook via the service role.
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
| Anthropic API key | `ai-chat` function env | browser |
| Stripe secret key | `billing` / `stripe-webhook` env | browser |
| Stripe webhook secret | `stripe-webhook` env | browser |

The frontend never calls Stripe or Anthropic directly — it calls an edge
function that holds the key and enforces entitlements.

## Billing integrity

- Subscription state is written **only** by `stripe-webhook`, which verifies the
  Stripe signature before trusting the payload.
- `profiles.plan` (what the app gates on) is updated by the webhook to match the
  live subscription; the client can never set it.
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
