import { describe, expect, it } from 'vitest'
import { canCreateAssignment, PLANS } from '@/lib/plans'

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
