import { BrainCircuit, CalendarCheck, Check, Lock, type LucideIcon, Rocket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProgressRing } from '@/components/ui/progress-ring'
import { RewardBurst } from '@/components/ui/reward-burst'
import { questBonus, questStatus, questUnit } from '@/features/quests/quest-status'
import { QUEST_SLOTS, type QuestSlot } from '@/lib/quests'
import { cn } from '@/lib/utils'
import type { QuestBoardEntry } from '@/services/quest-service'

const SLOT_ICONS: Record<QuestSlot, LucideIcon> = {
  0: CalendarCheck,
  1: BrainCircuit,
  2: Rocket,
}

export interface QuestItemProps {
  quest: QuestBoardEntry
  onClaim: (quest: QuestBoardEntry) => void
  /** This quest's claim is in flight. */
  claiming?: boolean
  /** Just claimed in this session: play the burst once. */
  celebrating?: boolean
  /**
   * A quiz quest for a student with no quizzes and no way to make one. They
   * are shown how to get one rather than an impossible "0 of 3".
   */
  locked?: boolean
}

const isDone = (quest: QuestBoardEntry) => quest.progress >= quest.target

/** A quest as one row of the dashboard tile. */
export function QuestRow({ quest, onClaim, claiming, celebrating, locked }: QuestItemProps) {
  const Icon = SLOT_ICONS[quest.slot]
  const done = isDone(quest)
  const claimable = done && !quest.claimed && !locked
  return (
    <li className="relative flex items-center gap-3 rounded-lg p-2">
      <ProgressRing
        aria-hidden
        value={quest.claimed ? 1 : quest.progress / quest.target}
        size={40}
        thickness={4}
        className="size-10 shrink-0"
        arcClassName="stroke-quest"
      >
        {quest.claimed ? (
          <Check className="text-quest size-4" strokeWidth={2.5} />
        ) : (
          <Icon className={cn('size-4', done ? 'text-quest' : 'text-muted-foreground')} />
        )}
      </ProgressRing>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{quest.title}</span>
        {/* The bonus sits under the title, not in a column beside it: named
            as a bonus it is too wide for that, and a two-column tile left the
            title room for "Study on 5 d…". It wraps below the status rather
            than cut it short ("145 of 150 XP earned" and "+50 XP bonus" only
            just miss sharing a line there). */}
        <span className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
          <span className="text-muted-foreground">
            {locked ? 'Needs a quiz — they come with Pro' : questStatus(quest)}
          </span>
          {claimable ? null : (
            <span
              className={cn(
                'shrink-0 font-semibold whitespace-nowrap tabular-nums',
                // Muted once claimed, not struck through: a line through a reward
                // reads as forfeited, and "Claimed" beside it already says paid.
                quest.claimed ? 'text-muted-foreground' : 'text-xp',
              )}
            >
              {questBonus(quest)}
            </span>
          )}
        </span>
      </span>
      {claimable ? (
        <Button
          size="sm"
          onClick={() => onClaim(quest)}
          disabled={claiming}
          aria-label={`Claim the ${quest.reward} XP bonus for ${quest.title}`}
        >
          Claim +{quest.reward} XP
        </Button>
      ) : null}
      <RewardBurst active={Boolean(celebrating)} tone="quest" />
    </li>
  )
}

/** A quest as a card of its own, on the quests page. */
export function QuestCard({ quest, onClaim, claiming, celebrating, locked }: QuestItemProps) {
  const Icon = SLOT_ICONS[quest.slot]
  const done = isDone(quest)
  const shown = Math.min(quest.progress, quest.target)

  return (
    <Card
      data-state={quest.claimed ? 'claimed' : done ? 'done' : 'open'}
      className={cn(
        // A container, so the card lays itself out by its own width: three
        // abreast beside the sidebar is narrow, the same three on a wide
        // screen are not, and a viewport breakpoint cannot tell the two apart.
        '@container relative overflow-visible transition-shadow',
        done && !quest.claimed && !locked && 'border-quest/40 shadow-[0_0_0_1px_color-mix(in_oklch,var(--quest)_25%,transparent)]',
      )}
    >
      <CardContent className="flex h-full flex-col gap-5">
        {/* The slot alone: the reward sits with the action at the foot,
            where the claim button names it too. */}
        <p className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
          <Icon aria-hidden className="text-quest size-3.5 shrink-0" />
          {QUEST_SLOTS[quest.slot].name}
        </p>

        <div className="flex flex-col items-start gap-3 @[18rem]:flex-row @[18rem]:items-center @[18rem]:gap-4">
          <ProgressRing
            role="progressbar"
            aria-label={`${quest.title}: ${questStatus(quest)}`}
            aria-valuemin={0}
            aria-valuemax={quest.target}
            aria-valuenow={shown}
            value={quest.claimed ? 1 : quest.progress / quest.target}
            size={72}
            thickness={6}
            className="size-[4.5rem] shrink-0"
            arcClassName="stroke-quest"
          >
            {quest.claimed ? (
              <Check aria-hidden className="text-quest size-6" strokeWidth={2.5} />
            ) : (
              // Two lines, so a three-digit target ("150 of 150") still fits
              // inside the ring instead of running into it.
              <span className="flex flex-col items-center leading-none tabular-nums">
                <span className="text-base font-semibold">{shown}</span>
                <span className="text-muted-foreground mt-0.5 text-[10px]">of {quest.target}</span>
              </span>
            )}
          </ProgressRing>
          <div className="min-w-0">
            <h3 className="leading-snug font-semibold">{quest.title}</h3>
            <p className="text-muted-foreground mt-1 text-sm">{quest.description}</p>
          </div>
        </div>

        <div className="mt-auto">
          {locked ? (
            <div className="bg-muted/60 flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Lock aria-hidden className="size-3.5" /> Quizzes come with Pro
              </span>
              <Link to="/app/billing" className="text-primary font-medium underline-offset-4 hover:underline">
                See plans
              </Link>
            </div>
          ) : quest.claimed ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Check aria-hidden className="text-quest size-4" /> Claimed — {quest.reward} XP bonus added
            </p>
          ) : done ? (
            <Button className="w-full" onClick={() => onClaim(quest)} disabled={claiming}>
              Claim your {questBonus(quest)}
            </Button>
          ) : (
            <p className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {quest.target - shown}
                {questUnit(quest)} to go
              </span>
              <span className="text-xp shrink-0 font-semibold whitespace-nowrap tabular-nums">{questBonus(quest)}</span>
            </p>
          )}
        </div>
      </CardContent>
      <RewardBurst active={Boolean(celebrating)} tone="quest" />
    </Card>
  )
}
