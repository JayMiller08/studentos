import { startOfDay } from 'date-fns'
import { advanceStreak, effectiveStreak, STARTING_STREAK_FREEZES, type StreakAdvance } from '@/lib/streak'
import { supabase } from '@/lib/supabase'
import { byUser, rpc, table } from '@/services/db'
import type {
  Achievement,
  Assignment,
  BadgeDef,
  HabitLog,
  Note,
  PomodoroSession,
  Profile,
  StudySession,
  Task,
  XpLedgerEntry,
} from '@/types/models'

/**
 * Gamification: XP, levels and achievements.
 *
 * Level curve: level n starts at 100 · (n−1)² XP — early levels come fast,
 * later ones reward consistency (L2 @ 100, L3 @ 400, L5 @ 1600, L10 @ 8100).
 *
 * Since migration 00016 the client never writes XP, a level, a streak or a
 * badge. It reports what happened — "this task is done" — and the database
 * decides what that is worth: `record_activity` for activity, `unlock_badge`
 * for badges, and quiz grading for answers. Demo mode has no database, so each
 * of those has a local twin below that keeps the same rules on localStorage.
 */

export type XpEvent =
  | 'task_completed'
  | 'assignment_created'
  | 'assignment_submitted'
  | 'pomodoro_completed'
  | 'study_session'
  | 'habit_completed'
  | 'note_created'

export interface ActivityRule {
  /** XP per occurrence. */
  amount: number
  /** Occurrences paid per student per day; later ones are recorded at 0. */
  dailyCap: number
  /** Whether it counts as studying for the daily streak. */
  advancesStreak: boolean
}

/**
 * What each activity pays.
 *
 * The database owns these (`xp_rewards`, migration 00016), so this copy is for
 * explaining a reward and for demo mode; `xp-integrity-sql.test.ts` fails if
 * the two drift. Rebalanced down when the quiz engine landed: ticked boxes and
 * minutes on a timer are self-reported, so they pay a token amount — enough to
 * acknowledge the work, not enough to be worth gaming — and the daily caps
 * bound what gaming them could earn. The numbers that matter are in QUIZ_XP.
 *
 * `study_session` is time studied that wasn't a finished pomodoro: a deep work
 * block, a pomodoro stopped early. It pays nothing but keeps the streak.
 */
export const ACTIVITY_RULES: Record<XpEvent, ActivityRule> = {
  task_completed: { amount: 3, dailyCap: 20, advancesStreak: true },
  pomodoro_completed: { amount: 5, dailyCap: 12, advancesStreak: true },
  study_session: { amount: 0, dailyCap: 0, advancesStreak: true },
  habit_completed: { amount: 5, dailyCap: 10, advancesStreak: false },
  note_created: { amount: 5, dailyCap: 5, advancesStreak: false },
  assignment_created: { amount: 5, dailyCap: 5, advancesStreak: false },
  assignment_submitted: { amount: 50, dailyCap: 2, advancesStreak: false },
}

/**
 * XP for verified answers. Display only.
 *
 * Deliberately NOT part of XpEvent: these are granted by the `quiz-grade` Edge
 * Function through `award_xp`, against an answer key the browser never sees. If
 * the client could award them, they would be worth exactly as much as the
 * numbers above. This copy exists so the result screen can explain the score,
 * and `quiz-xp-parity.test.ts` fails if it drifts from the function.
 */
export const QUIZ_XP = {
  /** Per correct answer. */
  correct: 8,
  /** Flat, for finishing an attempt at all. */
  completed: 15,
  /** Bonus for passing a boss quiz. */
  boss: 120,
  /** Share of a boss quiz that must be right to defeat it. */
  bossPassRatio: 0.8,
} as const

export function levelForXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1
}

export function xpForLevel(level: number): number {
  return 100 * (level - 1) ** 2
}

export function levelProgress(xp: number): { level: number; current: number; needed: number; percent: number } {
  const level = levelForXp(xp)
  const floor = xpForLevel(level)
  const ceiling = xpForLevel(level + 1)
  const current = xp - floor
  const needed = ceiling - floor
  return { level, current, needed, percent: Math.round((current / needed) * 100) }
}

