import { format } from 'date-fns'
import { Check, Copy, LogOut, RefreshCw, Settings2, ShieldCheck, Trophy, UserPlus, Users } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { HeroCard } from '@/components/ui/hero-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CardSkeleton, ListSkeleton } from '@/components/ui/page-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import { StatTile } from '@/components/ui/stat-tile'
import { ConfirmDialog } from '@/features/squad/confirm-dialog'
import {
  useLeaveSquad,
  useMySquad,
  useNewSquadCode,
  useRemoveSquadMember,
  useRenameSquad,
  useSquadBoard,
} from '@/features/squad/hooks'
import { JoinSquadForm, StartSquadForm } from '@/features/squad/squad-forms'
import { SquadStandings } from '@/features/squad/squad-standings'
import { questWeek } from '@/lib/quests'
import { formatCode, nameProblem, ordinal, rankStandings, SQUAD_MAX, SQUAD_MIN, SQUAD_NAME_LENGTH } from '@/lib/squads'
import type { MySquad } from '@/services/squad-service'

/** What squad mates can and cannot see. Shown in and out of a squad: it is the first question. */
function PrivacyNote() {
  return (
    <SectionCard data-tour="squad-privacy" icon={ShieldCheck} title="What your squad sees">
      <ul className="text-muted-foreground space-y-2 text-sm">
        <li>
          <span className="text-foreground font-medium">Your handle,</span> never your name or email.
        </li>
        <li>
          <span className="text-foreground font-medium">The XP you earned this week, and your streak.</span>{' '}
          Both are worked out by our server, so nobody's numbers can be typed in.
        </li>
        <li>
          <span className="text-foreground font-medium">How many of this week's quests you've claimed.</span>
        </li>
        <li>
          Nothing else: not your university, modules, assignments, grades, notes or files. Squads pay no XP;
          they show who earned what.
        </li>
      </ul>
    </SectionCard>
  )
}

function InviteCard({ squad }: { squad: MySquad }) {
  const newCode = useNewSquadCode()
  const [copied, setCopied] = React.useState(false)
  const code = formatCode(squad.joinCode)
  const full = squad.memberCount >= SQUAD_MAX

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast(`Couldn't copy it. The code is ${code}.`)
    }
  }

  return (
    <SectionCard
      data-tour="squad-invite"
      icon={UserPlus}
      title="Invite"
      description={
        full ? `The squad is full: ${SQUAD_MAX} of ${SQUAD_MAX}.` : 'Anyone with the code can join while there is room.'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="bg-muted rounded-lg px-3 py-2 font-mono text-lg font-semibold tracking-[0.2em] tabular-nums">
          <span className="sr-only">Squad code: </span>
          {code}
        </p>
        <Button variant="outline" size="sm" onClick={() => void copy()} aria-live="polite">
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {squad.role === 'owner' ? (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" size="sm" disabled={newCode.isPending}>
                <RefreshCw /> New code
              </Button>
            }
            title="Make a new code?"
            description="The current code stops working straight away. Nobody already in the squad is removed."
            confirmLabel="Make a new code"
            onConfirm={() => newCode.mutate()}
          />
        ) : null}
      </div>
    </SectionCard>
  )
}

