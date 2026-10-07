-- ============================================================================
-- StudentOS — quiz questions without a SECURITY DEFINER view
--
-- Supersedes the answer-hiding design in 00014, which Supabase's security
-- advisor rightly flags as critical ("Security Definer View").
--
-- What 00014 did: `quiz_questions` had no select policy at all, and the runner
-- read `quiz_questions_public`, a view created with `security_invoker = false`.
-- The view ran as its owner, which is what let it read a table the caller
-- could not — and it carried its own `auth.uid()` filter to stand in for RLS.
--
-- Why that is the wrong mechanism: a definer view bypasses row level security
-- *entirely*. Correctness then rests on one hand-written WHERE clause, and any
-- future edit to the view that drops or loosens it exposes every student's
-- questions to every other student, with nothing underneath to catch it.
--
-- The replacement leans on two things Postgres enforces itself:
--
--   1. Row access — an ordinary owner-only SELECT policy on quiz_questions.
--      The view now runs as the caller (`security_invoker = true`), so RLS
--      applies through it exactly as it applies to a direct query.
--
--   2. Column access — SELECT on quiz_questions is revoked and re-granted for
--      every column EXCEPT `correct_index` and `explanation`. A student asking
--      PostgREST for the answer key, or filtering on it
--      (`?correct_index=eq.2`), now gets "permission denied for column", which
--      is the database refusing rather than a view forgetting to project it.
--
-- Unchanged: the service role keeps full privileges, so `quiz-grade` still
-- reads the answer key and `quiz-generate` still writes it. Inserts are
-- unaffected — INSERT is a separate privilege, and the client inserts with
-- `Prefer: return=minimal` (see `insertMany` in db.ts), so it never asks for
-- the row back.
--
-- Idempotent.
-- ============================================================================

-- ── 1. Row access: owners may read their own questions ──────────────────────

drop policy if exists "quiz_questions_select_own" on public.quiz_questions;
create policy "quiz_questions_select_own" on public.quiz_questions
  for select using (
    exists (select 1 from public.quizzes q where q.id = quiz_id and q.user_id = auth.uid())
  );

-- ── 2. Column access: everything but the answer key ─────────────────────────
--
-- Revoke at table level first: a table-level SELECT grant (which Supabase
-- gives anon and authenticated by default) covers every column, including any
-- added later, and would make the column grant below meaningless.
revoke select on public.quiz_questions from anon, authenticated;

-- Deliberately an allow-list. A column added to this table in future stays
-- unreadable until someone decides it is safe to show before grading.
grant select (id, quiz_id, ordinal, prompt, options, created_at)
  on public.quiz_questions to authenticated;

-- ── 3. The runner's view, now running as the caller ─────────────────────────
--
-- No join to `quizzes` and no `auth.uid()` filter any more: with the view
-- running as the caller, RLS on quiz_questions does the scoping, and a view
-- that repeated it would only be a second place for the rule to drift.
drop view if exists public.quiz_questions_public;
create view public.quiz_questions_public
with (security_invoker = true) as
  select id, quiz_id, ordinal, prompt, options, created_at
  from public.quiz_questions;

revoke all on public.quiz_questions_public from anon;
grant select on public.quiz_questions_public to authenticated;
