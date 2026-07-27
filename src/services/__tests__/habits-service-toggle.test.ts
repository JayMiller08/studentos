import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/db', async () => {
  const actual = await vi.importActual<typeof import('@/services/db')>('@/services/db')
  return { ...actual, table: vi.fn() }
})

import { DbError, table, type TableClient } from '@/services/db'
import { habitsService } from '@/services/habits-service'
import type { HabitLog } from '@/types/models'

function mockHabitLogsTable(overrides: Partial<TableClient<HabitLog>>) {
  vi.mocked(table).mockReturnValue({
    list: vi.fn().mockResolvedValue([]), // both racing calls see "not logged yet"
    get: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    count: vi.fn(),
    ...overrides,
  } as TableClient<HabitLog>)
}

describe('habitsService.toggleLog — rapid double-click race', () => {
  it('treats a duplicate-key insert as already completed, not an error', async () => {
    // Reproduces the reported bug: two toggles fire before either write lands,
    // both see no existing row, both attempt to insert — the second collides
    // with the habit_logs_habit_id_log_date_key unique constraint.
    const insert = vi.fn().mockRejectedValue(
      new DbError(
        'habit_logs',
        'insert',
        'duplicate key value violates unique constraint "habit_logs_habit_id_log_date_key"',
        '23505',
      ),
    )
    mockHabitLogsTable({ insert })

    const completed = await habitsService.toggleLog('user-1', 'habit-1', '2026-07-24')

    expect(completed).toBe(true)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('still surfaces a genuine, non-duplicate database error', async () => {
    const insert = vi.fn().mockRejectedValue(
      new DbError('habit_logs', 'insert', 'permission denied for table habit_logs', '42501'),
    )
    mockHabitLogsTable({ insert })

    await expect(habitsService.toggleLog('user-1', 'habit-1', '2026-07-24')).rejects.toThrow()
  })
})
