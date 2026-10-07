// @vitest-environment jsdom
import axe from 'axe-core'
import { Flame, Trophy } from 'lucide-react'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { LevelChip } from '@/components/ui/level-chip'
import { ProgressRing } from '@/components/ui/progress-ring'
import { SectionCard } from '@/components/ui/section-card'
import { StatTile } from '@/components/ui/stat-tile'
import { StreakFlame } from '@/components/ui/streak-flame'
import { Surface } from '@/components/ui/surface'
import { SplitAccordion } from '@/components/ui/split-accordion'
import { ContinuousTabs } from '@/components/watermelon/continuous-tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { XpBar } from '@/components/ui/xp-bar'

// Lets `act` flush effects without React warning that this isn't a test env.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// `react-use-measure`, which the Watermelon accordion uses to size its open
// panel, constructs one of these on mount. jsdom has no implementation.
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= StubResizeObserver

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
  React.act(() => root!.render(React.createElement(MemoryRouter, null, node)))
  return container
}

/** Serious and critical only: jsdom cannot judge colour contrast, and does not try. */
async function violations(element: HTMLElement) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false } },
  })
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help}`)
}

describe('the gamification primitives are accessible', () => {
  it('renders a level, XP and streak cluster with no serious violations', async () => {
    const element = render(
      <main>
        <h1>Achievements</h1>
        <LevelChip level={5} percent={62} />
        <StreakFlame days={12} freezes={2} />
        <XpBar level={5} current={180} needed={400} />
        <div>
          <StatTile icon={Trophy} label="Badges" value="7/14" />
          <StatTile icon={Flame} label="Day streak" value={12} tone="streak" hint="2 freezes held" />
        </div>
      </main>,
    )
    expect(await violations(element)).toEqual([])
  })

  it('renders a section card, surface and table with no serious violations', async () => {
    const element = render(
      <main>
        <h1>This week</h1>
        <SectionCard title="Quests" description="Three to go" icon={Trophy}>
          <Surface tier={2} className="p-4">
            Content
          </Surface>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Habit</TableHead>
                <TableHead>Done</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Read</TableCell>
                <TableCell>Yes</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </SectionCard>
      </main>,
    )
    expect(await violations(element)).toEqual([])
  })

  it('names the XP bar and the level chip for a screen reader', async () => {
    const element = render(
      <main>
        <XpBar level={3} current={50} needed={200} />
        <LevelChip level={3} percent={25} />
      </main>,
    )
    expect(element.querySelector('[role=progressbar]')?.getAttribute('aria-label')).toBe(
      'Level 3 progress',
    )
    expect(element.querySelector('a')?.getAttribute('aria-label')).toBe(
      'Level 3, 25% to next level',
    )
  })

  /**
   * The registry shipped this as a bare <button> with no `aria-expanded` and
   * collapsed panels left in the accessibility tree. These are the fixes, held
   * in place — re-adopting the component from upstream would fail here.
   */
  it('exposes the split accordion as a disclosure', async () => {
    const items = [
      { id: 'a', title: 'First', content: 'First answer' },
      { id: 'b', title: 'Second', content: 'Second answer' },
    ]
    const element = render(
      <main>
        <h1>Questions</h1>
        <SplitAccordion items={items} />
      </main>,
    )
    expect(await violations(element)).toEqual([])

    const [first] = Array.from(element.querySelectorAll('button'))
    expect(first?.getAttribute('aria-expanded')).toBe('false')

    // Collapsed content must be hidden from a screen reader and out of the tab
    // order — a zero height alone leaves both.
    const panel = element.querySelector(`#${CSS.escape(first!.getAttribute('aria-controls')!)}`)
    expect(panel?.getAttribute('aria-hidden')).toBe('true')
    expect(panel?.hasAttribute('inert')).toBe(true)

    React.act(() => first!.click())
    expect(first?.getAttribute('aria-expanded')).toBe('true')
    expect(panel?.hasAttribute('inert')).toBe(false)
  })

  /**
   * The registry version was a `<nav>` of unlabelled buttons with a single
   * hard-coded `layoutId`, so two on a page fought over one pill. These hold
   * the adaptations in place.
   */
  it('exposes continuous tabs as a labelled radiogroup with roving focus', async () => {
    const views = [
      { value: 'day', label: 'Day' },
      { value: 'week', label: 'Week' },
      { value: 'month', label: 'Month' },
    ] as const
    let picked = 'week'
    const element = render(
      <main>
        <h1>Planner</h1>
        <ContinuousTabs
          value="week"
          onValueChange={(next) => {
            picked = next
          }}
          options={views}
          label="Planner view"
        />
      </main>,
    )
    expect(await violations(element)).toEqual([])

    const group = element.querySelector('[role=radiogroup]')
    expect(group?.getAttribute('aria-label')).toBe('Planner view')
    const radios = Array.from(element.querySelectorAll('[role=radio]'))
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    // One tab stop for the whole control: only the selected option is focusable.
    expect(radios.map((radio) => radio.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])

    React.act(() => {
      radios[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(picked).toBe('month')
  })

  it('renders on the first paint rather than popping in after mount', () => {
    // The original returned null until a requestAnimationFrame fired, which
    // shifted the page layout under the control once it appeared.
    const element = render(
      <ContinuousTabs
        value="a"
        onValueChange={() => {}}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        label="Choice"
      />,
    )
    expect(element.querySelectorAll('[role=radio]')).toHaveLength(2)
  })

  it('keeps a decorative ring out of the accessibility tree unless named', async () => {
    const element = render(
      <main>
        <h1>Focus</h1>
        <ProgressRing value={0.5} aria-label="Focus timer" role="timer">
          <span>12:30</span>
        </ProgressRing>
      </main>,
    )
    expect(await violations(element)).toEqual([])
  })
})
