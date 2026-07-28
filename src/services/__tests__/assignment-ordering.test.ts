import { describe, expect, it } from 'vitest'
import { orderAssignments } from '@/services/priority-engine'
import type { Assignment } from '@/types/models'

const NOW = new Date('2026-03-01T08:00:00Z')

function assignment(overrides: Partial<Assignment> & { id: string }): Assignment {
  return {
    user_id: 'u1',
    module_id: null,
    title: overrides.id,
    description: null,
    due_at: '2026-03-10T09:00:00Z',
    priority: 'medium',
    weight: 10,
    estimated_minutes: 120,
    difficulty: 3,
    status: 'not_started',
    progress: 0,
    grade: null,
    submission_url: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// A small, heavily-weighted assignment due soon vs a trivial one due sooner.
const heavyButLater = assignment({
  id: 'heavy',
  due_at: '2026-03-05T09:00:00Z',
  weight: 60,
  estimated_minutes: 600,
  difficulty: 5,
})
const trivialButSooner = assignment({
  id: 'trivial',
  due_at: '2026-03-02T09:00:00Z',
  weight: 1,
  estimated_minutes: 15,
  progress: 90,
  priority: 'low',
})

describe('orderAssignments', () => {
  it('falls back to earliest deadline first without smart prioritization', () => {
    const { items, scoreById, smart } = orderAssignments([heavyButLater, trivialButSooner], {
      smart: false,
      now: NOW,
    })
    expect(smart).toBe(false)
    expect(items.map((a) => a.id)).toEqual(['trivial', 'heavy'])
    // No half-explained numbers on screen for plans without the feature.
    expect(scoreById.size).toBe(0)
  })

  it('weighs grade impact and remaining effort with smart prioritization', () => {
    const { items, scoreById, smart } = orderAssignments([trivialButSooner, heavyButLater], {
      smart: true,
      now: NOW,
    })
    expect(smart).toBe(true)
    // The 60%-of-grade, 10-hour job outranks a nearly-finished 1% task even
    // though the trivial one is due three days sooner — that is the value.
    expect(items[0]?.id).toBe('heavy')
    expect(scoreById.get('heavy')?.score).toBeGreaterThan(scoreById.get('trivial')?.score ?? 0)
  })

  it('exposes a reason for every ranked assignment', () => {
    const { items, scoreById } = orderAssignments([heavyButLater, trivialButSooner], {
      smart: true,
      now: NOW,
    })
    for (const item of items) {
      const score = scoreById.get(item.id)
      expect(score, `missing score for ${item.id}`).toBeDefined()
      expect(score?.reason).toMatch(/worth \d+%/)
    }
  })

  it('does not mutate the array it is given', () => {
    const input = [heavyButLater, trivialButSooner]
    orderAssignments(input, { smart: false, now: NOW })
    expect(input.map((a) => a.id)).toEqual(['heavy', 'trivial'])
  })

  it('handles an empty list on both paths', () => {
    expect(orderAssignments([], { smart: false, now: NOW }).items).toEqual([])
    expect(orderAssignments([], { smart: true, now: NOW }).items).toEqual([])
  })
})
