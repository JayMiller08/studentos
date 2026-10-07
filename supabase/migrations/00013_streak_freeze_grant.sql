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
-- Idempotent, including the top-up. The top-up is a one-time correction:
-- re-running it would hand a freeze back to every student who has spent theirs
-- since. That is not hypothetical — a migration run by hand in the SQL Editor
-- leaves no row in the migration history, so `db push` runs it again later.
-- The default this migration sets is its own receipt: if the column already
-- defaults to 1, the top-up has been done and is skipped.
--
-- Earning is unchanged: one more for every 7 days in a row, at most 2 held.
-- ============================================================================

do $$
begin
  -- Checked before the default changes below, so this sees 00011's default
  -- (0) on the first run and this migration's own (1) on any later one.
  if coalesce(
    (select column_default
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'streak_freezes'),
    ''
  ) <> '1' then
    update public.profiles
      set streak_freezes = 1
      where streak_freezes < 1;
  end if;
end;
$$;

alter table public.profiles
  alter column streak_freezes set default 1;