/** Badge catalog — mirrors the seeded `badges` table (source of truth in SQL). */
export const BADGES: BadgeDef[] = [
  { id: 'first-assignment', name: 'Off the Blocks', description: 'Create your first assignment', emoji: '📝', xp_reward: 50 },
  { id: 'first-submission', name: 'Shipped It', description: 'Mark your first assignment as submitted', emoji: '🚀', xp_reward: 100 },
  { id: 'first-pomodoro', name: 'Deep Diver', description: 'Complete your first Pomodoro focus session', emoji: '🍅', xp_reward: 50 },
  { id: 'focus-10h', name: 'Focus Apprentice', description: 'Log 10 hours of focused study', emoji: '⏱️', xp_reward: 150 },
  { id: 'focus-50h', name: 'Focus Master', description: 'Log 50 hours of focused study', emoji: '🧠', xp_reward: 400 },
  { id: 'streak-7', name: 'One Week Wonder', description: 'Keep a 7-day study streak', emoji: '🔥', xp_reward: 200 },
  { id: 'streak-30', name: 'Unstoppable', description: 'Keep a 30-day study streak', emoji: '🌋', xp_reward: 600 },
  { id: 'habit-builder', name: 'Habit Builder', description: 'Complete a habit 21 times', emoji: '🌱', xp_reward: 200 },
  { id: 'note-taker', name: 'Scribe', description: 'Write 10 notes', emoji: '📚', xp_reward: 100 },
  { id: 'early-bird', name: 'Early Bird', description: 'Submit an assignment 3+ days before its deadline', emoji: '🐦', xp_reward: 150 },
  { id: 'level-5', name: 'Rising Star', description: 'Reach level 5', emoji: '⭐', xp_reward: 0 },
  { id: 'level-10', name: 'Campus Legend', description: 'Reach level 10', emoji: '🏆', xp_reward: 0 },
]

/**
 * The numbers behind the threshold badges.
 *
 * `badge_earned()` (migrations 00016 and 00019) checks the same numbers before
 * a badge can pay, so a client that skipped these checks gains nothing; the
 * copy here only decides when it is worth asking. `xp-integrity-sql.test.ts`
 * holds them equal.
 */
export const BADGE_THRESHOLDS = {
  /** Minutes studied, in total. */
  'focus-10h': 600,
  'focus-50h': 3000,
  /** Habit check-ins, in total. */
  'habit-builder': 21,
  /** Notes written. */
  'note-taker': 10,
  /** Best streak, in days. */
  'streak-7': 7,
  'streak-30': 30,
  /** Days to spare between submitting an assignment and its deadline. */
  'early-bird': 3,
  /** Level reached. */
  'level-5': 5,
  'level-10': 10,
} as const

const achievements = () => table<Achievement>('achievements')
const ledger = () => table<XpLedgerEntry>('xp_ledger')

const DAY_MS = 24 * 60 * 60 * 1000

// ── Recording progress ──────────────────────────────────────────────────────

/** What recording one activity did. */
export interface ActivityResult {
  /** XP this occurrence paid: 0 for a repeat, or once the day's cap is reached. */
  awarded: number
  totalXp: number
  level: number
  /** What it did to the streak; null when the streak didn't move. */
  streak: StreakAdvance | null
}

/** What asking for a badge did. */
export interface BadgeUnlock {
  /** True only the first time, and only if the badge's condition holds. */
  unlocked: boolean
  awarded: number
  totalXp: number
  level: number
}

/** A row from `record_activity`, as PostgREST returns it. */
interface ActivityRow {
  awarded: number
  total_xp: number
  new_level: number
  streak: number | null
  best_streak: number | null
  freezes: number | null
  /** yyyy-MM-dd */
  active_on: string | null
  used_freeze: boolean
  earned_freeze: boolean
  streak_changed: boolean
}

/** The server's streak report, in the shape advanceStreak() produces locally. */
function streakFromRow(row: ActivityRow): StreakAdvance | null {
  if (!row.streak_changed || row.streak === null || row.active_on === null) return null
  return {
    patch: {
      current_streak: row.streak,
      longest_streak: row.best_streak ?? row.streak,
      last_active_date: row.active_on,
      ...(row.freezes === null ? {} : { streak_freezes: row.freezes }),
    },
    usedFreeze: row.used_freeze,
    earnedFreeze: row.earned_freeze,
  }
}

