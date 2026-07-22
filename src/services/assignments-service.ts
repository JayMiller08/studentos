import { isPast, parseISO } from 'date-fns'
import { canCreateAssignment } from '@/lib/plans'
import { byUser, table } from '@/services/db'
import type { Assignment, AssignmentStatus, Plan, Priority } from '@/types/models'

const assignments = () => table<Assignment>('assignments')

export interface AssignmentInput {
  title: string
  description?: string | null
  module_id?: string | null
  due_at: string
  priority: Priority
  weight: number
  estimated_minutes: number
  difficulty: number
  status?: AssignmentStatus
  progress?: number
  submission_url?: string | null
  notes?: string | null
  grade?: number | null
}

export class PlanLimitError extends Error {
  constructor(limit: number) {
    super(
      `The Free plan includes up to ${limit} active assignments. Upgrade to Student Pro for unlimited assignments.`,
    )
    this.name = 'PlanLimitError'
  }
}

/** An assignment is "active" while it still needs work (drives the free-plan limit). */
export function isActiveAssignment(assignment: Assignment): boolean {
  return assignment.status === 'not_started' || assignment.status === 'in_progress'
}

export function isOverdue(assignment: Assignment, now = new Date()): boolean {
  return (
    isActiveAssignment(assignment) && isPast(parseISO(assignment.due_at)) &&
    parseISO(assignment.due_at) < now
  )
}

export const assignmentsService = {
  async list(userId: string): Promise<Assignment[]> {
    return assignments().list({
      filters: byUser(userId),
      orderBy: { column: 'due_at', ascending: true },
    })
  },

  async create(userId: string, plan: Plan, input: AssignmentInput): Promise<Assignment> {
    const existing = await assignmentsService.list(userId)
    const activeCount = existing.filter(isActiveAssignment).length
    if (!canCreateAssignment(plan, activeCount)) {
      throw new PlanLimitError(3)
    }
    return assignments().insert({
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      module_id: input.module_id ?? null,
      due_at: input.due_at,
      priority: input.priority,
      weight: input.weight,
      estimated_minutes: input.estimated_minutes,
      difficulty: input.difficulty,
      status: input.status ?? 'not_started',
      progress: input.progress ?? 0,
      grade: input.grade ?? null,
      submission_url: input.submission_url ?? null,
      notes: input.notes ?? null,
    })
  },

  async update(id: string, patch: Partial<AssignmentInput>): Promise<Assignment> {
    const normalized: Record<string, unknown> = { ...patch }
    // Progress and status stay coherent without the user micromanaging both.
    if (patch.progress !== undefined && patch.status === undefined) {
      if (patch.progress >= 100) normalized.status = 'submitted'
      else if (patch.progress > 0) normalized.status = 'in_progress'
    }
    if (patch.status === 'submitted' && patch.progress === undefined) {
      normalized.progress = 100
    }
    return assignments().update(id, normalized)
  },

  async remove(id: string): Promise<void> {
    return assignments().remove(id)
  },
}
