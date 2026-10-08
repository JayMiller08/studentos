import { Crown, Flame, UserMinus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/features/squad/confirm-dialog'
import { rankStandings } from '@/lib/squads'
import { cn } from '@/lib/utils'
import type { SquadStanding } from '@/services/squad-service'

/** This week's three quests, as dots: how many of them a member has claimed. */
export function QuestDots({ claimed, total = 3 }: { claimed: number; total?: number }) {
  const shown = Math.min(claimed, total)
  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden
          className={cn('size-2 rounded-full', index < shown ? 'bg-quest' : 'bg-muted-foreground/25')}
        />
      ))}
      <span className="sr-only">
        {shown} of {total} quests claimed
      </span>
    </span>
  )
}

export interface SquadStandingsProps {
  standings: SquadStanding[]
  /** The owner sees a remove button on everyone else's row. */
  canRemove?: boolean
  onRemove?: (handle: string) => void
}

/**
 * The week's table: place, handle, XP since Monday, streak, quests. The row
 * that is the student is marked, and is the only one that says "You": every
 * other member is a handle and nothing more.
 */
export function SquadStandings({ standings, canRemove = false, onRemove }: SquadStandingsProps) {
  const ranked = rankStandings(standings)
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-14">Place</TableHead>
          <TableHead>Member</TableHead>
          <TableHead className="text-right">XP this week</TableHead>
          <TableHead className="text-right">Streak</TableHead>
          <TableHead>Quests</TableHead>
          {canRemove ? (
            <TableHead className="w-12">
              <span className="sr-only">Remove</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {ranked.map(({ row, rank }) => (
          <TableRow
            key={row.handle}
            aria-current={row.isMe ? 'true' : undefined}
            className={cn(row.isMe && 'bg-league/8 hover:bg-league/10')}
          >
            <TableCell className="font-semibold tabular-nums">{rank}</TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1.5">
                <span className="font-medium">{row.handle}</span>
                {row.role === 'owner' ? (
                  <Crown role="img" aria-label="Owner" className="text-league size-3.5 shrink-0" />
                ) : null}
                {row.isMe ? (
                  <Badge variant="muted" className="ml-0.5">
                    You
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell className="text-xp text-right font-semibold tabular-nums">
              {row.weeklyXp.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.streak > 0 ? (
                <span className="inline-flex items-center justify-end gap-1">
                  <Flame aria-hidden className="text-streak size-3.5" />
                  {row.streak}
                  <span className="sr-only"> day{row.streak === 1 ? '' : 's'}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  <span aria-hidden>—</span>
                  <span className="sr-only">No streak</span>
                </span>
              )}
            </TableCell>
            <TableCell>
              <QuestDots claimed={row.questsClaimed.length} />
            </TableCell>
            {canRemove ? (
              <TableCell className="text-right">
                {row.isMe ? null : (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${row.handle} from the squad`}>
                        <UserMinus />
                      </Button>
                    }
                    title={`Remove ${row.handle}?`}
                    description="They leave the squad straight away. The code still lets them back in, so make a new one if they should stay out."
                    confirmLabel="Remove"
                    destructive
                    onConfirm={() => onRemove?.(row.handle)}
                  />
                )}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
