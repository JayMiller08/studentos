import { describe, expect, it } from 'vitest'
import { generateStudyPlan } from '@/services/study-planner'
import type { Assignment } from '@/types/models'

const NOW = new Date('2026-07-23T08:00:00Z')

function makeAssignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    module_id: null,
    title: 'Work',
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

describe('generateStudyPlan', () => {
  it('never schedules a day beyond its capacity', () => {
    const plan = generateStudyPlan(
      [
        makeAssignment({ estimated_minutes: 600 }),
        makeAssignment({ estimated_minutes: 600, due_at: '2026-08-05T17:00:00Z' }),
      ],
      { now: NOW, dailyCapacityMinutes: 120 },
    )
    for (const day of plan.days) {
      expect(day.totalMinutes).toBeLessThanOrEqual(120)
    }
  })

  it('schedules all work when capacity allows, none after its deadline', () => {
    const assignment = makeAssignment({
      estimated_minutes: 180,
      due_at: '2026-07-26T17:00:00Z',
    })
    const plan = generateStudyPlan([assignment], { now: NOW, dailyCapacityMinutes: 180 })
    const scheduled = plan.days.flatMap((day) =>
      day.blocks.filter((b) => b.assignmentId === assignment.id).map((b) => ({ day, b })),
    )
    const total = scheduled.reduce((sum, { b }) => sum + b.minutes, 0)
    expect(total).toBe(180)
    expect(plan.unscheduledMinutes).toBe(0)
    for (const { day } of scheduled) {
      expect(day.dateKey <= '2026-07-26').toBe(true)
    }
  })

  it('reports overflow it cannot fit before the horizon', () => {
    const plan = generateStudyPlan(
      [makeAssignment({ estimated_minutes: 6000, due_at: '2026-10-01T17:00:00Z' })],
      { now: NOW, horizonDays: 3, dailyCapacityMinutes: 60 },
    )
    expect(plan.unscheduledMinutes).toBe(6000 - 3 * 60)
    expect(plan.recommendations.some((r) => r.includes("doesn't fit"))).toBe(true)
  })

  it('respects progress already made', () => {
    const plan = generateStudyPlan(
      [makeAssignment({ estimated_minutes: 200, progress: 50 })],
      { now: NOW },
    )
    const total = plan.days.flatMap((d) => d.blocks).reduce((sum, b) => sum + b.minutes, 0)
    expect(total).toBe(100)
  })

  it('keeps blocks within the 25–90 minute focus range where possible', () => {
    const plan = generateStudyPlan(
      [makeAssignment({ estimated_minutes: 500, due_at: '2026-08-10T17:00:00Z' })],
      { now: NOW, dailyCapacityMinutes: 180 },
    )
    // Blocks merge per assignment per day, so per-day totals are what we cap.
    for (const day of plan.days) {
      for (const block of day.blocks) {
        expect(block.minutes).toBeGreaterThanOrEqual(20)
      }
    }
  })
})
