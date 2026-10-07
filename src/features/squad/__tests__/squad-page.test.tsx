// @vitest-environment jsdom
import axe from 'axe-core'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MySquad, SquadStanding } from '@/services/squad-service'

/**
 * The squad page: a student outside a squad is offered both ways in and told
 * what squad mates would see; a student inside one sees the week's table, in
 * which they are the only row that says "You", and only an owner sees the
 * controls that act on other people.
 */

const state = {
  squad: null as MySquad | null,
  board: [] as SquadStanding[],
  create: vi.fn(),
  join: vi.fn(),
  remove: vi.fn(),
}

const mutation = (fn: ReturnType<typeof vi.fn>) => ({ mutate: fn, isPending: false })

vi.mock('@/features/squad/hooks', () => ({
  SQUAD_REFRESH_MS: 60_000,
  useMySquad: () => ({ data: state.squad, isLoading: false, isError: false }),
  useSquadBoard: () => ({ data: state.board, isLoading: false, isError: false }),
  useCreateSquad: () => mutation(state.create),
  useJoinSquad: () => mutation(state.join),
  useRemoveSquadMember: () => mutation(state.remove),
  useLeaveSquad: () => mutation(vi.fn()),
  useRenameSquad: () => mutation(vi.fn()),
  useNewSquadCode: () => mutation(vi.fn()),
}))

const { SquadPage } = await import('@/features/squad/squad-page')
const { SquadCard } = await import('@/features/squad/squad-card')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

beforeEach(() => {
  state.squad = null
  state.board = []
  state.create.mockReset()
  state.join.mockReset()
  state.remove.mockReset()
})

afterEach(() => {
  React.act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
})

function render(node: React.ReactNode): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  React.act(() => root!.render(<MemoryRouter>{node}</MemoryRouter>))
  return container
}

async function violations(element: HTMLElement) {
  const results = await axe.run(element, { rules: { 'color-contrast': { enabled: false } } })
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help}`)
}

/** Type into an input the way React notices. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  React.act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const input = (element: HTMLElement, label: string, nth = 0) =>
  [...element.querySelectorAll('label')]
    .filter((node) => node.textContent === label)
    .map((node) => element.querySelector<HTMLInputElement>(`#${CSS.escape(node.htmlFor)}`)!)[nth]!

const submit = (element: HTMLElement, text: string) =>
  React.act(() => [...element.querySelectorAll('button')].find((button) => button.textContent?.includes(text))!.click())

const squad = (overrides: Partial<MySquad> = {}): MySquad => ({
  id: 's1',
  name: 'Graph Theory Crew',
  joinCode: 'ABCDEFGH',
  role: 'owner',
  handle: 'night_owl',
  memberCount: 4,
  ...overrides,
})

const standing = (handle: string, weeklyXp: number, overrides: Partial<SquadStanding> = {}): SquadStanding => ({
  handle,
  isMe: false,
  role: 'member',
  weeklyXp,
  streak: 3,
  questsClaimed: [],
  ...overrides,
})

const board = [
  standing('thandi_m', 240, { questsClaimed: ['a', 'b'] }),
  standing('lebo_k', 185),
  standing('night_owl', 100, { isMe: true, role: 'owner' }),
  standing('sipho22', 60, { streak: 0 }),
]

describe('outside a squad', () => {
  it('offers both ways in, and says what a squad would see, with no serious violations', async () => {
    const element = render(<SquadPage />)
    expect(element.textContent).toContain('Start a squad')
    expect(element.textContent).toContain('Join with a code')
    expect(element.textContent).toContain('What your squad sees')
    expect(element.textContent).toContain('never your name or email')
    expect(await violations(element)).toEqual([])
  })

  it('never fills the handle from the student’s name', () => {
    const element = render(<SquadPage />)
    expect(input(element, 'Your handle', 0).value).toBe('')
    expect(input(element, 'Your handle', 1).value).toBe('')
  })

  it('says what is wrong before sending anything', () => {
    const element = render(<SquadPage />)
    type(input(element, 'Squad name'), 'x')
    type(input(element, 'Your handle', 0), 'night_owl')
    submit(element, 'Start squad')
    expect(element.querySelector('[role="alert"]')?.textContent).toBe('A squad name is 2 to 40 characters.')
    expect(state.create).not.toHaveBeenCalled()

    type(input(element, 'Squad name'), 'Graph Theory Crew')
    submit(element, 'Start squad')
    expect(state.create).toHaveBeenCalledWith({ name: 'Graph Theory Crew', handle: 'night_owl' })
  })

  it('spends none of the hour’s tries on a code of the wrong length', () => {
    const element = render(<SquadPage />)
    type(input(element, 'Squad code'), 'ABC')
    type(input(element, 'Your handle', 1), 'night_owl')
    submit(element, 'Join squad')
    expect(state.join).not.toHaveBeenCalled()
    expect(element.textContent).toContain('A code is 8 letters and numbers.')

    type(input(element, 'Squad code'), 'abcd-efgh')
    submit(element, 'Join squad')
    expect(state.join).toHaveBeenCalledWith({ code: 'abcd-efgh', handle: 'night_owl' })
  })
})

