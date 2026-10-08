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
| Gemini API key | `ai-plan` / `quiz-generate` function env | browser |
| Paystack secret key | `paystack` / `paystack-webhook` env | browser |
| Cron secret | `send-reminders` env | browser, git |

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
- Client-side `PlanGate` is UX only — the server (RLS + `requirePaidCaller` in
  the `quiz-generate` and `ai-plan` functions) is the actual gate.

## Quiz integrity

The quiz engine is the one place XP is *earned* rather than reported, so it is
built to be unwritable from the browser:

- `quiz_attempts`, `quiz_answers` and `xp_ledger` have a select policy and **no
  insert, update or delete policy at all**. RLS denies what it has no policy
  for, so the only writer is the service role inside `quiz-grade`. Adding an
  insert policy to any of them would let a student POST their own score;
  `src/services/__tests__/quiz-xp-parity.test.ts` fails if one appears.
- The answer key is hidden by **column privileges**, not by a view. SELECT on
  `quiz_questions` is revoked from `anon`/`authenticated` and re-granted for an
  allow-list of columns that excludes `correct_index` and `explanation`, so
  asking PostgREST for them — or filtering on them — returns "permission
  denied for column". Rows are scoped by an ordinary owner-only RLS policy.
- `quiz_questions_public` is created `with (security_invoker = true)`, so it
  runs as the caller and RLS applies through it. **Never create a view with
  `security_invoker = false`**: a definer view bypasses RLS entirely and leaves
  a single WHERE clause as the only guard (migration 00014 did this; 00015
  replaced it, and a test now fails if any view's latest definition runs as
  its owner).
- `award_xp()` is `security definer` and revoked from `anon`/`authenticated`.
  Its `unique (user_id, event, source_id)` key makes every award idempotent, so
  a replayed request pays nothing twice.
- Attempt duration is client-reported and therefore displayed only — never an
  input to the XP calculation.
- **Questions are written by the server alone** (migration 00016). Students
  cannot insert a quiz or insert, update or delete a question — the policies
  are gone and the table privileges revoked — because an answer key the
  student wrote, or overwrote, is not a test. `quiz-generate` writes both with
  the service role. Students keep reading their quizzes, renaming them and
  filing them under a module (`title` and `module_id` are the only updatable
  columns: `kind` decides the boss bonus), and deleting them.

## XP integrity

Since migration 00016 the client never writes progress. It *reports* what
happened and the database decides what that is worth:

- **The progress columns are frozen.** The `profiles_guard_progress` trigger
  refuses any client write that changes `xp`, `level`, `current_streak`,
  `longest_streak`, `last_active_date` or `streak_freezes` (SQLSTATE `XP001`,
  shown to the student verbatim), and a profile a client inserts starts from
  zero. It keys on `current_user`, so the `security definer` functions, the
  service role and the SQL editor still pass. Admins are clients too: the admin
  update policy cannot hand out XP either.
- **`record_activity(event, source)`** is the only door a client has. The
  student comes from the JWT; the amount and daily cap come from `xp_rewards`;
  `activity_happened` checks the source row exists, is the caller's and is in
  the claimed state (a task marked done, a submitted assignment); the ledger's
  unique key pays each source once; and the cap counts the student's own day,
  from `profiles.timezone`. It also advances the streak, server-side.
- **`unlock_badge(badge)`** pays a badge's catalogue reward once, and only if
  `badge_earned` agrees the condition holds. `achievements` is writable through
  it alone. Streak and level badges read server-owned columns, so they are fully
  verified; a badge with no server rule cannot be unlocked by a client.
- **`award_xp`, `touch_streak`, `activity_happened` and `badge_earned` are
  revoked from `anon` and `authenticated`.** Granting any of them to a client
  would let it choose its own amount, day or verdict;
  `src/services/__tests__/xp-integrity-sql.test.ts` fails if a migration does.
- **What remains self-reported.** The rows that prove an activity — a task, a
  habit check-in, a study session — are the student's to write, so activity XP
  can still be farmed, but only inside the daily caps (at most a few hundred XP
  a day across every activity). Quiz XP is the uncapped source because it is
  the verified one. Anything that ranks students (leagues) should weigh that.
- **Quests (migration 00017) pay only for server-written signals.** Progress
  is counted by `quest_progress` from `xp_ledger` and `quiz_attempts`, never
  sent by the client; `claim_quest` recounts it, checks the quest is on this
  week's board, and pays through `award_xp` keyed on `<monday>:<quest>`, so a
  quest pays once. The catalogue is read-only to clients, and `quest_week`,
  `quest_rotation` and `quest_progress` are revoked from them.
- The test suite runs with the Supabase variables blanked
  (`vitest.config.ts`), so a test can never reach a real project even when a
  developer's `.env` points at one.

## Squads

Squads (migration 00020) are the first place one student sees anything about
another, so they are closed by construction rather than by policy:

