-- ============================================================================
-- StudentOS — product tour flag
-- Tracks whether a user has seen the first-run guided tour, so it shows once
-- (and can be replayed from Settings). Separate from onboarding_completed.
-- Idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists tour_completed boolean not null default false;