function SettingsCard({ squad }: { squad: MySquad }) {
  const rename = useRenameSquad()
  const leave = useLeaveSquad()
  const id = React.useId()
  const [name, setName] = React.useState(squad.name)
  const [problem, setProblem] = React.useState<string | null>(null)
  const owner = squad.role === 'owner'
  const last = squad.memberCount === 1

  // A rename from another device, or a refetch, resets the field.
  React.useEffect(() => setName(squad.name), [squad.name])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const found = nameProblem(name)
    setProblem(found)
    if (!found) rename.mutate(name, { onSuccess: () => toast.success('Squad renamed.') })
  }

  return (
    <SectionCard icon={Settings2} title="Squad settings">
      <div className="space-y-4">
        {owner ? (
          <form onSubmit={submit} noValidate className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>Squad name</Label>
            <div className="flex gap-2">
              <Input
                id={`${id}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={SQUAD_NAME_LENGTH.max}
                autoComplete="off"
              />
              <Button type="submit" variant="outline" disabled={rename.isPending || name.trim() === squad.name}>
                Save
              </Button>
            </div>
            {problem ? (
              <p role="alert" className="text-destructive text-sm">
                {problem}
              </p>
            ) : null}
          </form>
        ) : null}
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="text-destructive" disabled={leave.isPending}>
              <LogOut /> Leave squad
            </Button>
          }
          title={`Leave ${squad.name}?`}
          description={
            last
              ? "You're the last one in, so the squad closes."
              : owner
                ? 'The member who has been in longest becomes the owner. You can come back with the code while there is room.'
                : 'You can come back with the code while there is room.'
          }
          confirmLabel="Leave"
          destructive
          onConfirm={() => leave.mutate()}
        />
      </div>
    </SectionCard>
  )
}

function InSquad({ squad }: { squad: MySquad }) {
  const board = useSquadBoard(true)
  const remove = useRemoveSquadMember()
  const standings = board.data ?? []
  const me = rankStandings(standings).find(({ row }) => row.isMe)
  const forming = squad.memberCount < SQUAD_MIN
  const toGo = SQUAD_MIN - squad.memberCount

  return (
    <>
      <HeroCard tone="league">
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
              <Users aria-hidden className="text-league size-3.5" /> Your squad
            </p>
            <h2 className="font-display mt-1 text-2xl leading-tight font-semibold break-words">{squad.name}</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {squad.memberCount} of {SQUAD_MAX} members · you're{' '}
              <span className="text-foreground font-medium">{squad.handle}</span>
              {squad.role === 'owner' ? ', the owner' : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:w-72">
            <StatTile
              label="Your place"
              value={me ? ordinal(me.rank) : '—'}
              hint={standings.length > 0 ? `of ${standings.length}` : undefined}
              tone="league"
            />
            <StatTile label="Your XP this week" value={me ? me.row.weeklyXp.toLocaleString() : '—'} tone="xp" />
          </div>
        </CardContent>
      </HeroCard>

      {forming ? (
        <Card role="status" className="border-league/40 bg-card">
          <CardContent className="text-sm">
            <p className="font-medium">
              Still forming: {toGo} more {toGo === 1 ? 'member' : 'members'} to go.
            </p>
            <p className="text-muted-foreground">
              A squad is {SQUAD_MIN} to {SQUAD_MAX} people. The table already counts; send the code below to the
              friends you study with.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard
          data-tour="squad-standings"
          className="lg:col-span-3"
          icon={Trophy}
          title="This week"
          description="XP earned since Monday, on each member's own clock. Starts again every Monday."
        >
          {board.isLoading ? (
            <ListSkeleton rows={squad.memberCount} />
          ) : board.isError ? (
            <p className="text-muted-foreground text-sm">The table could not be loaded. It will be back shortly.</p>
          ) : (
            <SquadStandings
              standings={standings}
              canRemove={squad.role === 'owner'}
              onRemove={(handle) => remove.mutate(handle)}
            />
          )}
        </SectionCard>
        <div className="space-y-4 lg:col-span-2">
          <InviteCard squad={squad} />
          <SettingsCard squad={squad} />
        </div>
      </div>
    </>
  )
}

export function SquadPage() {
  const squad = useMySquad()
  const week = questWeek()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Week of ${format(week.start, 'd MMMM')}`}
        title="Squad"
        description={`${SQUAD_MIN} to ${SQUAD_MAX} of you, the same three quests, and one table for the week.`}
      />

      {squad.isLoading ? (
        <CardSkeleton lines={4} />
      ) : squad.isError ? (
        <p className="text-muted-foreground text-sm">Your squad could not be loaded. It will be back shortly.</p>
      ) : squad.data ? (
        <InSquad squad={squad.data} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <StartSquadForm />
          <JoinSquadForm />
        </div>
      )}

      <PrivacyNote />
    </div>
  )
}
