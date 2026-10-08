-- ============================================================================
-- StudentOS — every reward pays what it says
--
-- Two places where the app showed a student XP the database would not pay:
--
-- 1. The weekly XP quest was titled "Earn 150 XP" and paid a 50 XP bonus. Read
--    beside its reward, the title looked like the reward: a student who
--    finished it expected 150 XP and was paid 50. The 150 was always the goal
--    (XP earned during the week) and the 50 a bonus on top of it. The quest now
--    reads as a goal, its description says exactly what counts, and the app
--    names every quest reward as a bonus. No amount changes.
--
-- 2. Early Bird showed "+150 XP" for submitting an assignment 3+ days before
--    its deadline, and could never be unlocked: nothing recorded when an
--    assignment was submitted, so badge_earned() had no rule for it. The
--    database now stamps `assignments.submitted_at` itself, and the badge has
--    a rule.
--
-- Both catalogues are re-seeded in full, so this file holds their current text:
-- quests-sql.test.ts and xp-integrity-sql.test.ts hold src/lib/quests.ts and
-- BADGES in gamification-service.ts to the latest seed. Idempotent.
-- ============================================================================

-- ── 1. Quests ───────────────────────────────────────────────────────────────

insert into public.quest_catalogue (id, slot, ordinal, title, description, metric, target, reward) values
  ('study-5-days', 0, 0, 'Study on 5 days',         'Any study counts: a focus session, a finished task or a quiz.',              'study_days',     5,   75),
  ('pomodoros-6',  0, 1, 'Finish 6 pomodoros',      'Full focus blocks, start to finish.',                                        'pomodoros',      6,   60),
  ('quizzes-3',    1, 0, 'Take 3 quizzes',          'Re-takes count. Revision is the point.',                                     'quiz_attempts',  3,   75),
  ('score-80',     1, 1, 'Score 80% on a quiz',     'Any quiz, any attempt this week.',                                           'quiz_score_80',  1,   60),
  ('boss-1',       1, 2, 'Beat a boss quiz',        'Score 80% or more on a boss quiz.',                                          'boss_defeated',  1,  100),
  ('revise-1',     1, 3, 'Revise an old quiz',      'Retake a quiz you last took a week or more ago.',                            'quiz_revised',   1,   60),
  ('xp-150',       2, 0, 'Reach 150 XP this week',  'All XP you earn this week counts — quizzes, tasks, focus, habits, badges — except quest bonuses.', 'xp_earned', 150, 50),
  ('tasks-10',     2, 1, 'Complete 10 tasks',       'Ticked off in the planner.',                                                 'tasks',         10,   40),
  ('habits-7',     2, 2, 'Make 7 habit check-ins',  'Across any of your habits.',                                                 'habit_checkins', 7,   40),
  ('submit-1',     2, 3, 'Submit an assignment',    'Mark one as submitted.',                                                     'submissions',    1,   50)
on conflict (id) do update
  set slot        = excluded.slot,
      ordinal     = excluded.ordinal,
      title       = excluded.title,
      description = excluded.description,
      metric      = excluded.metric,
      target      = excluded.target,
      reward      = excluded.reward;

-- ── 2. Badges ───────────────────────────────────────────────────────────────
--
-- 00002 seeded these with `on conflict do nothing`, so its text could never be
-- corrected on a project that already had the rows. This one overwrites.

