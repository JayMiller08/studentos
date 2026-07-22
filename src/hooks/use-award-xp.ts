import * as React from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/auth-provider'
import { gamificationService, type XpEvent } from '@/services/gamification-service'

/**
 * Fire an XP event and celebrate what it unlocked. Never blocks or fails the
 * action that triggered it — gamification is garnish, not gravy.
 */
export function useAwardXp() {
  const { user, profile, refreshProfile } = useAuth()

  return React.useCallback(
    async (event: XpEvent) => {
      if (!user || !profile) return
      try {
        const result = await gamificationService.award(user.id, profile, event)
        for (const badge of result.unlockedBadges) {
          toast(`${badge.emoji} Badge unlocked: ${badge.name}`, {
            description: badge.description,
          })
        }
        if (result.leveledUpTo !== null) {
          toast.success(`Level up — you're now level ${result.leveledUpTo}! 🎉`)
        }
        void refreshProfile()
      } catch (error) {
        console.error('[gamification]', error)
      }
    },
    [user, profile, refreshProfile],
  )
}
