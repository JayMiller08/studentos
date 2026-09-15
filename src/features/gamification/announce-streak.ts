import { toast } from 'sonner'
import { MAX_STREAK_FREEZES, type StreakAdvance } from '@/lib/streak'

/**
 * Tell the student when a streak freeze did something.
 *
 * A freeze that quietly saves a streak looks, from the outside, like the streak
 * simply didn't break — so the student learns that missing a day is free, and
 * finds out otherwise on the day they have none left.
 */
export function announceStreak(advance: StreakAdvance | null): void {
  if (!advance) return
  const days = advance.patch.current_streak

  if (advance.usedFreeze) {
    const left = advance.patch.streak_freezes ?? 0
    toast(`❄️ Streak freeze used — your ${days}-day streak is safe`, {
      description:
        left === 0
          ? 'You missed a day, so a freeze covered it. That was your last one.'
          : `You missed a day, so a freeze covered it. ${left} left.`,
    })
  }

  if (advance.earnedFreeze) {
    toast('❄️ You earned a streak freeze', {
      description: `${days} days in a row. A freeze covers one missed day, and you can hold ${MAX_STREAK_FREEZES}.`,
    })
  }
}