/**
 * `award_xp`'s twin, for demo mode: idempotent on (user, event, source), so
 * the local store keeps the ledger's rules — the first time pays, a replay
 * does not, and every payment leaves a ledger row.
 */
export async function awardXpLocally(
  userId: string,
  event: string,
  sourceId: string,
  amount: number,
): Promise<{ awarded: number; totalXp: number; level: number }> {
  const profiles = table<Profile>('profiles')
  const profile = await profiles.get(userId)
  if (!profile) return { awarded: 0, totalXp: 0, level: 1 }

  const seen = await ledger().count(
    byUser(userId, [
      { column: 'event', op: 'eq', value: event },
      { column: 'source_id', op: 'eq', value: sourceId },
    ]),
  )
  if (seen > 0) return { awarded: 0, totalXp: profile.xp, level: profile.level }

  const paid = Math.max(0, Math.round(amount))
  await ledger().insert({ user_id: userId, event, source_id: sourceId, amount: paid })
  if (paid === 0) return { awarded: 0, totalXp: profile.xp, level: profile.level }

  const totalXp = profile.xp + paid
  const level = levelForXp(totalXp)
  await profiles.update(userId, { xp: totalXp, level })
  return { awarded: paid, totalXp, level }
}

/**
 * `touch_streak`'s twin, for demo mode. Today is the device's day here; the
 * server uses the profile's timezone, which onboarding sets to the device's.
 */
export async function touchStreakLocally(userId: string): Promise<StreakAdvance | null> {
  const profiles = table<Profile>('profiles')
  const profile = await profiles.get(userId)
  if (!profile) return null
  // localStorage stores any field, so the column always "exists" here; a demo
  // profile from before freezes simply starts with the standard grant.
  const advance = advanceStreak({
    ...profile,
    streak_freezes: profile.streak_freezes ?? STARTING_STREAK_FREEZES,
  })
  if (advance) await profiles.update(userId, advance.patch)
  return advance
}

/**
 * `activity_happened`'s twin. Demo mode has nothing to protect, but keeping the
 * check means a call made before its row is saved fails here too, rather than
 * paying in demo and silently failing in production.
 */
async function happenedLocally(userId: string, event: XpEvent, sourceId: string): Promise<boolean> {
  const own = <Row extends { user_id: string }>(row: Row | null): row is Row =>
    row !== null && row.user_id === userId
  switch (event) {
    case 'task_completed': {
      const task = await table<Task>('tasks').get(sourceId)
      return own(task) && task.status === 'done'
    }
    case 'study_session': {
      const session = await table<StudySession>('study_sessions').get(sourceId)
      return own(session) && session.minutes > 0
    }
    case 'pomodoro_completed': {
      const rows = await table<PomodoroSession>('pomodoro_sessions').list({
        filters: byUser(userId, [{ column: 'study_session_id', op: 'eq', value: sourceId }]),
      })
      return rows.some((row) => row.kind === 'focus' && row.completed)
    }
    case 'habit_completed': {
      const [habitId, logDate] = sourceId.split(':')
      const logged = await table<HabitLog>('habit_logs').count(
        byUser(userId, [
          { column: 'habit_id', op: 'eq', value: habitId },
          { column: 'log_date', op: 'eq', value: logDate },
        ]),
      )
      return logged > 0
    }
    case 'note_created':
      return own(await table<Note>('notes').get(sourceId))
    case 'assignment_created':
      return own(await table<Assignment>('assignments').get(sourceId))
    case 'assignment_submitted': {
      const assignment = await table<Assignment>('assignments').get(sourceId)
      return own(assignment) && (assignment.status === 'submitted' || assignment.status === 'graded')
    }
  }
}

