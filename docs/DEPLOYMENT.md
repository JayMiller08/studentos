# Deployment runbook

StudentOS deploys as a static frontend (Vercel) plus a Supabase backend
(Postgres, Auth, Storage, Edge Functions). This document is the end-to-end
production setup.

## 0. Prerequisites

- A Supabase project (free tier is fine to start).
- A Vercel account.
- A Stripe account (test mode first).
- An Anthropic API key (for the AI coach).
- The Supabase CLI: `npm i -g supabase`.

## 1. Database

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations in order
```

Migrations create:

- `00001_initial_schema.sql` — all tables, indexes, foreign keys, cascade rules.
- `00002_functions_triggers.sql` — `updated_at` triggers, `handle_new_user`
  (auto-creates a profile on sign-up), `is_admin()`, badge & feature-flag seeds.
- `00003_rls_policies.sql` — Row Level Security on every table.
- `00004_storage.sql` — `avatars` (public read) and `attachments` (private)
  buckets with owner-scoped policies.

### Promote an admin

The first admin must be set manually (users cannot self-promote — RLS blocks it):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

## 2. Auth configuration

In the Supabase dashboard → Authentication:

- **Site URL**: your production URL (e.g. `https://studentos.app`).
- **Redirect URLs**: add `https://studentos.app/auth/callback` and
  `https://studentos.app/auth/reset-password` (plus preview URLs as needed).
- Enable email confirmations if you want double-opt-in (the app handles the
  "verify your email" state).

## 3. Secrets & edge functions

```bash
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-… \
  ANTHROPIC_MODEL=claude-sonnet-5 \
  STRIPE_SECRET_KEY=sk_live_… \
  STRIPE_WEBHOOK_SECRET=whsec_… \
  STRIPE_PRICE_PRO_MONTHLY=price_… \
  STRIPE_PRICE_ELITE_MONTHLY=price_… \
  CRON_SECRET=$(openssl rand -hex 16)

supabase functions deploy ai-chat            # JWT-verified (Pro-gated)
supabase functions deploy billing            # JWT-verified
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy send-reminders --no-verify-jwt
```

`supabase/config.toml` declares the daily cron schedule for `send-reminders`.

## 4. Stripe

1. Create two recurring prices (Pro $4.99/mo, Elite $9.99/mo). Copy their
   price IDs into the secrets above.
2. Add a webhook endpoint pointing at:
   `https://<project-ref>.functions.supabase.co/stripe-webhook`
   subscribed to: `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`.
3. Put the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Enable the customer portal in Stripe settings (used by "Manage subscription").

The webhook is the **only** thing that writes `subscriptions` and
`profiles.plan` — the browser can never grant itself a paid plan.

## 5. Frontend (Vercel)

Set environment variables per environment (Development / Preview / Production):

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your anon/publishable key |
| `VITE_APP_URL` | the environment's public URL |
| `VITE_APP_ENV` | `development` \| `preview` \| `production` |

Build settings (auto-detected for Vite):

- Build command: `npm run build`
- Output directory: `dist`

Add a rewrite so client-side routes resolve (`vercel.json`):

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

## 6. Verify

- Sign up → confirm email → land in onboarding → dashboard.
- Create an assignment; confirm the priority score appears (Pro).
- Upgrade via Stripe test card `4242 4242 4242 4242`; confirm the webhook flips
  the plan and the billing page shows "active".
- Hit the AI coach (Pro) and confirm it responds and never invents deadlines.

## Environments

Keep three isolated Supabase projects (or at least separate keys) for
Development, Preview and Production. Never share a service-role key with the
frontend — it lives only in edge-function secrets.
