-- ============================================================================
-- StudentOS — streak freezes
--
-- A freeze covers a single missed day, so one bad day does not wipe out a long
-- streak. Students earn one for every 7 days in a row and hold at most 2. The
-- rules live in src/lib/streak.ts (`advanceStreak`), not here — this only gives
-- them somewhere to keep the count.
--
-- No check constraint, on purpose. The streak is written by the client as part
-- of logging a study session, and a constraint rejecting a bad value would fail
-- that whole write: the session's streak would quietly stop counting. The
-- client clamps the count to 0..2 when it reads it instead (`heldFreezes`).
--
-- Safe to deploy in either order. Until this column exists, the client treats
-- freezes as unavailable and never writes it.
--
-- Idempotent.
-- ============================================================================

alter table public.profiles
  add column if not exists streak_freezes int not null default 0;
