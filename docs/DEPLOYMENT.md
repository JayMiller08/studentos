# Deployment runbook

StudentOS deploys as a static frontend (Vercel) plus a Supabase backend
(Postgres, Auth, Storage, Edge Functions). This document is the end-to-end
production setup.

## 0. Prerequisites

- A Supabase project (free tier is fine to start).
- A Vercel account.
- A Paystack account (test mode first). Paystack is the live processor —
  Stripe does not support South African businesses, and plans are priced in ZAR.
- A Google Gemini API key (for Smart Plan notes and quiz generation) — create one
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
- `00012_note_images.sql` — the private `note-images` bucket for images pasted
  into notes (PNG, JPEG, WebP and GIF, up to 5 MB each).
- `00014_quiz_engine.sql` — quizzes, server-graded attempts and the XP ledger;
  scores and XP are writable only by the `quiz-grade` function.
- `00015_quiz_questions_invoker.sql` — hides quiz answer keys with column
  privileges and a view that runs as the caller (clears the advisor's
  "Security Definer View" warning).
- `00016_xp_integrity.sql` — XP, levels, streaks and badges become
  server-owned. The client reports activity through `record_activity` and asks
  for badges through `unlock_badge`; quiz questions are written only by
  `quiz-generate`. See "XP integrity" in docs/SECURITY.md.
- `00017_quests.sql` — weekly quests: the catalogue, the rotation, progress
  counted from server-written rows, and `claim_quest`.
- `00018_study_resources.sql` — quizzes from the student's own files: the
  private `study-resources` bucket (PDFs and photos, 20 MB), the study library,
  background generation jobs, and the AI meter that enforces the monthly quiz
  allowance (Free 3, Pro 40, Elite 150) and 20 file readings a day.
- `00019_reward_accuracy.sql` — rewards say what they pay: the weekly XP quest
  reads as a goal ("Reach 150 XP this week", with a 50 XP bonus), the quest and
  badge catalogues are re-seeded so their text can be corrected, and Early Bird
  can finally be earned — the database stamps `assignments.submitted_at`
  itself. Assignments submitted before it have no stamp and do not count.
- `00020_squads.sql` — squads of 3 to 6. The tables are closed to clients; every
  read and write is a function (`my_squad`, `squad_board`, `create_squad`,
  `join_squad`, …). Squad mates see a handle, weekly XP, streak and quest ticks,
  all computed by the database. See "Squads" in docs/SECURITY.md.

### Rolling out 00016 to 00020

00016 changes what the browser may write, so the order matters. Run the three
steps back to back:

```bash
npm run functions:deploy          # 1. quiz-grade now also moves the streak
npx supabase functions delete ai-chat   #    (retired in Phase 2, if still deployed)
#                                   2. deploy the frontend (section 5)
npm run db:push                   # 3. applies whatever is pending, in order (00016–00020)
```

- 00019 has no ordering constraint: before it, the server refuses Early Bird
  (no rule yet) and pays nothing; after it, an old bundle simply never asks.
- Until 00020 is applied, the Squad page says the squad could not be loaded
  (its functions don't exist yet); nothing else is affected.

- Until 00018 is applied, quiz-generate and resource-outline fail to start
  (their metering functions don't exist yet) and say so; nothing is charged.

- Between 1 and 3, quiz-grade's streak call fails and is logged; the grade
  itself still records. Between 2 and 3, new clients' activity reports fail
  quietly — tasks and sessions save, but pay no XP and move no streak.
- After 3, a tab still running the old bundle is refused when it tries to
  write XP or a streak (`XP001`); the task or session it was saving is kept.
  Reloading the page fixes it.

### Apply migrations with `db push`, not the SQL Editor

Pasting a migration into the SQL Editor creates its objects but records
nothing in the migration history, so the next `db push` runs it again. Every
migration from `00012` on is written to survive that — policies are dropped
before they are recreated, tables and indexes use `if not exists`, one-time
data fixes check whether they already ran — and
`src/lib/__tests__/migrations-idempotent.test.ts` fails if a new one is not.

If a push fails, the CLI prints only the statement. To see Postgres's reason:

```bash
npx supabase db push --debug     # the flag goes on the same command
npx supabase migration list      # compare local and remote history
```

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
  GEMINI_THINKING_BUDGET=2048 \
  PAYSTACK_SECRET_KEY=sk_live_… \
  PAYSTACK_PLAN_PRO_MONTHLY=PLN_… \
  PAYSTACK_PLAN_ELITE_MONTHLY=PLN_… \
  CRON_SECRET=$(openssl rand -hex 16)

# All of them at once:
npm run functions:deploy

# …or individually:
npx supabase functions deploy ai-plan            # JWT-verified (Pro-gated)
npx supabase functions deploy quiz-generate      # JWT-verified (all plans, monthly allowance)
npx supabase functions deploy quiz-grade         # JWT-verified (all plans)
npx supabase functions deploy resource-outline   # JWT-verified (all plans, 20 a day)
npx supabase functions deploy paystack           # JWT-verified
npx supabase functions deploy paystack-webhook --no-verify-jwt
npx supabase functions deploy send-reminders --no-verify-jwt
```

`supabase/config.toml` declares the daily cron schedule for `send-reminders`.

> [!IMPORTANT]
> **Use a paid-tier Gemini API key.** Students' notes and lecture files are sent
> to Gemini. On the unpaid tier Google may use what is submitted to improve its
> products, human reviewers may read it, and its terms ask that personal
> information not be sent there; on the paid tier it is not used for training.
> Google's terms also restrict using the Gemini API in services "directed
> towards or … likely to be accessed by individuals under the age of 18" —
> check your Terms of Service and sign-up flow against that clause.

> [!IMPORTANT]
> **CRON_SECRET Enforcement & Rotation:**
> `send-reminders` runs with the service role (bypasses RLS). It fails closed:
> - Returns **503 Service Unavailable** if `CRON_SECRET` is unset in Supabase secrets.
> - Returns **401 Unauthorized** if the request header `x-cron-secret` is missing or mismatched.
>
> If `send-reminders` was ever deployed without `CRON_SECRET` set, **rotate it immediately**:
> ```bash
> npx supabase secrets set CRON_SECRET=$(openssl rand -hex 16)
> ```
> Then update any scheduled job (e.g., pg_cron or external scheduler) to include header `x-cron-secret: <CRON_SECRET>`.

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
- Generate a Smart Plan (Pro) and confirm it never invents deadlines.
- Tick a task: XP rises by 3 and the streak counts today. Un-tick and re-tick
  it: no more XP. In the SQL editor, `select event, source_id, amount from
  xp_ledger order by created_at desc limit 5` shows one row for that task.
- Take a quiz: the first pass pays, a re-take pays nothing but is still scored.
- The dashboard shows three quests. Finish one and claim it: XP rises by its
  reward once, and a second claim pays nothing.
- Upload a lecture PDF on the Quizzes page: it shows "Reading…", then its
  topics. Pick two topics and write a 10-question quiz: the job moves through
  reading → writing → checking, and each explanation names a page. On Free, the
  fourth quiz in a month is refused with the upgrade sentence.

## Environments

Keep three isolated Supabase projects (or at least separate keys) for
Development, Preview and Production. Never share a service-role key with the
frontend — it lives only in edge-function secrets.