/** `record_activity`'s twin, for demo mode. */
async function recordActivityLocally(userId: string, event: XpEvent, sourceId: string): Promise<ActivityResult> {
  if (!(await happenedLocally(userId, event, sourceId))) {
    throw new Error('There is nothing to record for that.')
  }
  const rule = ACTIVITY_RULES[event]
  const paidToday = (
    await ledger().list({
      filters: byUser(userId, [
        { column: 'event', op: 'eq', value: event },
        { column: 'created_at', op: 'gte', value: startOfDay(new Date()).toISOString() },
      ]),
    })
  ).filter((row) => row.amount > 0).length

  const award = await awardXpLocally(userId, event, sourceId, paidToday >= rule.dailyCap ? 0 : rule.amount)
  const streak = rule.advancesStreak ? await touchStreakLocally(userId) : null
  return { awarded: award.awarded, totalXp: award.totalXp, level: award.level, streak }
}

/** `unlock_badge`'s twin, for demo mode. The caller has already checked the condition. */
async function unlockBadgeLocally(userId: string, badgeId: string): Promise<BadgeUnlock> {
  const badge = BADGES.find((def) => def.id === badgeId)
  if (!badge) throw new Error(`Unknown badge "${badgeId}".`)
  const held = await achievements().count(byUser(userId, [{ column: 'badge_id', op: 'eq', value: badgeId }]))
  if (held === 0) {
    await achievements().insert({ user_id: userId, badge_id: badgeId, unlocked_at: new Date().toISOString() })
  }
  const award = await awardXpLocally(userId, 'badge_unlocked', badgeId, held === 0 ? badge.xp_reward : 0)
  return { unlocked: held === 0, ...award }
}

// ── Service ─────────────────────────────────────────────────────────────────

export interface AwardResult {
  /** XP actually paid: the activity, plus any badge rewards it unlocked. */
  xpGained: number
  leveledUpTo: number | null
  unlockedBadges: BadgeDef[]
  /** What the activity did to the streak, or null if it didn't move. */
  streak: StreakAdvance | null
}