insert into public.badges (id, name, description, emoji, xp_reward) values
  ('first-assignment',  'Off the Blocks',    'Create your first assignment',                      '📝',  50),
  ('first-submission',  'Shipped It',        'Mark your first assignment as submitted',           '🚀', 100),
  ('first-pomodoro',    'Deep Diver',        'Complete your first Pomodoro focus session',        '🍅',  50),
  ('focus-10h',         'Focus Apprentice',  'Log 10 hours of focused study',                     '⏱️', 150),
  ('focus-50h',         'Focus Master',      'Log 50 hours of focused study',                     '🧠', 400),
  ('streak-7',          'One Week Wonder',   'Keep a 7-day study streak',                         '🔥', 200),
  ('streak-30',         'Unstoppable',       'Keep a 30-day study streak',                        '🌋', 600),
  ('habit-builder',     'Habit Builder',     'Complete a habit 21 times',                         '🌱', 200),
  ('note-taker',        'Scribe',            'Write 10 notes',                                    '📚', 100),
  ('early-bird',        'Early Bird',        'Submit an assignment 3+ days before its deadline',  '🐦', 150),
  ('level-5',           'Rising Star',       'Reach level 5',                                     '⭐',   0),
  ('level-10',          'Campus Legend',     'Reach level 10',                                    '🏆',   0)
on conflict (id) do update
  set name        = excluded.name,
      description = excluded.description,
      emoji       = excluded.emoji,
      xp_reward   = excluded.xp_reward;

-- ── 3. When an assignment was submitted ─────────────────────────────────────
--
-- Stamped on the way into "submitted" (or straight to "graded"), kept while it
-- stays there, cleared if it is taken back. The trigger overwrites whatever a
-- client sends, so the time cannot be chosen or backdated. Assignments
-- submitted before this migration keep no stamp: when they went in was never
-- recorded, so it is not guessed.

alter table public.assignments add column if not exists submitted_at timestamptz;

create or replace function public.stamp_assignment_submission()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status not in ('submitted', 'graded') then
    new.submitted_at := null;
  elsif tg_op = 'INSERT' then
    new.submitted_at := now();
  elsif old.status not in ('submitted', 'graded') then
    new.submitted_at := now();
  else
    new.submitted_at := old.submitted_at;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_stamp_submission on public.assignments;
create trigger assignments_stamp_submission
  before insert or update on public.assignments
  for each row execute function public.stamp_assignment_submission();

-- ── 4. Early Bird can be earned ─────────────────────────────────────────────
--
-- badge_earned() as 00016 wrote it, plus the rule it lacked. Like the other
-- row-counting badges it is as honest as the student's own rows (a deadline is
-- theirs to set), and like every badge it pays once.

create or replace function public.badge_earned(p_user_id uuid, p_badge_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(case p_badge_id
    when 'first-assignment' then exists (
      select 1 from public.assignments a where a.user_id = p_user_id)
    when 'first-submission' then exists (
      select 1 from public.assignments a
       where a.user_id = p_user_id and a.status in ('submitted', 'graded'))
    when 'first-pomodoro' then exists (
      select 1 from public.pomodoro_sessions p
       where p.user_id = p_user_id and p.kind = 'focus' and p.completed)
    when 'focus-10h' then (
      select coalesce(sum(s.minutes), 0) from public.study_sessions s where s.user_id = p_user_id) >= 600
    when 'focus-50h' then (
      select coalesce(sum(s.minutes), 0) from public.study_sessions s where s.user_id = p_user_id) >= 3000
    when 'habit-builder' then (
      select count(*) from public.habit_logs l where l.user_id = p_user_id) >= 21
    when 'note-taker' then (
      select count(*) from public.notes n where n.user_id = p_user_id) >= 10
    when 'early-bird' then exists (
      select 1 from public.assignments a
       where a.user_id = p_user_id
         and a.status in ('submitted', 'graded')
         and a.due_at - a.submitted_at >= interval '3 days')
    when 'streak-7' then (
      select p.longest_streak from public.profiles p where p.id = p_user_id) >= 7
    when 'streak-30' then (
      select p.longest_streak from public.profiles p where p.id = p_user_id) >= 30
    when 'level-5' then (
      select p.level from public.profiles p where p.id = p_user_id) >= 5
    when 'level-10' then (
      select p.level from public.profiles p where p.id = p_user_id) >= 10
    else false
  end, false)
$$;

revoke all on function public.badge_earned(uuid, text) from public;
revoke all on function public.badge_earned(uuid, text) from anon;
revoke all on function public.badge_earned(uuid, text) from authenticated;
