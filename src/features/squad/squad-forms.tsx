import { Loader2, LogIn, Users } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SectionCard } from '@/components/ui/section-card'
import { useCreateSquad, useJoinSquad } from '@/features/squad/hooks'
import {
  handleProblem,
  nameProblem,
  normalizeCode,
  SQUAD_CODE_LENGTH,
  SQUAD_MAX,
  SQUAD_MIN,
  SQUAD_NAME_LENGTH,
} from '@/lib/squads'

/**
 * The handle field both forms share. Never prefilled from the student's name:
 * the point of a handle is that squad mates see it instead of one.
 */
function HandleField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Your handle</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={20}
        autoComplete="off"
        spellCheck={false}
        placeholder="e.g. night_owl"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        What your squad sees instead of your name: 3 to 20 letters, numbers or underscores.
      </p>
    </div>
  )
}

function Problem({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="text-destructive text-sm">
      {text}
    </p>
  ) : null
}

export function StartSquadForm() {
  const create = useCreateSquad()
  const id = React.useId()
  const [name, setName] = React.useState('')
  const [handle, setHandle] = React.useState('')
  const [problem, setProblem] = React.useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const found = nameProblem(name) ?? handleProblem(handle)
    setProblem(found)
    if (!found) create.mutate({ name, handle })
  }

  return (
    <SectionCard
      data-tour="squad-start"
      icon={Users}
      title="Start a squad"
      description={`Name it, then send the code to the ${SQUAD_MIN - 1} to ${SQUAD_MAX - 1} friends you study with.`}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-name`}>Squad name</Label>
          <Input
            id={`${id}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={SQUAD_NAME_LENGTH.max}
            autoComplete="off"
            placeholder="e.g. Graph Theory Crew"
          />
        </div>
        <HandleField id={`${id}-handle`} value={handle} onChange={setHandle} />
        <Problem text={problem} />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <Users />}
          Start squad
        </Button>
      </form>
    </SectionCard>
  )
}

export function JoinSquadForm() {
  const join = useJoinSquad()
  const id = React.useId()
  const [code, setCode] = React.useState('')
  const [handle, setHandle] = React.useState('')
  const [problem, setProblem] = React.useState<string | null>(null)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    // Caught here so a typo does not spend one of the hour's ten tries.
    const found =
      normalizeCode(code).length === SQUAD_CODE_LENGTH
        ? handleProblem(handle)
        : `A code is ${SQUAD_CODE_LENGTH} letters and numbers.`
    setProblem(found)
    if (!found) join.mutate({ code, handle })
  }

  return (
    <SectionCard icon={LogIn} title="Join with a code" description="Ask someone in the squad for its code.">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-code`}>Squad code</Label>
          <Input
            id={`${id}-code`}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCD-EFGH"
            className="font-mono tracking-widest uppercase"
          />
        </div>
        <HandleField id={`${id}-handle`} value={handle} onChange={setHandle} />
        <Problem text={problem} />
        <Button type="submit" disabled={join.isPending}>
          {join.isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
          Join squad
        </Button>
      </form>
    </SectionCard>
  )
}
