import { ArrowRight, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/page-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import { useMySquad, useSquadBoard } from '@/features/squad/hooks'
import { ordinal, rankStandings, SQUAD_MAX, SQUAD_MIN } from '@/lib/squads'
import { cn } from '@/lib/utils'

export interface SquadCardProps {
  className?: string
}

/** The squad on the dashboard: where the student stands this week, or how to start one. */
export function SquadCard({ className }: SquadCardProps) {
  const squad = useMySquad()
  const board = useSquadBoard(Boolean(squad.data))
  const ranked = rankStandings(board.data ?? [])
  const me = ranked.find(({ row }) => row.isMe)
  // The top three, plus the student's own line when they are further down.
  const shown = ranked.filter((entry, index) => index < 3 || entry.row.isMe)

  const description = squad.isLoading
    ? undefined
    : !squad.data
      ? 'Not in one yet'
      : squad.data.memberCount < SQUAD_MIN
        ? `Forming: ${squad.data.memberCount} of ${SQUAD_MIN} to start`
        : me
          ? `You're ${ordinal(me.rank)} of ${ranked.length} this week`
          : undefined

  return (
    <SectionCard
      data-tour="squad"
      className={className}
      icon={Users}
      title={squad.data ? squad.data.name : 'Squad'}
      description={description}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/squad">
            {squad.data ? 'Open' : 'Start one'} <ArrowRight />
          </Link>
        </Button>
      }
    >
      {squad.isLoading || (squad.data && board.isLoading) ? (
        <ListSkeleton rows={3} />
      ) : !squad.data ? (
        <p className="text-muted-foreground text-sm">
          Study with {SQUAD_MIN - 1} to {SQUAD_MAX - 1} friends: the same three quests each week, and a table of who
          earned what. They see your handle, never your name.
        </p>
      ) : (
        <ol className="space-y-1">
          {shown.map(({ row, rank }) => (
            <li
              key={row.handle}
              className={cn('flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm', row.isMe && 'bg-league/8')}
            >
              <span className="text-muted-foreground w-5 shrink-0 text-right font-semibold tabular-nums">{rank}</span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {row.handle}
                {row.isMe ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
              </span>
              <span className="text-xp shrink-0 font-semibold tabular-nums">{row.weeklyXp.toLocaleString()} XP</span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  )
}