export const gamificationService = {
  listAchievements(userId: string): Promise<Achievement[]> {
    return achievements().list({ filters: byUser(userId) })
  },

  /**
   * Report that something happened, identified by the row it happened to: the
   * task's id, the study session's, `<habit id>:<yyyy-MM-dd>` for a habit
   * check-in. The source is what makes it pay once.
   */
  async recordActivity(userId: string, event: XpEvent, sourceId: string): Promise<ActivityResult> {
    if (!supabase) return recordActivityLocally(userId, event, sourceId)
    const [row] = await rpc<ActivityRow>('record_activity', { p_event: event, p_source_id: sourceId })
    if (!row) throw new Error('record_activity returned nothing')
    return { awarded: row.awarded, totalXp: row.total_xp, level: row.new_level, streak: streakFromRow(row) }
  },

  /** Ask for a badge. The database checks the condition again before it pays. */
  async unlockBadge(userId: string, badgeId: string): Promise<BadgeUnlock> {
    if (!supabase) return unlockBadgeLocally(userId, badgeId)
    const [row] = await rpc<{ unlocked: boolean; awarded: number; total_xp: number; new_level: number }>(
      'unlock_badge',
      { p_badge_id: badgeId },
    )
    if (!row) throw new Error('unlock_badge returned nothing')
    return { unlocked: row.unlocked, awarded: row.awarded, totalXp: row.total_xp, level: row.new_level }
  },

  /**
   * The level badges a total has earned, for XP paid outside award() — a
   * graded quiz, a claimed quest — which would otherwise wait for the next
   * ticked task to notice a level 5. Returns the badges it unlocked.
   */
  async unlockLevelBadges(userId: string, level: number): Promise<BadgeDef[]> {
    const due = (['level-5', 'level-10'] as const).filter((id) => level >= BADGE_THRESHOLDS[id])
    if (due.length === 0) return []
    const held = new Set((await gamificationService.listAchievements(userId)).map((a) => a.badge_id))
    const unlocked: BadgeDef[] = []
    for (const badgeId of due) {
      if (held.has(badgeId)) continue
      if (!(await gamificationService.unlockBadge(userId, badgeId)).unlocked) continue
      const def = BADGES.find((badge) => badge.id === badgeId)
      if (def) unlocked.push(def)
    }
    return unlocked
  },

  /**
   * Record an activity, then try any badges it might have unlocked. Returns
   * what changed so the UI can celebrate.
   */
  async award(userId: string, profile: Profile, event: XpEvent, sourceId: string): Promise<AwardResult> {
    const activity = await gamificationService.recordActivity(userId, event, sourceId)
    const result: AwardResult = {
      xpGained: activity.awarded,
      leveledUpTo: null,
      unlockedBadges: [],
      streak: activity.streak,
    }
    let level = activity.level

    // Read once, so a badge already held costs no further round trip.
    const held = new Set((await gamificationService.listAchievements(userId)).map((a) => a.badge_id))

    const countOf = (tableName: string) => table<{ id: string }>(tableName).count(byUser(userId))
    const checks: Array<{ id: string; passes: () => Promise<boolean> }> = []

    if (event === 'assignment_created') checks.push({ id: 'first-assignment', passes: async () => true })
    if (event === 'assignment_submitted') {
      checks.push({ id: 'first-submission', passes: async () => true })
      // Days to spare from now, which is when it went in: the database stamps
      // the submission time itself (00019) and checks the same margin.
      checks.push({
        id: 'early-bird',
        passes: async () => {
          const assignment = await table<Assignment>('assignments').get(sourceId)
          return (
            assignment !== null &&
            Date.parse(assignment.due_at) - Date.now() >= BADGE_THRESHOLDS['early-bird'] * DAY_MS
          )
        },
      })
    }
    if (event === 'pomodoro_completed') {
      checks.push({ id: 'first-pomodoro', passes: async () => true })
      // Both thresholds are about total *minutes*, so this cannot be a count()
      // of rows — twenty five-minute sessions are not ten hours. The sum is read
      // once and shared, and only if one of the two is still to earn.
      let focusMinutes: Promise<number> | null = null
      const totalFocusMinutes = () => {
        focusMinutes ??= table<StudySession>('study_sessions')
          .list({ filters: byUser(userId) })
          .then((sessions) => sessions.reduce((sum, session) => sum + session.minutes, 0))
        return focusMinutes
      }
      checks.push({ id: 'focus-10h', passes: async () => (await totalFocusMinutes()) >= BADGE_THRESHOLDS['focus-10h'] })
      checks.push({ id: 'focus-50h', passes: async () => (await totalFocusMinutes()) >= BADGE_THRESHOLDS['focus-50h'] })
    }
    if (event === 'habit_completed') {
      checks.push({
        id: 'habit-builder',
        passes: async () => (await countOf('habit_logs')) >= BADGE_THRESHOLDS['habit-builder'],
      })
    }
    if (event === 'note_created') {
      checks.push({ id: 'note-taker', passes: async () => (await countOf('notes')) >= BADGE_THRESHOLDS['note-taker'] })
    }

    // Streak badges piggyback on any event, against the best streak — as it
    // stands after this activity — which is what the database checks too.
    const best = activity.streak
      ? activity.streak.patch.longest_streak
      : Math.max(profile.longest_streak, effectiveStreak(profile))
    if (best >= BADGE_THRESHOLDS['streak-7']) checks.push({ id: 'streak-7', passes: async () => true })
    if (best >= BADGE_THRESHOLDS['streak-30']) checks.push({ id: 'streak-30', passes: async () => true })

    const tryUnlock = async (badgeId: string) => {
      if (held.has(badgeId)) return
      held.add(badgeId)
      const unlock = await gamificationService.unlockBadge(userId, badgeId)
      // Always the newest figures, so the level badges below see the XP any
      // badge just paid.
      level = unlock.level
      if (!unlock.unlocked) return
      const def = BADGES.find((badge) => badge.id === badgeId)
      if (def) result.unlockedBadges.push(def)
      result.xpGained += unlock.awarded
    }

    for (const check of checks) {
      if (!held.has(check.id) && (await check.passes())) await tryUnlock(check.id)
    }
    if (level >= BADGE_THRESHOLDS['level-5']) await tryUnlock('level-5')
    if (level >= BADGE_THRESHOLDS['level-10']) await tryUnlock('level-10')

    if (level > profile.level) result.leveledUpTo = level
    return result
  },
}
