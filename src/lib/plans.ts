import type { Plan } from '@/types/models'

export interface PlanLimits {
  /** Maximum live assignments; null = unlimited. */
  assignments: number | null
  aiCoach: boolean
  smartPrioritization: boolean
  advancedAnalytics: boolean
  careerTools: boolean
}

export interface PlanDefinition {
  id: Plan
  name: string
  tagline: string
  /** Monthly price in South African Rand (ZAR). */
  monthlyPrice: number
  limits: PlanLimits
  features: string[]
}

/** Currency the plans are priced and billed in. */
export const PLAN_CURRENCY = 'ZAR' as const
export const PLAN_CURRENCY_SYMBOL = 'R' as const

/** Display a plan's price, e.g. "Free" or "R49". */
export function formatPlanPrice(price: number): string {
  return price === 0 ? 'Free' : `${PLAN_CURRENCY_SYMBOL}${price}`
}

export const PLAN_ORDER: readonly Plan[] = ['free', 'pro', 'elite']

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Everything you need to get organized.',
    monthlyPrice: 0,
    limits: {
      assignments: 3,
      aiCoach: false,
      smartPrioritization: false,
      advancedAnalytics: false,
      careerTools: false,
    },
    features: [
      'Dashboard & planner',
      'Calendar',
      'Pomodoro focus timer',
      'Habit tracker',
      'Budget tracking',
      'Up to 3 active assignments',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Student Pro',
    tagline: 'Your AI-powered study copilot.',
    monthlyPrice: 49,
    limits: {
      assignments: null,
      aiCoach: true,
      smartPrioritization: true,
      advancedAnalytics: true,
      careerTools: false,
    },
    features: [
      'Everything in Free',
      'Unlimited assignments & tasks',
      'AI study planner',
      'Smart prioritization',
      'Advanced analytics',
      'Unlimited notes & cloud sync',
    ],
  },
  elite: {
    id: 'elite',
    name: 'Student Elite',
    tagline: 'From campus to career.',
    monthlyPrice: 99,
    limits: {
      assignments: null,
      aiCoach: true,
      smartPrioritization: true,
      advancedAnalytics: true,
      careerTools: true,
    },
    features: [
      'Everything in Pro',
      'Career dashboard',
      'Resume builder',
      'Portfolio & internship tracker',
      'GitHub integration',
      'AI career coach',
    ],
  },
}

export function getPlan(plan: Plan): PlanDefinition {
  return PLANS[plan]
}

/** Whether a user on `plan` can create one more assignment given `activeCount`. */
export function canCreateAssignment(plan: Plan, activeCount: number): boolean {
  const limit = PLANS[plan].limits.assignments
  return limit === null || activeCount < limit
}
