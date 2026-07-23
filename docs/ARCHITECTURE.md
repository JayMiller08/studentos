# Architecture

StudentOS is a feature-first React SPA with a Supabase backend, designed so
that adding a feature never requires touching unrelated code, and so the whole
product runs with or without a backend.

## Layers

```
┌──────────────────────────────────────────────────────────────┐
│  features/*            UI + feature hooks (one folder each)   │
├──────────────────────────────────────────────────────────────┤
│  services/*            domain logic + data access             │
│    ├── db.ts           unified table() → Supabase | localDb   │
│    ├── *-service.ts    per-domain operations                  │
│    ├── priority-engine, study-planner  (pure, tested)         │
│    └── billing/*, auth-service, ai-service  (swappable ports) │
├──────────────────────────────────────────────────────────────┤
│  lib/*                 framework-agnostic helpers             │
│  types/models.ts       domain model shapes                    │
├──────────────────────────────────────────────────────────────┤
│  Supabase              Postgres + RLS · Auth · Storage ·      │
│                        Realtime · Edge Functions              │
└──────────────────────────────────────────────────────────────┘
```

### The app shell (`src/app`)

- `App.tsx` composes providers: ErrorBoundary → Theme → QueryClient → Auth →
  Tooltip → Router, plus global Toaster and the PWA update prompt.
- `router.tsx` is the single route table. Every feature page is
  **lazy-loaded**, so each area is its own JS chunk and the shell stays small.
- `guards.tsx` — `RequireAuth` (also enforces onboarding), `RequireAdmin`,
  `RedirectIfAuthenticated`.
- `navigation.ts` — the single source of truth for sidebar + mobile nav;
  `navSectionsForRole()` filters admin-only items.
- `layouts/` — `AppLayout` (sidebar / topbar / mobile bottom nav) and
  `AuthLayout`.

### Providers

- **ThemeProvider** — light/dark/system, persisted, syncs `prefers-color-scheme`.
- **AuthProvider** — wraps `auth-service`, exposes `user`, `profile`, and
  actions; ensures a profile row exists after sign-in.

## The data seam

Everything reads/writes through `services/db.ts`:

```ts
export function table<Row>(name: string): TableClient<Row>
```

- **Supabase configured** → PostgREST queries (RLS enforced server-side).
- **Not configured** → `lib/local-db.ts`, a localStorage store implementing the
  same filter / order / limit surface, with change events for realtime-style
  invalidation.

Because both branches satisfy the same `TableClient` interface, feature code is
byte-for-byte identical across online, demo, and offline modes. `useRealtime`
subscribes to Postgres changes (or local change events) and invalidates
TanStack Query keys registered in `lib/query-keys.ts`.

## Swappable ports

| Concern | Interface | Implementations |
|---------|-----------|-----------------|
| Auth | `auth-service.ts` | Supabase Auth · demo (simulated) |
| AI | `ai-service.ts` | `ai-chat` edge function · rule-based offline coach |
| Payments | `services/billing/provider.ts` | `StripeProvider` · `MockProvider` |

Choosing an implementation happens in exactly one place per concern (e.g.
`billing-service.ts` picks the provider from `isSupabaseConfigured`).

## Domain engines (pure & tested)

- **`priority-engine.ts`** — scores each active assignment 0–100 from a
  transparent, explainable factor blend; stress level shifts the weighting.
- **`study-planner.ts`** — earliest-deadline-first scheduling into
  capacity-limited 25–90-minute focus blocks; never schedules past a deadline.
- **`focus-service.ts`** — study-time buckets and streak computation.
- **`gamification-service.ts`** — XP → level curve and badge conditions.
- **`budget-service.ts` / `habits-service.ts`** — summaries, projections, streaks.

These have no React or network dependencies and are unit-tested with Vitest.

## State management

- **Server/shared state** → TanStack Query (30s freshness, window-focus
  revalidation, global mutation error toasts).
- **Local UI state** → React state/refs.
- **Cross-cutting app state** → the providers above.

No global store library is needed; the query cache is the source of truth for
data, and realtime invalidation keeps open views live.

## Forms

React Hook Form + Zod resolvers. `lib/forms.ts` provides `numberField` /
`optionalNumberField` so text inputs coerce to validated numbers without
breaking RHF's field typing.

## Styling & design system

- Tailwind v4 with design tokens in `styles/globals.css` (oklch, light + dark).
- `components/ui/*` are shadcn-style primitives over Radix — accessible,
  themed via CSS variables, `data-slot` attributes for targeting.
- 8px spacing grid, soft shadows, rounded corners, minimal motion.

## PWA

`vite-plugin-pwa` (Workbox) precaches the app shell and assets; a runtime cache
serves Supabase Storage stale-while-revalidate. `PwaReloadPrompt` offers a
one-tap refresh on new deploys; `use-pwa-install` surfaces the install prompt.
