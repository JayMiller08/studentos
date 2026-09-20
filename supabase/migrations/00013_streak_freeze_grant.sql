-- ============================================================================
-- StudentOS — every student starts with a streak freeze
--
-- 00011 added the column with a default of 0, and a freeze is only earned when
-- a streak reaches a multiple of 7 days (src/lib/streak.ts). Together those
-- left every existing student holding nothing on the day the feature shipped,
-- with up to a week of perfect attendance to wait before the protection they
-- had just been told about could do anything — and a single missed day in the
-- meantime still wiped out the streak, which is the one thing a freeze exists
-- to prevent.
--
-- So: new profiles start with one, and existing profiles are topped up to one.
--
-- The schema change is idempotent. The top-up is a one-time correction, and
-- re-running it would hand a freeze back to someone who had spent theirs —
-- a far smaller wrong than leaving students unprotected after telling them
-- they were covered.
--
-- Earning is unchanged: one more for every 7 days in a row, at most 2 held.
-- ============================================================================

alter table public.profiles
  alter column streak_freezes set default 1;

update public.profiles
  set streak_freezes = 1
  where streak_freezes < 1;
