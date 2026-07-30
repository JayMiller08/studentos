import type { Plan } from '@/types/models'

/** Resources the Free plan meters. Pro and Elite lift every cap. */
export type CountedResource = 'assignments' | 'tasks' | 'notes'

export interface PlanLimits {
  /** Maximum live assignments; null = unlimited. */
  assignments: number | null
  /** Maximum unfinished tasks; null = unlimited. */
  tasks: number | null
  /** Maximum notes; null = unlimited. */
  notes: number | null
  /** Deadline-aware ranking and the "why this first" explanations. */
  smartPrioritization: boolean
  /** Generating a day-by-day study schedule from assignments. */
  aiPlanner: boolean
  advancedAnalytics: boolean
  aiCoach: boolean
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
      tasks: 30,
      notes: 15,
      smartPrioritization: false,
      aiPlanner: false,
      advancedAnalytics: false,
      aiCoach: false,
      careerTools: false,
    },
    features: [
      'Dashboard & planner',
      'Calendar',
      'Pomodoro focus timer',
      'Habit tracker',
      'Budget tracking',
      'Up to 3 active assignments',
      '30 unfinished tasks & 15 notes',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Student Pro',
    tagline: 'Your AI-powered study copilot.',
    monthlyPrice: 49,
    limits: {
      assignments: null,
      tasks: null,
      notes: null,
      smartPrioritization: true,
      aiPlanner: true,
      advancedAnalytics: true,
      aiCoach: true,
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
      tasks: null,
      notes: null,
      smartPrioritization: true,
      aiPlanner: true,
      advancedAnalytics: true,
      aiCoach: true,
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

/** Plain-language name for each metered resource, used in limit messages. */
const RESOURCE_LABEL: Record<CountedResource, string> = {
  assignments: 'active assignments',
  tasks: 'unfinished tasks',
  notes: 'notes',
}

/**
 * Thrown when creating one more of a metered resource would exceed the plan.
 * Services raise it; the UI catches it to show an upgrade prompt rather than a
 * generic failure toast.
 */
export class PlanLimitError extends Error {
  readonly resource: CountedResource
  readonly limit: number

  constructor(resource: CountedResource, limit: number) {
    super(
      `Your plan includes up to ${limit} ${RESOURCE_LABEL[resource]}. Upgrade to Student Pro for unlimited ${RESOURCE_LABEL[resource]}.`,
    )
    this.name = 'PlanLimitError'
    this.resource = resource
    this.limit = limit
  }
}

export function limitFor(plan: Plan, resource: CountedResource): number | null {
  return PLANS[plan].limits[resource]
}

/** Whether one more of `resource` may be created at the current count. */
export function canCreate(plan: Plan, resource: CountedResource, currentCount: number): boolean {
  const limit = limitFor(plan, resource)
  return limit === null || currentCount < limit
}

/**
 * How many more may be created; null when unlimited. Clamped at zero so a user
 * who was already over the cap (downgraded, or the cap was lowered) reads as
 * "none left" rather than a negative — their existing work is never touched.
 */
export function remainingQuota(
  plan: Plan,
  resource: CountedResource,
  currentCount: number,
): number | null {
  const limit = limitFor(plan, resource)
  return limit === null ? null : Math.max(0, limit - currentCount)
}

/** Throw unless one more of `resource` fits within the plan. */
export function assertCanCreate(
  plan: Plan,
  resource: CountedResource,
  currentCount: number,
): void {
  const limit = limitFor(plan, resource)
  if (limit !== null && currentCount >= limit) throw new PlanLimitError(resource, limit)
}

/** Whether a user on `plan` can create one more assignment given `activeCount`. */
export function canCreateAssignment(plan: Plan, activeCount: number): boolean {
  return canCreate(plan, 'assignments', activeCount)
}
