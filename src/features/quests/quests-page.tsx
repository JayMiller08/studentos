import { format, parseISO } from 'date-fns'
import { History, ScrollText } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { CardSkeleton, ListSkeleton } from '@/components/ui/page-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import { useQuestActions, useQuestHistory } from '@/features/quests/hooks'
import { QuestCard } from '@/features/quests/quest-card'
import { daysLeft, QUEST_CATALOGUE, questWeek } from '@/lib/quests'

/** "2026-10-05:study-5-days" -> the week and the quest it paid for. */
function readClaim(sourceId: string): { week: string; title: string } {
  const [week = '', questId = ''] = sourceId.split(':')
  const quest = QUEST_CATALOGUE.find((entry) => entry.id === questId)
  return { week, title: quest?.title ?? questId }
}

export function QuestsPage() {
  const { board, onClaim, claimingId, celebrating, isLocked } = useQuestActions()
  const { data: history = [], isLoading: historyLoading } = useQuestHistory()
  const week = questWeek()
  const left = daysLeft(week)
  const quests = board.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Week of ${format(week.start, 'd MMMM')} · ${left === 1 ? 'last day' : `${left} days left`}`}
        title="Quests"
        description="Three quests a week, the same three for everyone. Finish one, then claim its bonus XP."
      />

      <section aria-label="This week's quests" data-tour="quest-board" className="grid gap-4 md:grid-cols-3">
        {board.isLoading ? (
          [0, 1, 2].map((slot) => <CardSkeleton key={slot} lines={4} />)
        ) : board.isError ? (
          <p className="text-muted-foreground text-sm md:col-span-3">
            Quests could not be loaded. They will be back shortly.
          </p>
        ) : (
          quests.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              onClaim={onClaim}
              claiming={claimingId === quest.id}
              celebrating={celebrating === quest.id}
              locked={isLocked(quest)}
            />
          ))
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard data-tour="quest-rules" className="lg:col-span-2" icon={ScrollText} title="How quests work">
          <ul className="text-muted-foreground space-y-3 text-sm">
            <li>
              <span className="text-foreground font-medium">Everyone gets the same three.</span> One for
              showing up, one for proving what you know, one for keeping moving. New ones arrive every
              Monday.
            </li>
            <li>
              <span className="text-foreground font-medium">Progress counts what we can check.</span>{' '}
              Quizzes are marked on our server, and everything else is the activity you have already
              been rewarded for — nothing here can be typed in.
            </li>
            <li>
              <span className="text-foreground font-medium">Claim the bonus.</span> A finished quest waits
              for you until Sunday night, and pays its bonus once — on top of the XP you already earned doing
              it. Bonuses never count towards an XP quest.
            </li>
          </ul>
        </SectionCard>

        <SectionCard
          data-tour="quest-history"
          className="lg:col-span-3"
          icon={History}
          title="Your quest history"
          description={
            historyLoading
              ? undefined
              : history.length === 0
                ? 'Nothing claimed yet'
                : `${history.length} claimed · ${history.reduce((sum, row) => sum + row.amount, 0).toLocaleString()} bonus XP`
          }
        >
          {historyLoading ? (
            <ListSkeleton rows={3} />
          ) : history.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Your first claim will show here. This week's board is the place to start.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {history.slice(0, 12).map((row) => {
                const claim = readClaim(row.source_id)
                return (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{claim.title}</span>
                      <span className="text-muted-foreground text-xs">
                        Week of {claim.week ? format(parseISO(claim.week), 'd MMM yyyy') : '—'}
                      </span>
                    </span>
                    <span className="text-xp shrink-0 font-semibold tabular-nums">+{row.amount} XP bonus</span>
                  </li>
                )
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
