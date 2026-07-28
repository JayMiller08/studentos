import { describe, expect, it } from 'vitest'
import {
  assertCanCreate,
  canCreate,
  canCreateAssignment,
  type CountedResource,
  PLAN_ORDER,
  PLANS,
  PlanLimitError,
  remainingQuota,
} from '@/lib/plans'

const METERED: CountedResource[] = ['assignments', 'tasks', 'notes']

describe('plan gating', () => {
  it('caps free users at 3 active assignments', () => {
    expect(canCreateAssignment('free', 0)).toBe(true)
    expect(canCreateAssignment('free', 2)).toBe(true)
    expect(canCreateAssignment('free', 3)).toBe(false)
  })

  it('never caps paid plans', () => {
    expect(canCreateAssignment('pro', 500)).toBe(true)
    expect(canCreateAssignment('elite', 500)).toBe(true)
  })

  it('keeps plan capabilities monotonic across tiers', () => {
    expect(PLANS.free.limits.aiCoach).toBe(false)
    expect(PLANS.pro.limits.aiCoach).toBe(true)
    expect(PLANS.elite.limits.aiCoach).toBe(true)
    expect(PLANS.elite.limits.careerTools).toBe(true)
    expect(PLANS.pro.limits.careerTools).toBe(false)
  })
})

describe('the Student Pro promise', () => {
  // Each assertion maps to a bullet the pricing page sells.
  it('lifts every creation cap', () => {
    for (const resource of METERED) {
      expect(PLANS.pro.limits[resource], `pro should not cap ${resource}`).toBeNull()
      expect(PLANS.free.limits[resource], `free should cap ${resource}`).not.toBeNull()
    }
  })

  it('unlocks the planner, prioritization and analytics', () => {
    expect(PLANS.pro.limits.aiPlanner).toBe(true)
    expect(PLANS.pro.limits.smartPrioritization).toBe(true)
    expect(PLANS.pro.limits.advancedAnalytics).toBe(true)
    expect(PLANS.free.limits.aiPlanner).toBe(false)
    expect(PLANS.free.limits.smartPrioritization).toBe(false)
    expect(PLANS.free.limits.advancedAnalytics).toBe(false)
  })

  it('keeps the AI planner independent of smart prioritization', () => {
    // They were one flag once; a future tier could sell them apart.
    expect('aiPlanner' in PLANS.free.limits).toBe(true)
    expect('smartPrioritization' in PLANS.free.limits).toBe(true)
  })

  it('never gives a lower tier something a higher tier lacks', () => {
    const booleans = [
      'smartPrioritization',
      'aiPlanner',
      'advancedAnalytics',
      'aiCoach',
      'careerTools',
    ] as const
    for (let i = 1; i < PLAN_ORDER.length; i += 1) {
      const lower = PLANS[PLAN_ORDER[i - 1]!].limits
      const higher = PLANS[PLAN_ORDER[i]!].limits
      for (const feature of booleans) {
        if (lower[feature]) {
          expect(higher[feature], `${PLAN_ORDER[i]} lost ${feature}`).toBe(true)
        }
      }
      for (const resource of METERED) {
        // null (unlimited) must never regress into a number.
        if (lower[resource] === null) expect(higher[resource]).toBeNull()
      }
    }
  })
})

describe('canCreate / remainingQuota', () => {
  it('counts down to the cap and stops', () => {
    expect(remainingQuota('free', 'notes', 0)).toBe(PLANS.free.limits.notes)
    expect(canCreate('free', 'notes', 14)).toBe(true)
    expect(canCreate('free', 'notes', 15)).toBe(false)
    expect(remainingQuota('free', 'notes', 15)).toBe(0)
  })

  it('reports unlimited as null rather than a big number', () => {
    expect(remainingQuota('pro', 'tasks', 900)).toBeNull()
    expect(canCreate('pro', 'tasks', 900)).toBe(true)
  })

  it('clamps at zero for anyone already over the cap', () => {
    // Downgrading from Pro leaves existing work in place; it must read as
    // "none left", never a negative allowance.
    expect(remainingQuota('free', 'tasks', 200)).toBe(0)
    expect(canCreate('free', 'tasks', 200)).toBe(false)
  })
})

describe('assertCanCreate', () => {
  it('passes silently below the cap', () => {
    expect(() => assertCanCreate('free', 'tasks', 0)).not.toThrow()
  })

  it('throws a PlanLimitError carrying the resource and cap', () => {
    try {
      assertCanCreate('free', 'notes', 15)
      throw new Error('expected assertCanCreate to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(PlanLimitError)
      const limitError = error as PlanLimitError
      expect(limitError.resource).toBe('notes')
      expect(limitError.limit).toBe(15)
      // The message reaches users verbatim via the global mutation toast.
      expect(limitError.message).toContain('15 notes')
      expect(limitError.message).toContain('Student Pro')
    }
  })

  it('never throws on an unlimited plan', () => {
    for (const resource of METERED) {
      expect(() => assertCanCreate('pro', resource, 10_000)).not.toThrow()
    }
  })
})
