import { format, parseISO } from 'date-fns'
import { Award, Flame, Star, Trophy, Zap } from 'lucide-react'
import * as React from 'react'
import { useAuth } from '@/app/providers/auth-provider'
import { PageHeader } from '@/components/page-header'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { Badge } from '@/components/ui/badge'
import { CardContent } from '@/components/ui/card'
import { HeroCard } from '@/components/ui/hero-card'
import { ProgressRing } from '@/components/ui/progress-ring'
import { SectionCard } from '@/components/ui/section-card'
import { StatTile } from '@/components/ui/stat-tile'
import { StreakFlame } from '@/components/ui/streak-flame'
import { XpBar } from '@/components/ui/xp-bar'
import { useAchievements } from '@/features/gamification/hooks'
import { cn } from '@/lib/utils'
import { effectiveStreak, heldFreezes, isStreakProtected } from '@/lib/streak'
import { BADGES, levelProgress } from '@/services/gamification-service'

export function AchievementsPage() {
  const { profile } = useAuth()
  const { data: achievements = [] } = useAchievements()

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
  const freezeCount = profile ? (heldFreezes(profile) ?? 0) : 0
  const streak = effectiveStreak(profile)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Achievements"
        description="Level up as you build better study habits"
        actions={
          <StreakFlame days={streak} freezes={freezeCount} protectedToday={isStreakProtected(profile)} />
        }
      />

      {/* Level hero: the ring carries the progress, so the eye lands on the level first. */}
      <HeroCard data-tour="level-hero" tone="xp">
        <CardContent className="space-y-5">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <ProgressRing
              value={progress.percent / 100}
              size={112}
              thickness={8}
              arcClassName="stroke-xp"
              trackClassName="stroke-xp/15"
              className="size-28 shrink-0"
            >
              <span className="font-display text-3xl font-bold tabular-nums">{progress.level}</span>
              <span className="text-muted-foreground text-[11px] tracking-wide uppercase">Level</span>
            </ProgressRing>
            <div className="w-full flex-1 space-y-2 text-center sm:text-left">
              <p className="text-lg font-semibold">
                <AnimatedNumber value={profile?.xp ?? 0} className="text-xp" /> XP earned
              </p>
              <p className="text-muted-foreground text-sm">
                {progress.needed - progress.current} XP to level {progress.level + 1}
              </p>
              <XpBar
                level={progress.level}
                current={progress.current}
                needed={progress.needed}
                compact
                className="mx-auto max-w-md sm:mx-0"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={Star} label="Level" value={progress.level} tone="xp" />
            <StatTile icon={Zap} label="Total XP" value={(profile?.xp ?? 0).toLocaleString()} tone="xp" />
            <StatTile
              icon={Flame}
              label="Day streak"
              value={streak}
              tone="streak"
              hint={freezeCount > 0 ? `${freezeCount} freeze${freezeCount === 1 ? '' : 's'} held` : undefined}
            />
            <StatTile icon={Trophy} label="Badges" value={`${unlockedCount}/${BADGES.length}`} tone="primary" />
          </div>
        </CardContent>
      </HeroCard>

      <SectionCard
        data-tour="badges"
        icon={Award}
        title="Badges"
        description={`${unlockedCount} of ${BADGES.length} unlocked`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {BADGES.map((badge) => {
            const unlocked = unlockedIds.has(badge.id)
            const date = unlockedAt.get(badge.id)
            return (
              <div
                key={badge.id}
                className={cn(
                  'group relative flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-all duration-200',
                  unlocked
                    ? 'border-xp/30 bg-xp/6 shadow-e1 hover:shadow-e2 hover:-translate-y-0.5'
                    : 'border-dashed opacity-55 grayscale',
                )}
              >
                {/* Earned badges sit on a soft disc, so the grid reads as a trophy
                    shelf rather than a list of greyed-out emoji. */}
                <span
                  aria-hidden
                  className={cn(
                    'flex size-12 items-center justify-center rounded-full text-2xl',
                    unlocked ? 'bg-xp/12 ring-xp/20 ring-1' : 'bg-muted',
                  )}
                >
                  {badge.emoji}
                </span>
                <p className="text-sm font-medium">{badge.name}</p>
                <p className="text-muted-foreground text-xs">{badge.description}</p>
                {unlocked ? (
                  <Badge variant="success" className="mt-1">
                    {date ? format(parseISO(date), 'd MMM yyyy') : 'Unlocked'}
                  </Badge>
                ) : badge.xp_reward > 0 ? (
                  <Badge variant="muted" className="mt-1">
                    +{badge.xp_reward} XP
                  </Badge>
                ) : null}
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}
