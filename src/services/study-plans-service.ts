import { byUser, table } from '@/services/db'
import type { StudyPlan } from '@/services/study-planner'
import type { SavedStudyPlan, StudyPlanDay } from '@/types/models'

/**
 * Saved study plans.
 *
 * A generated plan is a proposal; this is where a student keeps one. The row
 * stores both the schedule snapshot and the settings that produced it, so
 * reopening a plan restores the whole editing context — not just the output.
 */

const plans = () => table<SavedStudyPlan>('study_plans')

/** The three generator inputs, in the units the page's controls use. */
export interface StudyPlanSettings {
  horizonDays: number
  dailyCapacityMinutes: number
  /** 0–100; the engine takes 0–1. */
  stressLevel: number
}

export interface SaveStudyPlanInput extends StudyPlanSettings {
  name: string
  days: StudyPlanDay[]
  recommendations: string[]
  unscheduledMinutes: number
}

/** Column payload shared by insert and update. */
function toRow(input: SaveStudyPlanInput): Record<string, unknown> {
  return {
    name: input.name.trim() || 'Untitled plan',
    horizon_days: input.horizonDays,
    daily_capacity_minutes: input.dailyCapacityMinutes,
    stress_level: input.stressLevel,
    days: input.days,
    recommendations: input.recommendations,
    unscheduled_minutes: input.unscheduledMinutes,
  }
}

export const studyPlansService = {
  async list(userId: string): Promise<SavedStudyPlan[]> {
    return plans().list({
      filters: byUser(userId),
      orderBy: { column: 'updated_at', ascending: false },
    })
  },

  async create(userId: string, input: SaveStudyPlanInput): Promise<SavedStudyPlan> {
    return plans().insert({ user_id: userId, ...toRow(input) })
  },

  /** Overwrite a saved plan with the current schedule and settings. */
  async update(id: string, input: SaveStudyPlanInput): Promise<SavedStudyPlan> {
    return plans().update(id, toRow(input))
  },

  async rename(id: string, name: string): Promise<SavedStudyPlan> {
    return plans().update(id, { name: name.trim() || 'Untitled plan' })
  },

  async remove(id: string): Promise<void> {
    return plans().remove(id)
  },
}

/** Rehydrate a saved row into the shape the planner UI renders. */
export function toStudyPlan(saved: SavedStudyPlan): StudyPlan {
  return {
    // Rows written by an older build — or hand-edited JSON — can be missing
    // these; default rather than crash the page on read.
    days: saved.days ?? [],
    recommendations: saved.recommendations ?? [],
    unscheduledMinutes: saved.unscheduled_minutes ?? 0,
  }
}

export function toSettings(saved: SavedStudyPlan): StudyPlanSettings {
  return {
    horizonDays: saved.horizon_days,
    dailyCapacityMinutes: saved.daily_capacity_minutes,
    stressLevel: saved.stress_level,
  }
}
