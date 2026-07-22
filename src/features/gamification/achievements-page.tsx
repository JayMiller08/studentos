import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Award, Flame, Star, Trophy, Zap } from 'lucide-react'
import * as React from 'react'
import { useAuth } from '@/app/providers/auth-provider'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { queryKeys } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import { BADGES, gamificationService, levelProgress } from '@/services/gamification-service'

export function AchievementsPage() {
  const { user, profile } = useAuth()

  const { data: achievements = [] } = useQuery({
    queryKey: queryKeys.achievements(user?.id ?? ''),
    queryFn: () => gamificationService.listAchievements(user!.id),
    enabled: Boolean(user),
  })

  const unlockedIds = React.useMemo(
    () => new Set(achievements.map((achievement) => achievement.badge_id)),
    [achievements],
  )
  const unlockedAt = React.useMemo(
    () => new Map(achievements.map((a) => [a.badge_id, a.unlocked_at])),
    [achievements],
  )

  const progress = levelProgress(profile?.xp ?? 0)
  const unlockedCount = unlockedIds.size

  const heroStats = [
    { icon: Star, label: 'Level', value: String(progress.level) },
    { icon: Zap, label: 'Total XP', value: (profile?.xp ?? 0).toLocaleString() },
    { icon: Flame, label: 'Day streak', value: String(profile?.current_streak ?? 0) },
    { icon: Trophy, label: 'Badges', value: `${unlockedCount}/${BADGES.length}` },
  ]

  return (
    <div className="space-y-6">
      <PageHeader title="Achievements" description="Level up as you build better study habits" />

      {/* Level hero */}
      <Card className="from-primary/8 border-primary/25 bg-gradient-to-br to-transparent">
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="from-primary flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br to-indigo-500 text-2xl font-bold text-white shadow-sm">
              {progress.level}
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold">Level {progress.level}</p>
              <p className="text-muted-foreground text-sm">
                {progress.current} / {progress.needed} XP to level {progress.level + 1}
              </p>
              <Progress value={progress.percent} className="mt-2 max-w-md" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {heroStats.map((stat) => (
              <div key={stat.label} className="bg-card/60 rounded-lg border p-3 text-center">
                <stat.icon aria-hidden className="text-primary mx-auto size-4" />
                <p className="mt-1 text-lg font-semibold">{stat.value}</p>
                <p className="text-muted-foreground text-xs">{stat.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Badge grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Award aria-hidden className="text-primary size-4" /> Badges
          </CardTitle>
          <CardDescription>
            {unlockedCount} of {BADGES.length} unlocked
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {BADGES.map((badge) => {
              const unlocked = unlockedIds.has(badge.id)
              const date = unlockedAt.get(badge.id)
              return (
                <div
                  key={badge.id}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-colors',
                    unlocked ? 'border-primary/30 bg-primary/5' : 'opacity-60 grayscale',
                  )}
                >
                  <span aria-hidden className="text-3xl">
                    {badge.emoji}
                  </span>
                  <p className="text-sm font-medium">{badge.name}</p>
                  <p className="text-muted-foreground text-xs">{badge.description}</p>
                  {unlocked ? (
                    date ? (
                      <Badge variant="success" className="mt-1">
                        {format(parseISO(date), 'd MMM yyyy')}
                      </Badge>
                    ) : (
                      <Badge variant="success" className="mt-1">
                        Unlocked
                      </Badge>
                    )
                  ) : badge.xp_reward > 0 ? (
                    <Badge variant="muted" className="mt-1">
                      +{badge.xp_reward} XP
                    </Badge>
                  ) : null}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
