-- ============================================================================
-- StudentOS — enforce Free-plan caps in the database
--
-- `assertCanCreate()` in src/lib/plans.ts is UX: it runs in a browser the user
-- controls. The RLS insert policy only checks `auth.uid() = user_id`, so anyone
-- holding the anon key and their own JWT could POST straight to PostgREST and
-- create unlimited assignments, tasks or notes. These triggers make the cap a
-- property of the data, not of the client.
--
-- The predicates mirror the client exactly:
--   assignments  status in ('not_started','in_progress')   -> isActiveAssignment
--   tasks        status <> 'done'                          -> isUnfinishedTask
--   notes        every row
-- src/lib/__tests__/plan-limits-sql.test.ts fails if the numbers here and the
-- numbers in plans.ts ever drift apart.
--
-- Idempotent.
-- ============================================================================

-- SQLSTATE the client maps back to a readable upgrade prompt (see
-- friendlyDbErrorMessage). A custom class keeps it distinguishable from a
-- genuine constraint violation.
-- PL001 = plan limit reached.

create or replace function public.enforce_plan_limit()
returns trigger
language plpgsql
-- SECURITY DEFINER so the count is the true row count rather than whatever the
-- caller's RLS lets them see; the pinned search_path stops the usual hijack.
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan  text;
  v_limit int;
  v_count int;
  v_noun  text;
begin
  select p.plan into v_plan from public.profiles p where p.id = new.user_id;
  -- No profile row yet means the account is mid-creation; treat it as Free
  -- rather than letting the insert through unmetered.
  v_plan := coalesce(v_plan, 'free');

  if v_plan <> 'free' then
    return new;
  end if;

  if tg_table_name = 'assignments' then
    -- Only meter rows that themselves count. Filing an already-submitted
    -- assignment must not be blocked just because 3 others are still active.
    if new.status not in ('not_started', 'in_progress') then
      return new;
    end if;
    v_limit := 3;
    v_noun  := 'active assignments';
    select count(*) into v_count
      from public.assignments
     where user_id = new.user_id
       and status in ('not_started', 'in_progress');

  elsif tg_table_name = 'tasks' then
    if new.status = 'done' then
      return new;
    end if;
    v_limit := 30;
    v_noun  := 'unfinished tasks';
    select count(*) into v_count
      from public.tasks
     where user_id = new.user_id
       and status <> 'done';

  elsif tg_table_name = 'notes' then
    v_limit := 15;
    v_noun  := 'notes';
    select count(*) into v_count
      from public.notes
     where user_id = new.user_id;

  else
    return new;
  end if;

  if v_count >= v_limit then
    raise exception
      'Your plan includes up to % %. Upgrade to Student Pro for unlimited %.',
      v_limit, v_noun, v_noun
      using errcode = 'PL001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_plan_limit() from public;

do $$
declare
  t text;
begin
  foreach t in array array['assignments', 'tasks', 'notes']
  loop
    execute format('drop trigger if exists %1$s_plan_limit on public.%1$I', t);
    execute format(
      'create trigger %1$s_plan_limit before insert on public.%1$I '
      'for each row execute function public.enforce_plan_limit()', t);
  end loop;
end;
$$;
