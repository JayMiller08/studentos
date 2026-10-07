import { QUEST_CATALOGUE } from '@/lib/quests'
import type { QuestBoardEntry } from '@/services/quest-service'

/** Whether a quest's goal is an amount of XP (as opposed to tasks, days, quizzes…). */
export function isXpGoal(quest: Pick<QuestBoardEntry, 'id'>): boolean {
  return QUEST_CATALOGUE.find((entry) => entry.id === quest.id)?.metric === 'xp_earned'
}

/** " XP" for a quest whose target is an amount of XP, so "45 of 150" says of what. */
export function questUnit(quest: QuestBoardEntry): string {
  return isXpGoal(quest) ? ' XP' : ''
}

/**
 * Where a quest stands, in words: what the ring shows, for everyone else.
 *
 * An XP goal says "earned", so its progress can never be mistaken for the
 * bonus the quest pays — the confusion that "Earn 150 XP" next to "+50 XP"
 * caused.
 */
export function questStatus(quest: QuestBoardEntry): string {
  if (quest.claimed) return 'Claimed'
  if (quest.progress >= quest.target) return 'Done — ready to claim'
  const shown = Math.min(quest.progress, quest.target)
  return isXpGoal(quest) ? `${shown} of ${quest.target} XP earned` : `${shown} of ${quest.target}`
}

/**
 * What finishing a quest pays, always named as a bonus: it comes on top of the
 * XP the student earned doing the work, and a bare "+50 XP" beside a goal of
 * "150 XP" reads as the quest paying less than it said.
 */
export function questBonus(quest: Pick<QuestBoardEntry, 'reward'>): string {
  return `+${quest.reward} XP bonus`
}
