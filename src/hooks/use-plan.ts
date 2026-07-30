import { useAuth } from '@/app/providers/auth-provider'
import {
  type CountedResource,
  type PlanDefinition,
  type PlanLimits,
  PLANS,
  remainingQuota,
} from '@/lib/plans'
import type { Plan } from '@/types/models'

export interface QuotaUsage {
  used: number
  /** null = unlimited on this plan. */
  limit: number | null
  remaining: number | null
  atLimit: boolean
  unlimited: boolean
}

export interface CurrentPlan {
  plan: Plan
  definition: PlanDefinition
  limits: PlanLimits
  /** True when the plan includes a boolean feature such as `aiPlanner`. */
  has: (feature: keyof Omit<PlanLimits, CountedResource>) => boolean
  /** Usage against a metered resource, given how many the user already has. */
  quota: (resource: CountedResource, used: number) => QuotaUsage
}

/**
 * The signed-in user's plan, plus the two questions features actually ask of
 * it: "does my plan include X?" and "how much of Y is left?". Keeping both in
 * one place stops paywalls drifting apart page by page.
 */
export function usePlan(): CurrentPlan {
  const { profile } = useAuth()
  const plan = profile?.plan ?? 'free'
  const definition = PLANS[plan]

  return {
    plan,
    definition,
    limits: definition.limits,
    has: (feature) => definition.limits[feature],
    quota: (resource, used) => {
      const limit = definition.limits[resource]
      const remaining = remainingQuota(plan, resource, used)
      return {
        used,
        limit,
        remaining,
        unlimited: limit === null,
        atLimit: limit !== null && used >= limit,
      }
    },
  }
}
