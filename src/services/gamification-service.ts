import { byUser, table } from '@/services/db'
import { profileService } from '@/services/profile-service'
import type { Achievement, BadgeDef, Profile } from '@/types/models'

/**
 * Gamification: XP, levels and achievements.
 *
 * Level curve: level n starts at 100 · (n−1)² XP — early levels come fast,
 * later ones reward consistency (L2 @ 100, L3 @ 400, L5 @ 1600, L10 @ 8100).
 */

export type XpEvent =
  | 'task_completed'
  | 'assignment_created'
  | 'assignment_submitted'
  | 'pomodoro_completed'
  | 'habit_completed'
  | 'note_created'

export const XP_REWARDS: Record<XpEvent, number> = {
  task_completed: 10,
  assignment_created: 5,
  assignment_submitted: 50,
  pomodoro_completed: 15,
  habit_completed: 5,
  note_created: 5,
}

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
  { id: 'budget-boss', name: 'Budget Boss', description: 'Stay under budget for a full month', emoji: '💰', xp_reward: 250 },
  { id: 'note-taker', name: 'Scribe', description: 'Write 10 notes', emoji: '📚', xp_reward: 100 },
  { id: 'early-bird', name: 'Early Bird', description: 'Finish an assignment 3+ days before the deadline', emoji: '🐦', xp_reward: 150 },
  { id: 'level-5', name: 'Rising Star', description: 'Reach level 5', emoji: '⭐', xp_reward: 0 },
  { id: 'level-10', name: 'Campus Legend', description: 'Reach level 10', emoji: '🏆', xp_reward: 0 },
]

const achievements = () => table<Achievement>('achievements')

async function unlock(userId: string, badgeId: string): Promise<Achievement | null> {
  const existing = await achievements().list({
    filters: byUser(userId, [{ column: 'badge_id', op: 'eq', value: badgeId }]),
    limit: 1,
  })
  if (existing.length > 0) return null
  return achievements().insert({
    user_id: userId,
    badge_id: badgeId,
    unlocked_at: new Date().toISOString(),
  })
}

export interface AwardResult {
  xpGained: number
  leveledUpTo: number | null
  unlockedBadges: BadgeDef[]
}

export const gamificationService = {
  listAchievements(userId: string): Promise<Achievement[]> {
    return achievements().list({ filters: byUser(userId) })
  },

  /**
   * Grant XP for an event, roll levels, and evaluate cheap badge conditions.
   * Returns what changed so the UI can celebrate.
   */
  async award(userId: string, profile: Profile, event: XpEvent): Promise<AwardResult> {
    const result: AwardResult = { xpGained: XP_REWARDS[event], leveledUpTo: null, unlockedBadges: [] }

    // Event-linked badges (count-based checks stay cheap: single-table counts).
    const badgeChecks: Array<{ id: string; passes: () => Promise<boolean> }> = []
    const countOf = (tableName: string, extra: Parameters<typeof byUser>[1] = []) =>
      table<{ id: string }>(tableName).count(byUser(userId, extra))

    if (event === 'assignment_created') {
      badgeChecks.push({ id: 'first-assignment', passes: async () => true })
    }
    if (event === 'assignment_submitted') {
      badgeChecks.push({ id: 'first-submission', passes: async () => true })
    }
    if (event === 'pomodoro_completed') {
      badgeChecks.push({ id: 'first-pomodoro', passes: async () => true })
      badgeChecks.push({
        id: 'focus-10h',
        passes: async () => {
          const sessions = await table<{ id: string; minutes: number }>('study_sessions').list({
            filters: byUser(userId),
          })
          return sessions.reduce((sum, s) => sum + s.minutes, 0) >= 600
        },
      })
      badgeChecks.push({
        id: 'focus-50h',
        passes: async () => {
          const sessions = await table<{ id: string; minutes: number }>('study_sessions').list({
            filters: byUser(userId),
          })
          return sessions.reduce((sum, s) => sum + s.minutes, 0) >= 3000
        },
      })
    }
    if (event === 'habit_completed') {
      badgeChecks.push({
        id: 'habit-builder',
        passes: async () => (await countOf('habit_logs')) >= 21,
      })
    }
    if (event === 'note_created') {
      badgeChecks.push({ id: 'note-taker', passes: async () => (await countOf('notes')) >= 10 })
    }

    // Streak badges piggyback on any event.
    if (profile.current_streak >= 7) badgeChecks.push({ id: 'streak-7', passes: async () => true })
    if (profile.current_streak >= 30) badgeChecks.push({ id: 'streak-30', passes: async () => true })

    for (const check of badgeChecks) {
      if (await check.passes()) {
        const unlocked = await unlock(userId, check.id)
        if (unlocked) {
          const def = BADGES.find((badge) => badge.id === check.id)
          if (def) {
            result.unlockedBadges.push(def)
            result.xpGained += def.xp_reward
          }
        }
      }
    }

    const newXp = profile.xp + result.xpGained
    let newLevel = levelForXp(newXp)

    // Level badges.
    for (const [threshold, badgeId] of [
      [5, 'level-5'],
      [10, 'level-10'],
    ] as const) {
      if (newLevel >= threshold) {
        const unlocked = await unlock(userId, badgeId)
        if (unlocked) {
          const def = BADGES.find((badge) => badge.id === badgeId)
          if (def) result.unlockedBadges.push(def)
        }
      }
    }

    newLevel = levelForXp(newXp)
    if (newLevel > profile.level) result.leveledUpTo = newLevel

    await profileService.update(userId, { xp: newXp, level: newLevel })
    return result
  },
}
