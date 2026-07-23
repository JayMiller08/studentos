-- ============================================================================
-- StudentOS — enable Supabase Realtime
--
-- The client subscribes to Postgres changes for these user-owned tables so
-- open views update live. Two things are required for that to work:
--   1. the table must belong to the `supabase_realtime` publication, and
--   2. it needs REPLICA IDENTITY FULL so the `user_id=eq.<uid>` filter also
--      matches UPDATE/DELETE events (their old row is otherwise unavailable).
--
-- RLS still applies to realtime, so users only ever receive their own rows.
-- Idempotent: safe to run more than once.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'modules', 'assignments', 'tasks', 'calendar_events', 'study_sessions',
    'habits', 'habit_logs', 'notifications', 'notes', 'note_folders'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;

    execute format('alter table public.%I replica identity full', t);
  end loop;
end;
$$;
