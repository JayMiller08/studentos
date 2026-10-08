import {
  BrainCircuit,
  Flame,
  type LucideIcon,
  Snowflake,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import type * as React from 'react'
import { Link } from 'react-router-dom'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { Skeleton } from '@/components/ui/skeleton'
import { XpBar } from '@/components/ui/xp-bar'
import type { BadgeProgress, QuizStanding } from '@/features/dashboard/progress'
import { cn } from '@/lib/utils'
import { levelProgress } from '@/services/gamification-service'
import { gradeLetter } from '@/services/quiz-service'

const TILE = {
  xp: 'bg-xp/12 text-xp',
  primary: 'bg-primary/12 text-primary',
  streak: 'bg-streak/12 text-streak',
  league: 'bg-league/12 text-league',
} as const

/**
 * Grade chips are tinted, never coloured text: green or amber on a white card
 * sits near 3:1, and a grade is small text that has to be read. The letter
 * stays in the foreground colour; the tint alone carries the mood.
 */
function gradeTint(percent: number): string {
  if (percent >= 70) return 'bg-success/15 ring-success/30'
  if (percent >= 50) return 'bg-warning/15 ring-warning/35'
  return 'bg-destructive/12 ring-destructive/30'
}

interface CellProps {
  to: string
  label: string
  icon: LucideIcon
  tone: keyof typeof TILE
  /** The whole cell, said once: what a screen reader announces for the link. */
  summary: string
  children: React.ReactNode
}

/**
 * One stat, and the way into it.
 *
 * Each cell is a single link — the level to achievements, the average to the
 * quiz library — because a number a student wants to know more about is the
 * number they will tap. The summary is the link's accessible name, so a
 * screen reader hears one sentence instead of four fragments.
 */
function Cell({ to, label, icon: Icon, tone, summary, children }: CellProps) {
  return (
    <Link
      to={to}
      aria-label={summary}
      className="bg-card hover:bg-surface-2 focus-visible:ring-ring/60 flex min-w-0 flex-col gap-2 p-4 transition-colors duration-150 focus-visible:z-10 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset sm:p-5"
    >
      <span className="text-muted-foreground flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
        <Icon aria-hidden className={cn('size-7 shrink-0 rounded-lg p-1.5', TILE[tone])} />
        {label}
      </span>
      {children}
    </Link>
  )
}

function Value({ children, unit }: { children: React.ReactNode; unit?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="font-display text-3xl leading-none font-semibold tracking-tight tabular-nums">
        {children}
      </span>
      {unit ? <span className="text-muted-foreground truncate text-xs">{unit}</span> : null}
    </span>
  )
}

function Detail({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 truncate text-xs tabular-nums">
      {children}
    </span>
  )
}

export interface ProgressHudProps {
  xp: number
  streak: { days: number; best: number; freezes: number; protectedToday: boolean }
  /** Null while attempts are loading — never a zero that is not true yet. */
  quiz: QuizStanding | null
  badges: BadgeProgress | null
}

/**
 * The game layer, first thing on the dashboard.
 *
 * One surface split by hairlines rather than four cards: these are four
 * facets of one thing — where the student stands — and four boxes of equal
 * weight would compete with the priority card below for "look here first".
 * The hairlines are the grid's gap showing the border colour through, so they
 * stay one pixel at every breakpoint without per-cell border rules.
 */
export function ProgressHud({ xp, streak, quiz, badges }: ProgressHudProps) {
  const level = levelProgress(xp)
  const toNext = Math.max(0, level.needed - level.current)

  return (
    <section aria-labelledby="progress-heading" data-tour="progress">
      <h2 id="progress-heading" className="sr-only">
        Your progress
      </h2>
      <div className="bg-border shadow-e1 grid grid-cols-2 gap-px overflow-hidden rounded-xl border lg:grid-cols-4">
        <Cell
          to="/app/achievements"
          label="Level"
          icon={Sparkles}
          tone="xp"
          summary={`Level ${level.level}, ${toNext.toLocaleString()} XP to level ${level.level + 1}, ${xp.toLocaleString()} XP in total. View achievements`}
        >
          <Value unit={<><AnimatedNumber value={xp} /> XP</>}>{level.level}</Value>
          <XpBar compact level={level.level} current={level.current} needed={level.needed} />
          <Detail>{toNext.toLocaleString()} XP to level {level.level + 1}</Detail>
        </Cell>

        <Cell
          to="/app/quiz"
          label="Quiz average"
          icon={BrainCircuit}
          tone="primary"
          summary={
            quiz === null
              ? 'Quiz average, loading. Open quizzes'
              : quiz.average === null
                ? 'No quiz scores yet. Take a quiz to get scored'
                : `Quiz average ${quiz.average} percent, grade ${gradeLetter(quiz.average)}, best ${quiz.best} percent over ${quiz.attempts} attempts. Open quizzes`
          }
        >
          {quiz === null ? (
            <>
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-28" />
            </>
          ) : quiz.average === null ? (
            <>
              <Value>
                <span className="text-muted-foreground">&mdash;</span>
              </Value>
              <Detail>Take a quiz to get scored</Detail>
            </>
          ) : (
            <>
              <span className="flex items-center gap-2">
                <Value>{quiz.average}%</Value>
                <span
                  className={cn(
                    'text-foreground inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold ring-1',
                    gradeTint(quiz.average),
                  )}
                >
                  {gradeLetter(quiz.average)}
                </span>
              </span>
              <Detail>
                {quiz.trend !== null && quiz.trend !== 0 ? (
                  <>
                    {quiz.trend > 0 ? (
                      <TrendingUp aria-hidden className="text-success size-3.5 shrink-0" />
                    ) : (
                      <TrendingDown aria-hidden className="text-destructive size-3.5 shrink-0" />
                    )}
                    {quiz.trend > 0 ? '+' : ''}
                    {quiz.trend} pts on your last five
                  </>
                ) : (
                  <>
                    Best {quiz.best}% &middot; {quiz.attempts} {quiz.attempts === 1 ? 'attempt' : 'attempts'}
                  </>
                )}
              </Detail>
            </>
          )}
        </Cell>

        <Cell
          to="/app/achievements"
          label="Streak"
          icon={Flame}
          tone="streak"
          summary={`${streak.days}-day streak, best ${streak.best} days, ${streak.freezes} ${streak.freezes === 1 ? 'freeze' : 'freezes'} held${streak.protectedToday ? ', a freeze is covering yesterday' : ''}. View achievements`}
        >
          <Value unit={streak.days === 1 ? 'day' : 'days'}>{streak.days}</Value>
          <Detail>
            {streak.protectedToday ? (
              <>
                <Snowflake aria-hidden className="text-league size-3.5 shrink-0" />
                A freeze is holding it &mdash; study today
              </>
            ) : streak.days === 0 ? (
              'Study today to start one'
            ) : (
              <>
                Best {streak.best}
                {streak.freezes > 0 ? (
                  <>
                    <span aria-hidden>&middot;</span>
                    <Snowflake aria-hidden className="text-league size-3.5 shrink-0" />
                    {streak.freezes}
                  </>
                ) : null}
              </>
            )}
          </Detail>
        </Cell>

        <Cell
          to="/app/achievements"
          label="Badges"
          icon={Trophy}
          tone="league"
          summary={
            badges === null
              ? 'Badges, loading. View achievements'
              : `${badges.unlocked} of ${badges.total} badges${badges.latest[0] ? `, latest ${badges.latest[0].name}` : ''}. View achievements`
          }
        >
          {badges === null ? (
            <>
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-24" />
            </>
          ) : (
            <>
              <span className="flex items-center gap-2">
                <Value unit={`of ${badges.total}`}>{badges.unlocked}</Value>
                {badges.latest.length > 0 ? (
                  <span aria-hidden className="flex -space-x-1 text-base leading-none">
                    {badges.latest.map((badge) => (
                      <span key={badge.id}>{badge.emoji}</span>
                    ))}
                  </span>
                ) : null}
              </span>
              <Detail>
                {badges.latest[0] ? `Latest: ${badges.latest[0].name}` : 'Your first is one assignment away'}
              </Detail>
            </>
          )}
        </Cell>
      </div>
    </section>
  )
}
