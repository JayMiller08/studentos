-- ============================================================================
-- StudentOS — per-page product tours
-- Replaces the single `tour_completed` flag (00006) with a list of tour ids,
-- so every page can play its own walkthrough the first time it is opened.
-- `tour_completed` is left in place: dropping it would break any client still
-- running the previous build mid-deploy.
-- Idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists tours_seen jsonb not null default '[]'::jsonb,
  add column if not exists tour_replay_hint boolean not null default false;

-- Existing users already know their way around, so replaying fifteen tours at
-- them would be noise. Mark every tour that exists *today* as seen and flag the
-- one-off pointer at the replay control instead. Tours added after this
-- migration are deliberately absent from the list, so a genuinely new page
-- still introduces itself. New rows keep the empty default.
update public.profiles
   set tours_seen = '["dashboard","planner","assignments","calendar","focus","smart-plan","coach","analytics","habits","budget","notes","achievements","billing","settings","admin"]'::jsonb,
       tour_replay_hint = true
 where onboarding_completed = true
   and tours_seen = '[]'::jsonb;
