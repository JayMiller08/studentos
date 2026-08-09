# Deployment runbook

StudentOS deploys as a static frontend (Vercel) plus a Supabase backend
(Postgres, Auth, Storage, Edge Functions). This document is the end-to-end
production setup.

## 0. Prerequisites

- A Supabase project (free tier is fine to start).
- A Vercel account.
- A Paystack account (test mode first). Paystack is the live processor —
  Stripe does not support South African businesses, and plans are priced in ZAR.
- A Google Gemini API key (for the AI coach and Smart Plan notes) — create one
  in [Google AI Studio](https://aistudio.google.com/apikey) and make sure the
  Generative Language API is enabled for the project.
- The Supabase CLI. It is pinned as a devDependency, so `npm install` is all
  you need — then run it with `npx supabase …`. Global npm installs are *not*
  supported by Supabase (`npm i -g supabase` fails by design); on a machine
  without this repo, use Scoop (`scoop install supabase`), Homebrew, or the
  release binary instead.

## 1. Database

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push           # applies supabase/migrations in order
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

### Google sign-in (OAuth)

The "Continue with Google" button on the login/register pages needs a Google
OAuth client wired to Supabase. Two callback URLs are involved and people
routinely mix them up:

| URL | Where it goes | Set it in |
|-----|---------------|-----------|
| `https://<PROJECT_REF>.supabase.co/auth/v1/callback` | Google → **Supabase** | Google Cloud Console → Authorized redirect URIs |
| `https://<your-app>/auth/callback` | Supabase → **your app** | Supabase → Auth → URL Configuration → Redirect URLs |

**1. Google Cloud Console** (https://console.cloud.google.com):
- Create/select a project.
- **APIs & Services → OAuth consent screen**: choose *External*, set app name,
  support email and developer email. While the app is in *Testing*, add each
  tester's Google address under *Test users* (or *Publish* to allow anyone).
- **APIs & Services → Credentials → Create credentials → OAuth client ID →
  Web application**:
  - *Authorized JavaScript origins*: `https://<your-app>` and, for local dev,
    `http://localhost:5173`.
  - *Authorized redirect URIs*: **exactly** `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
    (copy the "Callback URL" shown on Supabase's Google provider page — this is
    what fixes `Error 400: redirect_uri_mismatch`).
  - Copy the **Client ID** and **Client Secret**.

**2. Supabase** → **Authentication → Providers → Google**: toggle on, paste the
Client ID and Client Secret, save.

**3. Supabase** → **Authentication → URL Configuration**: ensure **Site URL** is
`https://<your-app>` and the **Redirect URLs** allow-list includes
`https://<your-app>/auth/callback` (plus `http://localhost:5173/auth/callback`
for dev). Supabase only redirects back to allow-listed URLs.

**4. Vercel**: set `VITE_APP_URL` to the deployment's own URL per environment so
`redirectTo` resolves to the right `/auth/callback`.

Flow: app → Supabase → Google → `…supabase.co/auth/v1/callback` → your
`/auth/callback` (PKCE code exchanged automatically) → `/app`. First-time users
get a profile row from the `handle_new_user` trigger (name comes from Google's
`full_name`) and are routed through onboarding.

## 3. Secrets & edge functions

```bash
npx supabase secrets set \
  GEMINI_API_KEY=AIza… \
  GEMINI_MODEL=gemini-2.5-flash \
  PAYSTACK_SECRET_KEY=sk_live_… \
  PAYSTACK_PLAN_PRO_MONTHLY=PLN_… \
  PAYSTACK_PLAN_ELITE_MONTHLY=PLN_… \
  CRON_SECRET=$(openssl rand -hex 16)

# All of them at once:
npm run functions:deploy

# …or individually:
npx supabase functions deploy ai-chat            # JWT-verified (Pro-gated)
npx supabase functions deploy ai-plan            # JWT-verified (Pro-gated)
npx supabase functions deploy paystack           # JWT-verified
npx supabase functions deploy paystack-webhook --no-verify-jwt
npx supabase functions deploy send-reminders --no-verify-jwt

# Stripe is kept for markets Paystack doesn't serve; skip unless you switch to it.
npx supabase functions deploy billing            # JWT-verified
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

`supabase/config.toml` declares the daily cron schedule for `send-reminders`.

## 4. Paystack

1. **Create the plans.** Paystack dashboard → Plans → two monthly plans in ZAR:
   Student Pro **R49/mo** and Student Elite **R99/mo**. Copy each `PLN_…` plan
   code into the secrets above. The amount is *not* duplicated in code — the
   `paystack` function reads it from the plan, so the dashboard stays the single
   source of truth for price.
2. **Point the webhook** at
   `https://<project-ref>.functions.supabase.co/paystack-webhook`
   (Settings → API Keys & Webhooks → Webhook URL). Paystack sends every event to
   one URL; the function handles `charge.success`, `subscription.create`,
   `subscription.enable`, `subscription.disable`, `subscription.not_renew`,
   `invoice.update` and `invoice.payment_failed`, and acknowledges the rest.
3. **No separate webhook secret.** Paystack signs the raw body with HMAC-SHA512
   keyed on your *secret key*, so `PAYSTACK_SECRET_KEY` is all the webhook needs.
   Use the test secret key with the test webhook URL and the live one with live.
4. **Nothing to enable for "Manage subscription."** The billing page asks
   Paystack for a per-subscription management link at click time, which is where
   the student updates their card or cancels.

`paystack-webhook` is the authoritative feed for `subscriptions` and
`profiles.plan`. The `confirm` action on the `paystack` function also writes
them, but only after re-verifying the reference **with Paystack server-side** —
it exists so an upgrade shows up the instant the student lands back on the app
instead of waiting for the webhook. The browser is never the source of an
entitlement in either path.

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
- Upgrade with a Paystack test card (`4084 0840 8408 4081`, any future expiry,
  CVV `408`); confirm you land back on the billing page already on the new plan,
  and that the webhook has written `subscriptions` with a `SUB_…` code.
- Cancel from "Manage subscription"; confirm access runs to the end of the paid
  period rather than stopping immediately.
- Hit the AI coach (Pro) and confirm it responds and never invents deadlines.

## Environments

Keep three isolated Supabase projects (or at least separate keys) for
Development, Preview and Production. Never share a service-role key with the
frontend — it lives only in edge-function secrets.
