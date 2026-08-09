import { describe, expect, it } from 'vitest'
import { toSettings, toStudyPlan } from '@/services/study-plans-service'
import type { SavedStudyPlan } from '@/types/models'

function makeSaved(overrides: Partial<SavedStudyPlan> = {}): SavedStudyPlan {
  return {
    id: 'plan-1',
    user_id: 'user-1',
    name: 'Exam block',
    horizon_days: 14,
    daily_capacity_minutes: 240,
    stress_level: 80,
    days: [
      {
        dateKey: '2026-07-23',
        totalMinutes: 90,
        heavy: false,
        blocks: [
          { assignmentId: 'a', title: 'Essay', moduleId: null, minutes: 90, reason: 'Due soon' },
        ],
      },
    ],
    recommendations: ['Protect your sleep.'],
    unscheduled_minutes: 120,
    created_at: '2026-07-20T10:00:00Z',
    updated_at: '2026-07-22T10:00:00Z',
    ...overrides,
  }
}

describe('toStudyPlan', () => {
  it('rehydrates a saved row into the shape the planner renders', () => {
    const plan = toStudyPlan(makeSaved())
    expect(plan.days).toHaveLength(1)
    expect(plan.days[0]?.blocks[0]?.title).toBe('Essay')
    expect(plan.recommendations).toEqual(['Protect your sleep.'])
    expect(plan.unscheduledMinutes).toBe(120)
  })

  it('survives a row missing its JSON columns rather than breaking the page', () => {
    // Rows written by an older build, or edited by hand in the dashboard.
    const partial = makeSaved({
      days: undefined as unknown as SavedStudyPlan['days'],
      recommendations: undefined as unknown as string[],
      unscheduled_minutes: undefined as unknown as number,
    })
    expect(toStudyPlan(partial)).toEqual({
      days: [],
      recommendations: [],
      unscheduledMinutes: 0,
    })
  })
})

describe('toSettings', () => {
  it('restores the inputs that generated the plan, not just its output', () => {
    expect(toSettings(makeSaved())).toEqual({
      horizonDays: 14,
      dailyCapacityMinutes: 240,
      stressLevel: 80,
    })
  })
})
