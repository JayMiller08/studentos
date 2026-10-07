import {
  QUEST_CATALOGUE,
  type QuestSlot,
  questProgress,
  questRotation,
  questsForWeek,
  questWeek,
} from '@/lib/quests'
import { supabase } from '@/lib/supabase'
import { byUser, DbError, rpc, table } from '@/services/db'
import { awardXpLocally } from '@/services/gamification-service'
import type { Quiz, QuizAttempt, XpLedgerEntry } from '@/types/models'

/**
 * Weekly quests.
 *
 * With Supabase, the board and every claim come from the database — progress
 * is counted from server-written rows and a claim is recounted before it pays
 * (migration 00017). The client sends a quest id and nothing else. Demo mode
 * has no database, so it counts the same signals from localStorage with the
 * rules in lib/quests.ts.
 */

export interface QuestBoardEntry {
  id: string
  slot: QuestSlot
  title: string
  description: string
  target: number
  reward: number
  /** May exceed `target`: a quest finished twice over still shows how far. */
  progress: number
  claimed: boolean
  /** yyyy-MM-dd, the Monday the board belongs to. */
  weekStart: string
}

export interface QuestClaim {
  /** False when it had already been claimed: nothing more was paid. */
  claimed: boolean
  awarded: number
  totalXp: number
  level: number
}

interface BoardRow {
  quest_id: string
  slot: number
  title: string
  description: string
  target: number
  reward: number
  progress: number
  claimed: boolean
  week_start: string
}

/** The ledger key a claim is paid under: one payout per quest per week. */
export function claimKey(weekStart: string, questId: string): string {
  return `${weekStart}:${questId}`
}

/** Every server-written row the progress rules read. Full rows, so claims can be found by key. */
async function signals(userId: string) {
  const [ledger, attempts, quizzes] = await Promise.all([
    table<XpLedgerEntry>('xp_ledger').list({ filters: byUser(userId) }),
    table<QuizAttempt>('quiz_attempts').list({ filters: byUser(userId) }),
    table<Quiz>('quizzes').list({ filters: byUser(userId) }),
  ])
  return { ledger, attempts, quizzes }
}

/** quest_board()'s twin, for demo mode. */
async function boardLocally(userId: string): Promise<QuestBoardEntry[]> {
  const week = questWeek()
  const counted = await signals(userId)
  const claimed = new Set(
    counted.ledger.filter((row) => row.event === 'quest_claimed').map((row) => row.source_id),
  )
  return questsForWeek(week.index).map((quest) => ({
    id: quest.id,
    slot: quest.slot,
    title: quest.title,
    description: quest.description,
    target: quest.target,
    reward: quest.reward,
    progress: questProgress(quest.metric, counted, week),
    claimed: claimed.has(claimKey(week.key, quest.id)),
    weekStart: week.key,
  }))
}

/** claim_quest()'s twin, for demo mode: the same three refusals, the same key. */
async function claimLocally(userId: string, questId: string): Promise<QuestClaim> {
  const quest = QUEST_CATALOGUE.find((entry) => entry.id === questId)
  if (!quest) throw new Error(`Unknown quest "${questId}".`)
  const week = questWeek()
  if (questRotation(quest.slot, week.index) !== quest.ordinal) {
    throw new Error("That quest is not on this week's board.")
  }
  const progress = questProgress(quest.metric, await signals(userId), week)
  if (progress < quest.target) throw new Error(`Not done yet: ${progress} of ${quest.target}.`)
  const award = await awardXpLocally(userId, 'quest_claimed', claimKey(week.key, quest.id), quest.reward)
  return { claimed: award.awarded > 0, ...award }
}

export const questService = {
  /** This week's three quests, with progress and whether each is claimed. */
  async board(userId: string): Promise<QuestBoardEntry[]> {
    if (!supabase) return boardLocally(userId)
    const rows = await rpc<BoardRow>('quest_board', {})
    return rows.map((row) => ({
      id: row.quest_id,
      slot: row.slot as QuestSlot,
      title: row.title,
      description: row.description,
      target: row.target,
      reward: row.reward,
      progress: row.progress,
      claimed: row.claimed,
      weekStart: row.week_start,
    }))
  },

  /** Claim a finished quest. Claiming one twice is harmless and pays once. */
  async claim(userId: string, questId: string): Promise<QuestClaim> {
    if (!supabase) return claimLocally(userId, questId)
    try {
      const [row] = await rpc<{ claimed: boolean; awarded: number; total_xp: number; new_level: number }>(
        'claim_quest',
        { p_quest_id: questId },
      )
      if (!row) throw new Error('claim_quest returned nothing')
      return { claimed: row.claimed, awarded: row.awarded, totalXp: row.total_xp, level: row.new_level }
    } catch (error) {
      // claim_quest's refusals are sentences written for the student ("Not
      // done yet: 3 of 5."); anything else stays a generic database error.
      if (error instanceof DbError && error.code === '22023') throw new Error(error.detail)
      throw error
    }
  },

  /** Quests claimed in past weeks, newest first, for the history on the quests page. */
  async history(userId: string): Promise<XpLedgerEntry[]> {
    return table<XpLedgerEntry>('xp_ledger').list({
      filters: byUser(userId, [{ column: 'event', op: 'eq', value: 'quest_claimed' }]),
      orderBy: { column: 'created_at', ascending: false },
    })
  },
}