- **No client can touch the tables.** `squads`, `squad_members` and
  `squad_join_failures` have RLS enabled, no policies at all, and every
  privilege revoked from `anon` and `authenticated`. Every read and write is a
  `security definer` function that takes the student from `auth.uid()` and
  never accepts a user id: `my_squad`, `squad_board`, `create_squad`,
  `join_squad`, `leave_squad`, and the owner's `remove_squad_member`,
  `rename_squad` and `new_squad_code`. The helpers they use are revoked.
- **Squad mates see a handle and four numbers.** `squad_board` returns, per
  member, the handle chosen for the squad, whether the row is the caller's,
  their role, XP earned in their own quest week, their streak as of now
  (`effective_streak`, the same rule as `effectiveStreak()`), and the ids of
  this week's quests they claimed. No account id, name, email, university,
  module, grade or note leaves the database.
- **Nothing shown can be typed in.** Weekly XP and streaks are computed when
  asked from `xp_ledger` and `profiles`, both server-owned since 00016. There
  is no copy on the squad to forge.
- **Squads pay nothing**, so they add no way to earn XP. Ranking does make
  farmable activity XP (see above) worth more socially; the daily caps bound it.
- **The size cap holds for every writer.** A `before insert` trigger locks the
  squad row and refuses a seventh member with SQLSTATE `SQ001`, shown verbatim,
  so two simultaneous joins cannot both get the last place.
- **Codes resist guessing.** Eight characters from 31 (about 8.5 × 10¹¹
  codes), drawn without bias from `gen_random_uuid()`; ten wrong codes in an
  hour and `join_squad` refuses further attempts. A wrong code is answered with
  a row rather than an error so the miss is recorded. An owner can retire a
  leaked code with `new_squad_code`.
- **Leaving is always possible and never strands a squad.** An owner leaving,
  being removed or deleting their account hands the squad to the longest-
  standing member; the last one out deletes it. Moderation in v1 is the owner
  removing a member.

## Study files and AI generation

- **Files are private and typed by storage.** The `study-resources` bucket is
  private, refuses anything but PDFs and photos (PNG, JPEG, WebP, HEIC/HEIF)
  and anything over 20 MB, and owner policies key on the path's first segment
  (`{user_id}/…`). The functions check the first bytes again before anything is
  sent to the AI, so a renamed HTML or executable file is refused.
- **A resource cannot point at someone else's file.** The service role reads
  any folder, so `study_resources` carries a check constraint that every path
  sits in its owner's folder — enforced for every writer, the service role
  included — and the functions refuse a mismatch a second time.
- **What reading found is server-written.** Clients may insert a resource's
  description and rename or re-file it (`title`, `module_id`), never its
  `status`, `outline` or `page_count` — column privileges, so a forged value is
  refused rather than ignored.
- **Generation is metered by the database.** `begin_quiz_generation` and
  `begin_outline` (service role only) lock the profile, count the month's
  charged quizzes or the day's readings, refuse past the allowance with
  SQLSTATE `AI001`, and charge in the same transaction. A failed quiz is
  refunded; a job stuck for ten minutes is failed and refunded on the next
  start. `ai_usage` and `quiz_generations` are read-only to students.
- **The model's output is untrusted.** Questions are schema-checked, validated
  (one key in range, no duplicate or catch-all options), shuffled server-side
  and checked by a second, blind reading of the material; topic names in a
  prompt come from the server-written outline, never the request. Uploaded
  material is framed as content, not instructions — and since a student can
  only steer their own quiz, a prompt injected through their own file is
  bounded by their own allowance.
- **Gemini copies are temporary.** Files go to the Gemini Files API for the
  calls that read them and are deleted afterwards (Google expires them after
  48 hours regardless). Use a paid-tier key: see docs/DEPLOYMENT.md.

## Input validation

- All form input is validated with **Zod** before submission.
- Runtime environment config is validated with Zod (`lib/env.ts`); a half-set
  Supabase pair fails loudly rather than silently degrading in production.
- React escapes rendered content by default; Markdown is rendered with
  `react-markdown` (no raw HTML injection).

## Storage

Three buckets with owner-scoped policies keyed on the path's first segment
(`{user_id}/…`): `avatars` (public read, owner write), `attachments` (fully
private) and `note-images` (fully private). `note-images` holds images pasted
into notes; the bucket itself accepts only PNG, JPEG, WebP and GIF up to 5 MB, so
SVG and HTML are refused whatever a client sends. Its files are shown through
signed URLs that expire after an hour, and a note stores a `note-image:`
reference rather than any URL.

## AI safety

The AI prompts forbid inventing deadlines, dates or grades — they may
only reference the assignments the user actually entered (passed as explicit
context). This is enforced in both the edge function prompt and the offline
rule-based fallback.

## Reporting

For a real deployment, add a `SECURITY.md` contact and a responsible-disclosure
policy, and enable Supabase's built-in rate limiting and CAPTCHA on auth.
