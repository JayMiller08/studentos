import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/auth-provider'
import { queryKeys } from '@/lib/query-keys'
import { gamificationService } from '@/services/gamification-service'

/**
 * The student's unlocked badges.
 *
 * One definition for every screen that shows them — the dashboard's progress
 * strip and the achievements page — so both read the same cache entry and an
 * unlock refreshes both at once (see useAwardXp).
 */
export function useAchievements() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.achievements(user?.id ?? ''),
    queryFn: () => gamificationService.listAchievements(user!.id),
    enabled: Boolean(user),
  })
}
