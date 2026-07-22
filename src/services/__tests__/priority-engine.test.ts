import { describe, expect, it } from 'vitest'
import { rankAssignments, remainingWorkMinutes, scoreAssignment } from '@/services/priority-engine'
import type { Assignment } from '@/types/models'

const NOW = new Date('2026-07-23T09:00:00Z')

function makeAssignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    module_id: null,
    title: 'Test assignment',
    description: null,
    due_at: '2026-07-30T17:00:00Z',
    priority: 'medium',
    weight: 10,
    estimated_minutes: 120,
    difficulty: 3,
    status: 'not_started',
    progress: 0,
    grade: null,
    submission_url: null,
    notes: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  }
}

describe('remainingWorkMinutes', () => {
  it('scales estimated time by progress', () => {
    expect(remainingWorkMinutes(makeAssignment({ estimated_minutes: 200, progress: 25 }))).toBe(150)
    expect(remainingWorkMinutes(makeAssignment({ estimated_minutes: 200, progress: 100 }))).toBe(0)
  })
})

describe('scoreAssignment', () => {
  it('returns a bounded 0–100 score', () => {
    const { score } = scoreAssignment(makeAssignment({}), { now: NOW })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('scores imminent deadlines above distant ones', () => {
    const dueSoon = scoreAssignment(makeAssignment({ due_at: '2026-07-24T09:00:00Z' }), { now: NOW })
    const dueLater = scoreAssignment(makeAssignment({ due_at: '2026-08-20T09:00:00Z' }), { now: NOW })
    expect(dueSoon.score).toBeGreaterThan(dueLater.score)
  })

  it('gives overdue work maximum urgency', () => {
    const overdue = scoreAssignment(makeAssignment({ due_at: '2026-07-20T09:00:00Z' }), { now: NOW })
    expect(overdue.factors.urgency).toBe(1)
    expect(overdue.band).toBe('critical')
  })

  it('ranks heavier-weighted work higher, all else equal', () => {
    const light = scoreAssignment(makeAssignment({ weight: 5 }), { now: NOW })
    const heavy = scoreAssignment(makeAssignment({ weight: 40 }), { now: NOW })
    expect(heavy.score).toBeGreaterThan(light.score)
  })

  it('deprioritizes nearly-finished work', () => {
    const fresh = scoreAssignment(makeAssignment({ progress: 0 }), { now: NOW })
    const nearlyDone = scoreAssignment(makeAssignment({ progress: 90 }), { now: NOW })
    expect(fresh.score).toBeGreaterThan(nearlyDone.score)
  })

  it('raises urgency influence under stress', () => {
    const urgent = makeAssignment({ due_at: '2026-07-24T09:00:00Z', weight: 5 })
    const valuable = makeAssignment({ due_at: '2026-08-15T09:00:00Z', weight: 60 })
    const calm = rankAssignments([urgent, valuable], { now: NOW, stressLevel: 0 })
    const stressed = rankAssignments([urgent, valuable], { now: NOW, stressLevel: 1 })
    // Under full stress the imminent deadline must win the top slot.
    expect(stressed[0]?.id).toBe(urgent.id)
    // The gap between the two must widen with stress.
    const gap = (list: typeof calm) =>
      (list.find((a) => a.id === urgent.id)?.priority_score.score ?? 0) -
      (list.find((a) => a.id === valuable.id)?.priority_score.score ?? 0)
    expect(gap(stressed)).toBeGreaterThan(gap(calm))
  })
})

describe('rankAssignments', () => {
  it('sorts by descending score', () => {
    const ranked = rankAssignments(
      [
        makeAssignment({ title: 'far', due_at: '2026-09-01T09:00:00Z' }),
        makeAssignment({ title: 'near', due_at: '2026-07-24T09:00:00Z' }),
      ],
      { now: NOW },
    )
    expect(ranked[0]?.title).toBe('near')
    const scores = ranked.map((a) => a.priority_score.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })
})
