-- ============================================================================
-- StudentOS — weekly quests
--
-- Three quests a week, the same three for every student, so the server can
-- check a claim with one formula — and so that in Phase 4 a squad is working
-- on the same week together. One quest comes from each of three pools:
--
--   slot 0  show up      study days, full pomodoros
--   slot 1  prove it     quizzes: take, score, beat a boss, revise
--   slot 2  keep moving  XP earned, tasks, habit check-ins, a submission
--
-- Slot s shows the quest at ordinal (week_index % pool size), where
-- week_index counts Mondays since 2024-01-01. Pools of different sizes cycle
-- at different rates, so the combinations vary week to week.
--
-- Progress is never stored and never sent by the client. It is counted, when
-- asked, from rows only the server writes: `xp_ledger` (record_activity and
-- quiz-grade) and `quiz_attempts` (quiz-grade). A claim recounts it, then pays
-- through award_xp keyed on '<week monday>:<quest id>', so a double tap — or a
-- replay next month — pays once.
--
-- The week is the student's own, Monday 00:00 in `profiles.timezone`.
--
-- Mirrored by src/lib/quests.ts for demo mode and display;
-- src/lib/__tests__/quests-sql.test.ts fails if the two drift.
--
-- Idempotent.
-- ============================================================================

-- ── 1. The catalogue ────────────────────────────────────────────────────────

create table if not exists public.quest_catalogue (
  id          text primary key,
  slot        integer not null check (slot between 0 and 2),
  -- Not named "position": that is a SQL function name (see 00014).
  ordinal     integer not null check (ordinal >= 0),
  title       text not null,
  description text not null,
  metric      text not null check (metric in (
    'study_days', 'pomodoros', 'tasks', 'habit_checkins', 'submissions',
    'quiz_attempts', 'quiz_score_80', 'boss_defeated', 'quiz_revised', 'xp_earned'
  )),
  target      integer not null check (target > 0),
  reward      integer not null check (reward > 0)
);

alter table public.quest_catalogue enable row level security;

drop policy if exists "quest_catalogue_read" on public.quest_catalogue;
create policy "quest_catalogue_read" on public.quest_catalogue
  for select using (auth.role() = 'authenticated');

revoke insert, update, delete on public.quest_catalogue from anon, authenticated;

insert into public.quest_catalogue (id, slot, ordinal, title, description, metric, target, reward) values
  ('study-5-days', 0, 0, 'Study on 5 days',         'Any study counts: a focus session, a finished task or a quiz.', 'study_days',     5,   75),
  ('pomodoros-6',  0, 1, 'Finish 6 pomodoros',      'Full focus blocks, start to finish.',                           'pomodoros',      6,   60),
  ('quizzes-3',    1, 0, 'Take 3 quizzes',          'Re-takes count. Revision is the point.',                        'quiz_attempts',  3,   75),
  ('score-80',     1, 1, 'Score 80% on a quiz',     'Any quiz, any attempt this week.',                              'quiz_score_80',  1,   60),
  ('boss-1',       1, 2, 'Beat a boss quiz',        'Score 80% or more on a boss quiz.',                             'boss_defeated',  1,  100),
  ('revise-1',     1, 3, 'Revise an old quiz',      'Retake a quiz you last took a week or more ago.',               'quiz_revised',   1,   60),
  ('xp-150',       2, 0, 'Earn 150 XP',             'From anything but quests.',                                     'xp_earned',    150,   50),
  ('tasks-10',     2, 1, 'Complete 10 tasks',       'Ticked off in the planner.',                                    'tasks',         10,   40),
  ('habits-7',     2, 2, 'Make 7 habit check-ins',  'Across any of your habits.',                                    'habit_checkins', 7,   40),
  ('submit-1',     2, 3, 'Submit an assignment',    'Mark one as submitted.',                                        'submissions',    1,   50)
on conflict (id) do update
  set slot        = excluded.slot,
      ordinal     = excluded.ordinal,
      title       = excluded.title,
      description = excluded.description,
      metric      = excluded.metric,
      target      = excluded.target,
      reward      = excluded.reward;

-- ── 2. The student's week ───────────────────────────────────────────────────

