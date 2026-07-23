# StudentOS by Life OS

**The operating system for university students.** StudentOS combines academic
planning, focus, habits, budgeting and AI into one command center — and
actively tells students the single most important thing to do next, removing
decision fatigue.

> Students should never wonder: *"What should I be doing right now?"* — the app
> tells them.

Built as a production-grade, venture-backed SaaS product designed to scale to
100,000+ students. Mobile-first, offline-capable PWA.

---

## ✨ Features

| Area | What it does |
|------|--------------|
| **Dashboard** | Live "today's priority", tasks, schedule, study stats, streak, quote, quick actions |
| **Assignments** | Modules, priorities, weights, difficulty, progress, overdue detection, plan-gated limits |
| **Planner** | Day/week/month views, time blocking, drag-and-drop rescheduling, recurring tasks, backlog |
| **Calendar** | Month/week/exam views, recurring class timetable, assignment deadlines overlaid, drag-to-move |
| **Focus Center** | Reload-proof Pomodoro engine, deep-work mode, generated ambient sound, distraction counter, session history |
| **Priority Engine** | Transparent factor model (urgency, weight, effort, difficulty, declared priority, momentum) → 0–100 score |
| **Smart Plan** | Deterministic AI study-schedule generator, capacity-aware, one-tap apply into the planner |
| **AI Coach** | Chat with 6 modes (coach, quiz, flashcards, summary, essay, code), grounded in real deadlines; never invents dates |
| **Analytics** | Productivity score, focus/pipeline charts, Pro-gated weekly trends |
| **Habits** | Daily/weekly/monthly cadences, streaks, completion rates, 12-week heatmap |
| **Budget** | Income/expense tracking, category breakdown, month-end projection & alerts, savings goals |
| **Notes** | Markdown editor with live preview, folders, tags, search, autosave, version history |
| **Gamification** | XP, quadratic level curve, 13 badges, achievements |
| **Billing** | Provider-abstracted (Stripe) subscriptions, plan gating, self-serve management |
| **Admin** | User/plan management, feature flags, announcements, support tickets |

---

## 🧱 Tech stack

**Frontend** — React 19 · TypeScript (strict) · Vite · React Router · TailwindCSS v4 ·
shadcn-style UI (Radix) · Framer Motion · TanStack Query · React Hook Form · Zod ·
Recharts · Lucide · `@dnd-kit` · PWA (`vite-plugin-pwa`)

**Backend** — Supabase (Postgres · Auth · Storage · Realtime · Edge Functions)

**AI** — Anthropic Claude via a Supabase Edge Function (key stays server-side)

**Payments** — Stripe, behind a swappable provider abstraction

**Deploy** — Vercel (frontend) + Supabase (backend)

---

## 🚀 Getting started

```bash
npm install
cp .env.example .env.local   # optional — see "Demo mode" below
npm run dev
```

Open http://localhost:5173.

### Demo mode (no backend required)

When `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are **absent**, StudentOS runs
in **local demo mode**: authentication is simulated, data persists to
`localStorage` on the device, and a realistic student workload (assignments,
timetable, habits, budget, notes, achievements) is seeded on first sign-in.
Sign in with any email + password to explore the entire product — including the
AI coach (rule-based offline fallback), the full billing upgrade flow
(simulated checkout), and the admin dashboard.

This is also the app's baseline **offline** experience.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Preview the production build |
| `npm run test` | Run the Vitest unit suite |
| `npm run lint` | Lint with oxlint |
| `npm run generate:icons` | Regenerate PWA icons from `public/favicon.svg` |

---

## 🏗️ Architecture

Feature-first, cleanly layered. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the full picture.

```
src/
  app/            # shell: providers, layouts, router, guards, navigation
  components/     # shared components + ui/ (design-system primitives)
  features/       # one folder per product area (self-contained)
    auth/ onboarding/ dashboard/ planner/ assignments/ calendar/ focus/
    ai/ analytics/ notifications/ habits/ budget/ notes/ gamification/
    billing/ admin/ landing/ settings/
  services/       # data + domain logic (db access, engines, providers)
  hooks/          # cross-feature hooks
  lib/            # framework-agnostic utilities (env, plans, forms, utils)
  types/          # domain models
  styles/         # design tokens + globals
supabase/
  migrations/     # normalized schema, triggers, RLS, storage policies
  functions/      # edge functions: ai-chat, billing, stripe-webhook, send-reminders
```

**Key idea — one data seam.** Every feature talks to `services/db.ts::table()`,
which transparently targets Supabase (with RLS) when configured and a
localStorage-backed store otherwise. Feature code is identical in both modes,
which is what makes demo mode and the offline story real rather than mocked.

**Swappable providers.** Auth (`auth-service`), AI (`ai-service`) and payments
(`services/billing/*`) are each hidden behind an interface so the concrete
implementation can be replaced in one place.

---

## 🗄️ Backend setup (production)

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full runbook. In short:

1. Create a Supabase project; set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Push the schema: `supabase db push` (migrations in `supabase/migrations`).
3. Set server secrets and deploy edge functions:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=… STRIPE_SECRET_KEY=… \
     STRIPE_WEBHOOK_SECRET=… STRIPE_PRICE_PRO_MONTHLY=… STRIPE_PRICE_ELITE_MONTHLY=…
   supabase functions deploy ai-chat
   supabase functions deploy billing
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase functions deploy send-reminders --no-verify-jwt
   ```
4. Point a Stripe webhook at the `stripe-webhook` function.
5. Deploy the frontend to Vercel with the same env vars per environment
   (Development / Preview / Production).

---

## 🔒 Security

- **Row Level Security** on every table — deny-by-default; the browser anon key
  can do nothing outside explicit per-user policies.
- **No secrets in the browser.** The Anthropic and Stripe keys live only in
  edge functions. The Stripe webhook is the *sole* source of subscription
  truth (signature-verified).
- **Privilege-escalation guards** in RLS: users can't grant themselves `admin`
  or a paid `plan`.
- **Validated inputs** everywhere via Zod; validated runtime env config.
- Owner-scoped storage buckets. See [`docs/SECURITY.md`](docs/SECURITY.md).

---

## ♿ Accessibility & performance

- Keyboard-navigable, ARIA-labelled, screen-reader-friendly components (Radix).
- Respects `prefers-reduced-motion` and `prefers-color-scheme`; light/dark/system themes.
- Route-level code splitting, optimistic updates, query caching, PWA precache + runtime caching.

---

## 🧪 Testing

Deterministic domain logic (priority engine, study planner, focus stats,
recurrence, plan gating, gamification curve, budget math, habits, billing
provider) is covered by Vitest:

```bash
npm run test
```

---

## 💳 Plans

| | Free | Student Pro ($4.99/mo) | Student Elite ($9.99/mo) |
|-|------|------------------------|--------------------------|
| Core (dashboard, planner, calendar, focus, habits, budget) | ✅ | ✅ | ✅ |
| Active assignments | 3 | Unlimited | Unlimited |
| AI planner & coach, smart prioritization, advanced analytics | — | ✅ | ✅ |
| Career tools (resume, portfolio, internships, GitHub) | — | — | ✅ |

---

© Life OS · StudentOS