describe('in a squad', () => {
  beforeEach(() => {
    state.squad = squad()
    state.board = board
  })

  it('shows the table, the place and the code, with no serious violations', async () => {
    const element = render(<SquadPage />)
    expect(element.textContent).toContain('Graph Theory Crew')
    expect(element.textContent).toContain('3rd')
    expect(element.textContent).toContain('ABCD-EFGH')
    const rows = [...element.querySelectorAll('tbody tr')]
    expect(rows.map((row) => row.querySelector('td')!.textContent)).toEqual(['1', '2', '3', '4'])
    expect(await violations(element)).toEqual([])
  })

  it('marks the student’s own row and no other', () => {
    const element = render(<SquadPage />)
    const mine = [...element.querySelectorAll('tbody tr')].filter((row) => row.getAttribute('aria-current') === 'true')
    expect(mine).toHaveLength(1)
    expect(mine[0]!.textContent).toContain('night_owl')
    expect(mine[0]!.textContent).toContain('You')
    expect([...element.querySelectorAll('tbody tr')].filter((row) => row.textContent?.includes('You'))).toHaveLength(1)
  })

  it('says quest ticks and streaks in words, for a screen reader', () => {
    const element = render(<SquadPage />)
    expect(element.textContent).toContain('2 of 3 quests claimed')
    expect(element.textContent).toContain('No streak')
  })

  it('gives the owner a remove button on every row but their own', () => {
    const element = render(<SquadPage />)
    const removes = [...element.querySelectorAll('button')]
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => label?.startsWith('Remove'))
    expect(removes).toEqual([
      'Remove thandi_m from the squad',
      'Remove lebo_k from the squad',
      'Remove sipho22 from the squad',
    ])
    expect(element.textContent).toContain('New code')
  })

  it('gives a member none of the owner’s controls', () => {
    state.squad = squad({ role: 'member' })
    const element = render(<SquadPage />)
    expect([...element.querySelectorAll('button')].some((button) => button.getAttribute('aria-label')?.startsWith('Remove'))).toBe(false)
    expect(element.textContent).not.toContain('New code')
    expect(element.querySelector('label')?.textContent).not.toBe('Squad name')
    expect(element.textContent).toContain('Leave squad')
  })

  it('says a squad below three is still forming', () => {
    state.squad = squad({ memberCount: 2 })
    state.board = board.slice(2, 4)
    const element = render(<SquadPage />)
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Still forming: 1 more member to go.')
  })
})

describe('the dashboard tile', () => {
  it('shows the top three and the student, when they are further down', async () => {
    state.squad = squad()
    state.board = [standing('a_one', 300), standing('b_two', 200), standing('c_three', 150), ...board.slice(2)]
    const element = render(<SquadCard />)
    const lines = [...element.querySelectorAll('li')].map((line) => line.textContent)
    expect(lines).toEqual(['1a_one300 XP', '2b_two200 XP', '3c_three150 XP', '4night_owl (you)100 XP'])
    expect(element.textContent).toContain("You're 4th of 5 this week")
    expect(await violations(element)).toEqual([])
  })

  it('invites a student who is not in one', () => {
    const element = render(<SquadCard />)
    expect(element.textContent).toContain('Not in one yet')
    expect(element.querySelector('a')!.getAttribute('href')).toBe('/app/squad')
  })
})