create or replace function public.quest_week(p_user_id uuid)
returns table (week_start date, week_index integer, starts_at timestamptz, ends_at timestamptz, tz text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz     text;
  v_today  date;
  v_monday date;
begin
  select coalesce(nullif(p.timezone, ''), 'UTC') into v_tz from public.profiles p where p.id = p_user_id;
  v_tz := coalesce(v_tz, 'UTC');
  begin
    v_today := (now() at time zone v_tz)::date;
  exception when others then
    -- An unrecognised timezone falls back to UTC, as touch_streak does.
    v_tz := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
  end;
  v_monday := v_today - (extract(isodow from v_today)::integer - 1);
  return query select
    v_monday,
    -- 2024-01-01 was a Monday.
    (v_monday - date '2024-01-01') / 7,
    v_monday::timestamp at time zone v_tz,
    (v_monday + 7)::timestamp at time zone v_tz,
    v_tz;
end;
$$;

revoke all on function public.quest_week(uuid) from public;
revoke all on function public.quest_week(uuid) from anon;
revoke all on function public.quest_week(uuid) from authenticated;

-- ── 3. Which quest each slot shows ──────────────────────────────────────────
--
-- One definition, used by the board and by claims alike, so a quest cannot be
-- shown one week and refused as "not this week" by a second copy of the rule.

create or replace function public.quest_rotation(p_slot integer, p_week_index integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_week_index % nullif((select count(*)::integer from public.quest_catalogue c where c.slot = p_slot), 0)
$$;

revoke all on function public.quest_rotation(integer, integer) from public;
revoke all on function public.quest_rotation(integer, integer) from anon;
revoke all on function public.quest_rotation(integer, integer) from authenticated;

-- ── 4. Progress, counted from server-written rows ───────────────────────────

create or replace function public.quest_progress(
  p_user_id uuid,
  p_metric  text,
  p_from    timestamptz,
  p_to      timestamptz,
  p_tz      text
)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(case p_metric
    -- Days with anything that keeps the streak, or a quiz attempt (a re-take
    -- writes no ledger row, but it is studying all the same).
    when 'study_days' then (
      select count(distinct day)::integer from (
        select (l.created_at at time zone p_tz)::date as day
          from public.xp_ledger l
         where l.user_id = p_user_id and l.created_at >= p_from and l.created_at < p_to
           and (l.event = 'quiz_completed'
                or l.event in (select r.event from public.xp_rewards r where r.advances_streak))
        union
        select (a.submitted_at at time zone p_tz)::date
          from public.quiz_attempts a
         where a.user_id = p_user_id and a.submitted_at >= p_from and a.submitted_at < p_to
      ) days)
    when 'pomodoros' then (
      select count(*)::integer from public.xp_ledger l
       where l.user_id = p_user_id and l.event = 'pomodoro_completed'
         and l.created_at >= p_from and l.created_at < p_to)
    when 'tasks' then (
      select count(*)::integer from public.xp_ledger l
       where l.user_id = p_user_id and l.event = 'task_completed'
         and l.created_at >= p_from and l.created_at < p_to)
    when 'habit_checkins' then (
      select count(*)::integer from public.xp_ledger l
       where l.user_id = p_user_id and l.event = 'habit_completed'
         and l.created_at >= p_from and l.created_at < p_to)
    when 'submissions' then (
      select count(*)::integer from public.xp_ledger l
       where l.user_id = p_user_id and l.event = 'assignment_submitted'
         and l.created_at >= p_from and l.created_at < p_to)
    when 'quiz_attempts' then (
      select count(*)::integer from public.quiz_attempts a
       where a.user_id = p_user_id and a.submitted_at >= p_from and a.submitted_at < p_to)
    -- score / total >= 0.8, in integers.
    when 'quiz_score_80' then (
      select count(*)::integer from public.quiz_attempts a
       where a.user_id = p_user_id and a.submitted_at >= p_from and a.submitted_at < p_to
         and a.total > 0 and a.score * 5 >= a.total * 4)
    -- The same bar quiz-grade sets for defeating a boss (BOSS_PASS_RATIO).
    when 'boss_defeated' then (
      select count(*)::integer from public.quiz_attempts a
        join public.quizzes z on z.id = a.quiz_id
       where a.user_id = p_user_id and a.submitted_at >= p_from and a.submitted_at < p_to
         and z.kind = 'boss' and a.total > 0 and a.score * 5 >= a.total * 4)
    -- An attempt whose previous attempt at the same quiz was 7+ days before it.
    when 'quiz_revised' then (
      select count(*)::integer from public.quiz_attempts a
       where a.user_id = p_user_id and a.submitted_at >= p_from and a.submitted_at < p_to
         and (select max(p.submitted_at) from public.quiz_attempts p
               where p.user_id = p_user_id and p.quiz_id = a.quiz_id
                 and p.submitted_at < a.submitted_at) <= a.submitted_at - interval '7 days')
    -- Quests themselves don't count toward an XP quest.
    when 'xp_earned' then (
      select coalesce(sum(l.amount), 0)::integer from public.xp_ledger l
       where l.user_id = p_user_id and l.event <> 'quest_claimed'
         and l.created_at >= p_from and l.created_at < p_to)
    else 0
  end, 0)
$$;

revoke all on function public.quest_progress(uuid, text, timestamptz, timestamptz, text) from public;
revoke all on function public.quest_progress(uuid, text, timestamptz, timestamptz, text) from anon;
revoke all on function public.quest_progress(uuid, text, timestamptz, timestamptz, text) from authenticated;

-- ── 5. The board, and claiming from it ──────────────────────────────────────

create or replace function public.quest_board()
returns table (
  quest_id    text,
  slot        integer,
  title       text,
  description text,
  target      integer,
  reward      integer,
  progress    integer,
  claimed     boolean,
  week_start  date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_week record;
begin
  if v_user is null then
    raise exception 'Sign in to see your quests.' using errcode = '42501';
  end if;
  select * into v_week from public.quest_week(v_user);

  return query
    select q.id, q.slot, q.title, q.description, q.target, q.reward,
           public.quest_progress(v_user, q.metric, v_week.starts_at, v_week.ends_at, v_week.tz),
           exists (
             select 1 from public.xp_ledger l
              where l.user_id = v_user and l.event = 'quest_claimed'
                and l.source_id = v_week.week_start::text || ':' || q.id),
           v_week.week_start
      from public.quest_catalogue q
     where q.ordinal = public.quest_rotation(q.slot, v_week.week_index)
     order by q.slot;
end;
$$;

revoke all on function public.quest_board() from public;
revoke all on function public.quest_board() from anon;
grant execute on function public.quest_board() to authenticated;

create or replace function public.claim_quest(p_quest_id text)
returns table (claimed boolean, awarded integer, total_xp integer, new_level integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_quest    public.quest_catalogue%rowtype;
  v_week     record;
  v_progress integer;
  v_awarded  integer;
  v_total    integer;
  v_level    integer;
begin
  if v_user is null then
    raise exception 'Sign in to claim quests.' using errcode = '42501';
  end if;

  select * into v_quest from public.quest_catalogue q where q.id = p_quest_id;
  if not found then
    raise exception 'Unknown quest "%".', p_quest_id using errcode = '22023';
  end if;

  select * into v_week from public.quest_week(v_user);
  if v_quest.ordinal is distinct from public.quest_rotation(v_quest.slot, v_week.week_index) then
    raise exception 'That quest is not on this week''s board.' using errcode = '22023';
  end if;

  v_progress := public.quest_progress(v_user, v_quest.metric, v_week.starts_at, v_week.ends_at, v_week.tz);
  if v_progress < v_quest.target then
    raise exception 'Not done yet: % of %.', v_progress, v_quest.target using errcode = '22023';
  end if;

  -- The reward from the catalogue, the key from the week: one payout, ever.
  select a.awarded, a.total_xp, a.new_level into v_awarded, v_total, v_level
    from public.award_xp(v_user, 'quest_claimed', v_week.week_start::text || ':' || v_quest.id, v_quest.reward) a;

  return query select v_awarded > 0, v_awarded, v_total, v_level;
end;
$$;

revoke all on function public.claim_quest(text) from public;
revoke all on function public.claim_quest(text) from anon;
grant execute on function public.claim_quest(text) to authenticated;
