import { ArrowRight, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/page-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import { useQuestActions } from '@/features/quests/hooks'
import { QuestRow } from '@/features/quests/quest-card'
import { daysLeft, questWeek } from '@/lib/quests'

export interface QuestBoardCardProps {
  className?: string
}

/**
 * This week's three quests, on the dashboard.
 *
 * A tile rather than a fifth cell of the progress strip: the strip says where
 * a student stands, this says what to do next — and a finished quest can be
 * claimed right here, without leaving the page that told them about it.
 */
export function QuestBoardCard({ className }: QuestBoardCardProps) {
  const { board, onClaim, claimingId, celebrating, isLocked } = useQuestActions()
  const quests = board.data ?? []
  const claimed = quests.filter((quest) => quest.claimed).length
  const left = daysLeft(questWeek())

  return (
    <SectionCard
      data-tour="quests"
      className={className}
      icon={Target}
      title="This week's quests"
      description={
        board.isLoading
          ? undefined
          : claimed === quests.length && quests.length > 0
            ? 'All three done — new ones on Monday'
            : `${claimed} of ${quests.length} claimed · ${left === 1 ? 'last day' : `${left} days left`}`
      }
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/app/quests">
            All quests <ArrowRight />
          </Link>
        </Button>
      }
    >
      {board.isLoading ? (
        <ListSkeleton rows={3} />
      ) : board.isError ? (
        <p className="text-muted-foreground text-sm">Quests could not be loaded. They will be back shortly.</p>
      ) : (
        <ul className="space-y-1">
          {quests.map((quest) => (
            <QuestRow
              key={quest.id}
              quest={quest}
              onClaim={onClaim}
              claiming={claimingId === quest.id}
              celebrating={celebrating === quest.id}
              locked={isLocked(quest)}
            />
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
