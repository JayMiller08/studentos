import { byUser, table } from '@/services/db'
import type { Module } from '@/types/models'

const modules = () => table<Module>('modules')

export interface ModuleInput {
  name: string
  code?: string | null
  color?: string
  credits?: number | null
  instructor?: string | null
  semester_id?: string | null
}

export const modulesService = {
  async list(userId: string): Promise<Module[]> {
    return modules().list({
      filters: byUser(userId, [{ column: 'archived', op: 'eq', value: false }]),
      orderBy: { column: 'name', ascending: true },
    })
  },

  async create(userId: string, input: ModuleInput): Promise<Module> {
    return modules().insert({
      user_id: userId,
      name: input.name,
      code: input.code ?? null,
      color: input.color ?? '#2563eb',
      credits: input.credits ?? null,
      instructor: input.instructor ?? null,
      semester_id: input.semester_id ?? null,
      course_id: null,
      archived: false,
    })
  },

  async update(id: string, patch: Partial<ModuleInput> & { archived?: boolean }): Promise<Module> {
    return modules().update(id, patch)
  },

  async remove(id: string): Promise<void> {
    return modules().remove(id)
  },
}

/** Preset palette for module colors (WCAG-checked on light & dark cards). */
export const MODULE_COLORS = [
  '#2563eb', // blue
  '#4f46e5', // indigo
  '#0d9488', // teal
  '#16a34a', // green
  '#d97706', // amber
  '#dc2626', // red
  '#c026d3', // fuchsia
  '#0891b2', // cyan
] as const
