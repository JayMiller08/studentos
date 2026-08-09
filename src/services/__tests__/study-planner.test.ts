import { describe, expect, it } from 'vitest'
import {
  BLOCK_MINUTE_BOUNDS,
  clampBlockMinutes,
  generateStudyPlan,
  reconcileDay,
} from '@/services/study-planner'
import type { Assignment, StudyPlanDay } from '@/types/models'

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

// Hand-editing a saved plan is a first-class action, so a day's derived
// fields have to survive it — a schedule whose totals describe blocks it no
// longer contains is worse than no schedule.
describe('reconcileDay', () => {
  const day: StudyPlanDay = {
    dateKey: '2026-07-23',
    totalMinutes: 150,
    heavy: false,
    blocks: [
      { assignmentId: 'a', title: 'Essay', moduleId: null, minutes: 90, reason: 'Due soon' },
      { assignmentId: 'b', title: 'Lab', moduleId: null, minutes: 60, reason: 'Due soon' },
    ],
  }

  it('recomputes the total from the blocks it is given', () => {
    const next = reconcileDay(day, day.blocks.slice(0, 1), 180)
    expect(next.blocks).toHaveLength(1)
    expect(next.totalMinutes).toBe(90)
  })

  it('re-flags a day as heavy only when it passes 80% of capacity', () => {
    expect(reconcileDay(day, day.blocks, 200).heavy).toBe(false) // 150 of 200
    expect(reconcileDay(day, day.blocks, 180).heavy).toBe(true) // 150 of 180
  })

  it('reports an emptied day as zero rather than leaving the old total', () => {
    const next = reconcileDay(day, [], 180)
    expect(next.totalMinutes).toBe(0)
    expect(next.heavy).toBe(false)
  })

  it('keeps the day it was given identifiable', () => {
    expect(reconcileDay(day, [], 180).dateKey).toBe('2026-07-23')
  })
})

describe('clampBlockMinutes', () => {
  it('holds edited blocks inside the range the engine schedules in', () => {
    expect(clampBlockMinutes(5)).toBe(BLOCK_MINUTE_BOUNDS.min)
    expect(clampBlockMinutes(500)).toBe(BLOCK_MINUTE_BOUNDS.max)
    expect(clampBlockMinutes(45)).toBe(45)
  })
})
