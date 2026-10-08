// @vitest-environment jsdom
import axe from 'axe-core'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuestCard, QuestRow } from '@/features/quests/quest-card'
import { questBonus, questStatus } from '@/features/quests/quest-status'
import type { QuestBoardEntry } from '@/services/quest-service'

/**
 * A quest says where it stands in words as well as in its ring, offers a claim
 * only when there is something to claim, and never asks a student for a quiz
 * they have no way to take.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

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

const quest = (overrides: Partial<QuestBoardEntry> = {}): QuestBoardEntry => ({
  id: 'study-5-days',
  slot: 0,
  title: 'Study on 5 days',
  description: 'Any study counts.',
  target: 5,
  reward: 75,
  progress: 3,
  claimed: false,
  weekStart: '2026-10-05',
  ...overrides,
})

const button = (element: HTMLElement) => element.querySelector('button')

describe('questStatus', () => {
  it('says how far, what is ready and what is done', () => {
    expect(questStatus(quest())).toBe('3 of 5')
    expect(questStatus(quest({ progress: 7 }))).toBe('Done — ready to claim')
    expect(questStatus(quest({ progress: 7, claimed: true }))).toBe('Claimed')
  })

  it('says an XP goal is XP earned, so it cannot be read as the payout', () => {
    expect(questStatus(quest({ id: 'xp-150', target: 150, progress: 45 }))).toBe('45 of 150 XP earned')
  })
})

describe('questBonus', () => {
  it('names the reward as a bonus', () => {
    expect(questBonus(quest())).toBe('+75 XP bonus')
  })
})

/**
 * "Earn 150 XP" beside "+50 XP" read as a promise of 150, and the claim paid
 * 50. Wherever a quest shows an amount it is either progress towards the goal
 * or the bonus, and says which.
 */
describe('an XP quest', () => {
  const xpQuest = (overrides: Partial<QuestBoardEntry> = {}) =>
    quest({ id: 'xp-150', slot: 2, title: 'Reach 150 XP this week', target: 150, reward: 50, progress: 45, ...overrides })

  it('shows the goal as XP still to earn and the reward as a bonus', () => {
    const element = render(<QuestCard quest={xpQuest()} onClaim={() => {}} />)
    expect(element.textContent).toContain('105 XP to go')
    expect(element.textContent).toContain('+50 XP bonus')
    expect(element.textContent).not.toContain('+150')
  })

  it('offers exactly the bonus the claim pays', () => {
    const element = render(<QuestCard quest={xpQuest({ progress: 162 })} onClaim={() => {}} />)
    expect(button(element)!.textContent).toBe('Claim your +50 XP bonus')
  })

  it('says the same on the dashboard row', () => {
    const element = render(
      <ul>
        <QuestRow quest={xpQuest()} onClaim={() => {}} />
      </ul>,
    )
    expect(element.textContent).toContain('45 of 150 XP earned')
    expect(element.textContent).toContain('+50 XP bonus')
  })
})

describe('QuestCard', () => {
  it('has no serious violations in any state', async () => {
    const element = render(
      <main>
        <h1>Quests</h1>
        <QuestCard quest={quest()} onClaim={() => {}} />
        <QuestCard quest={quest({ id: 'a', progress: 5 })} onClaim={() => {}} />
        <QuestCard quest={quest({ id: 'b', progress: 5, claimed: true })} onClaim={() => {}} />
        <QuestCard quest={quest({ id: 'c', slot: 1, progress: 0 })} onClaim={() => {}} locked />
      </main>,
    )
    expect(await violations(element)).toEqual([])
  })

  it('exposes progress as a named progressbar', () => {
    const element = render(<QuestCard quest={quest()} onClaim={() => {}} />)
    const bar = element.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-label')).toBe('Study on 5 days: 3 of 5')
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(bar.getAttribute('aria-valuemax')).toBe('5')
  })

  it('offers no claim before the quest is done', () => {
    const element = render(<QuestCard quest={quest()} onClaim={() => {}} />)
    expect(button(element)).toBeNull()
    expect(element.textContent).toContain('2 to go')
    expect(element.textContent).toContain('+75 XP bonus')
  })

  it('claims a finished quest', () => {
    const onClaim = vi.fn()
    const done = quest({ progress: 5 })
    const element = render(<QuestCard quest={done} onClaim={onClaim} />)
    expect(button(element)!.textContent).toBe('Claim your +75 XP bonus')
    React.act(() => button(element)!.click())
    expect(onClaim).toHaveBeenCalledWith(done)
  })

  it('holds the button while the claim is in flight', () => {
    const element = render(<QuestCard quest={quest({ progress: 5 })} onClaim={() => {}} claiming />)
    expect(button(element)!.disabled).toBe(true)
  })

  it('shows a claimed quest as done, with nothing to press', () => {
    const element = render(<QuestCard quest={quest({ progress: 5, claimed: true })} onClaim={() => {}} />)
    expect(button(element)).toBeNull()
    expect(element.textContent).toContain('Claimed — 75 XP bonus added')
  })

  it('points a student with no quizzes to the plans instead of an impossible task', () => {
    const element = render(<QuestCard quest={quest({ slot: 1, progress: 0 })} onClaim={() => {}} locked />)
    expect(element.textContent).toContain('Quizzes come with Pro')
    expect(element.querySelector('a')!.getAttribute('href')).toBe('/app/billing')
    expect(button(element)).toBeNull()
  })
})

describe('QuestRow', () => {
  it('has no serious violations inside a list', async () => {
    const element = render(
      <main>
        <h1>Dashboard</h1>
        <ul>
          <QuestRow quest={quest()} onClaim={() => {}} />
          <QuestRow quest={quest({ id: 'a', progress: 5 })} onClaim={() => {}} />
          <QuestRow quest={quest({ id: 'b', progress: 5, claimed: true })} onClaim={() => {}} />
        </ul>
      </main>,
    )
    expect(await violations(element)).toEqual([])
  })

  it('names its claim button with the quest and the bonus', () => {
    const element = render(
      <ul>
        <QuestRow quest={quest({ progress: 5 })} onClaim={() => {}} />
      </ul>,
    )
    expect(button(element)!.getAttribute('aria-label')).toBe('Claim the 75 XP bonus for Study on 5 days')
    expect(button(element)!.textContent).toBe('Claim +75 XP')
  })

  it('says what a locked quiz quest needs', () => {
    const element = render(
      <ul>
        <QuestRow quest={quest({ slot: 1, progress: 0 })} onClaim={() => {}} locked />
      </ul>,
    )
    expect(element.textContent).toContain('Needs a quiz — they come with Pro')
  })
})
