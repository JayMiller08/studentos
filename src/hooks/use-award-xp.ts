import { useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/auth-provider'
import { announceStreak } from '@/features/gamification/announce-streak'
import { queryKeys } from '@/lib/query-keys'
import { gamificationService, type XpEvent } from '@/services/gamification-service'
import type { BadgeDef } from '@/types/models'

/**
 * Tell the student what they earned, and refresh everything that shows it.
 *
 * Shared by every path that pays XP — an activity, a graded quiz, a claimed
 * quest — so a badge or a level reads the same whichever way it arrived.
 */
function useCelebrate() {
  const { user, refreshProfile } = useAuth()
  const queryClient = useQueryClient()

  return React.useCallback(
    (earned: { badges: BadgeDef[]; leveledUpTo: number | null }) => {
      for (const badge of earned.badges) {
        toast(`${badge.emoji} Badge unlocked: ${badge.name}`, { description: badge.description })
      }
      if (earned.leveledUpTo !== null) {
        toast.success(`Level up — you're now level ${earned.leveledUpTo}! 🎉`)
      }
      if (user) {
        // Only the profile used to be refreshed, so the badge count on the
        // dashboard and the achievements page kept showing the old number
        // until something else happened to refetch it.
        if (earned.badges.length > 0) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.achievements(user.id) })
        }
        // Anything that pays XP can move a quest, and the squad's table.
        void queryClient.invalidateQueries({ queryKey: queryKeys.quests(user.id) })
        void queryClient.invalidateQueries({ queryKey: queryKeys.squad(user.id) })
      }
      void refreshProfile()
    },
    [user, refreshProfile, queryClient],
  )
}

/**
 * Report an activity and celebrate what it earned. Never blocks or fails the
 * action that triggered it — gamification is garnish, not gravy.
 *
 * `sourceId` names the row the activity happened to (the task, the study
 * session, `<habit id>:<yyyy-MM-dd>`), and is what makes it pay once: ticking
 * the same task twice records the second time at 0 XP.
 */
export function useAwardXp() {
  const { user, profile } = useAuth()
  const celebrate = useCelebrate()

  return React.useCallback(
    async (event: XpEvent, sourceId: string) => {
      if (!user || !profile) return
      try {
        const result = await gamificationService.award(user.id, profile, event, sourceId)
        // The streak moves server-side now, so this is the only place that
        // learns a freeze was spent or earned.
        announceStreak(result.streak)
        celebrate({ badges: result.unlockedBadges, leveledUpTo: result.leveledUpTo })
      } catch (error) {
        console.error('[gamification]', error)
      }
    },
    [user, profile, celebrate],
  )
}

/**
 * For XP the server paid outside an activity — a graded quiz, a claimed quest:
 * unlock the level badges the new total earns, and celebrate a level-up.
 * `level` is the level the server reported, or null if it reported none.
 */
export function useSettleXp() {
  const { user, profile } = useAuth()
  const celebrate = useCelebrate()

  return React.useCallback(
    async (level: number | null) => {
      if (!user || !profile) return
      try {
        const badges = level === null ? [] : await gamificationService.unlockLevelBadges(user.id, level)
        celebrate({ badges, leveledUpTo: level !== null && level > profile.level ? level : null })
      } catch (error) {
        console.error('[gamification]', error)
      }
    },
    [user, profile, celebrate],
  )
}
