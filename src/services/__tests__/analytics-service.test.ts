import { describe, expect, it } from 'vitest'
import {
  bestFocusWindow,
  computeFocusByHour,
  computeGradeTrend,
  computeModulePerformance,
  toCsv,
  weightedAverageGrade,
} from '@/services/analytics-service'
import type { Assignment, Module, StudySession } from '@/types/models'

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: 'a1',
    user_id: 'u1',
    module_id: null,
    title: 'Essay',
    description: null,
    due_at: '2026-03-01T09:00:00Z',
    priority: 'medium',
    weight: 10,
    estimated_minutes: 120,
    difficulty: 3,
    status: 'graded',
    progress: 100,
    grade: 70,
    submission_url: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 's1',
    user_id: 'u1',
    started_at: '2026-03-01T09:00:00',
    ended_at: null,
    minutes: 60,
    source: 'pomodoro',
    module_id: null,
    assignment_id: null,
    distractions: 0,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function module_(overrides: Partial<Module> = {}): Module {
  return {
    id: 'm1',
    user_id: 'u1',
    semester_id: null,
    code: 'CSC2001',
    name: 'Data Structures',
    color: '#2563eb',
    credits: 16,
    instructor: null,
    archived: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('weightedAverageGrade', () => {
  it('weights each grade by its contribution to the final mark', () => {
    // 90 at weight 60 and 50 at weight 40 → 74, not the naive mean of 70.
    const average = weightedAverageGrade([
      assignment({ id: 'a1', grade: 90, weight: 60 }),
      assignment({ id: 'a2', grade: 50, weight: 40 }),
    ])
    expect(average).toBe(74)
  })

  it('ignores assignments that have no grade yet', () => {
    const average = weightedAverageGrade([
      assignment({ id: 'a1', grade: 80, weight: 50 }),
      assignment({ id: 'a2', grade: null, weight: 50, status: 'in_progress' }),
    ])
    expect(average).toBe(80)
  })

  it('falls back to an equal weighting when every weight is zero', () => {
    const average = weightedAverageGrade([
      assignment({ id: 'a1', grade: 60, weight: 0 }),
      assignment({ id: 'a2', grade: 80, weight: 0 }),
    ])
    expect(average).toBe(70)
  })

  it('returns null when nothing is graded', () => {
    expect(weightedAverageGrade([assignment({ grade: null })])).toBeNull()
    expect(weightedAverageGrade([])).toBeNull()
  })
})

describe('computeModulePerformance', () => {
  it('attributes focus time and grades to the right module', () => {
    const modules = [module_({ id: 'm1' }), module_({ id: 'm2', name: 'Calculus', code: 'MAM1000' })]
    const assignments = [
      assignment({ id: 'a1', module_id: 'm1', grade: 80, weight: 100 }),
      assignment({ id: 'a2', module_id: 'm2', grade: 55, weight: 100 }),
    ]
    const sessions = [
      session({ id: 's1', module_id: 'm1', minutes: 120 }),
      session({ id: 's2', module_id: 'm1', minutes: 60 }),
      session({ id: 's3', module_id: 'm2', minutes: 30 }),
      session({ id: 's4', module_id: null, minutes: 999 }), // unattributed, must not leak
    ]

    const [first, second] = computeModulePerformance(modules, assignments, sessions)

    // Sorted by time invested, so the module eating the most hours leads.
    expect(first?.moduleId).toBe('m1')
    expect(first?.focusMinutes).toBe(180)
    expect(first?.averageGrade).toBe(80)
    expect(second?.moduleId).toBe('m2')
    expect(second?.focusMinutes).toBe(30)
    expect(second?.averageGrade).toBe(55)
  })

  it('reports a module with no activity rather than dropping it', () => {
    const [only] = computeModulePerformance([module_()], [], [])
    expect(only?.focusMinutes).toBe(0)
    expect(only?.averageGrade).toBeNull()
    expect(only?.minutesPerPoint).toBeNull()
  })
})

describe('computeFocusByHour / bestFocusWindow', () => {
  it('buckets sessions by the hour they started', () => {
    const buckets = computeFocusByHour([
      session({ id: 's1', started_at: '2026-03-01T09:15:00', minutes: 25 }),
      session({ id: 's2', started_at: '2026-03-02T09:45:00', minutes: 35 }),
      session({ id: 's3', started_at: '2026-03-02T14:00:00', minutes: 50 }),
    ])
    expect(buckets).toHaveLength(24)
    expect(buckets[9]).toMatchObject({ minutes: 60, sessions: 2, label: '09:00' })
    expect(buckets[14]).toMatchObject({ minutes: 50, sessions: 1 })
    expect(buckets[0]?.minutes).toBe(0)
  })

  it('finds the strongest three-hour stretch', () => {
    const buckets = computeFocusByHour([
      session({ id: 's1', started_at: '2026-03-01T19:00:00', minutes: 90 }),
      session({ id: 's2', started_at: '2026-03-01T20:00:00', minutes: 90 }),
      session({ id: 's3', started_at: '2026-03-01T08:00:00', minutes: 30 }),
    ])
    const best = bestFocusWindow(buckets)
    expect(best?.label).toBe('18:00–21:00')
    expect(best?.minutes).toBe(180)
  })

  it('never proposes a window that runs past midnight', () => {
    const buckets = computeFocusByHour([
      session({ id: 's1', started_at: '2026-03-01T23:00:00', minutes: 120 }),
    ])
    const best = bestFocusWindow(buckets)
    expect(best?.endHour).toBeLessThanOrEqual(24)
    expect(best?.startHour).toBe(21)
  })

  it('returns null when nothing has been logged', () => {
    expect(bestFocusWindow(computeFocusByHour([]))).toBeNull()
  })
})

describe('computeGradeTrend', () => {
  it('orders grades oldest-first with a running weighted average', () => {
    const trend = computeGradeTrend([
      assignment({ id: 'a2', due_at: '2026-05-01T09:00:00Z', grade: 50, weight: 40 }),
      assignment({ id: 'a1', due_at: '2026-03-01T09:00:00Z', grade: 90, weight: 60 }),
    ])
    expect(trend.map((point) => point.grade)).toEqual([90, 50])
    expect(trend[0]?.runningAverage).toBe(90)
    expect(trend[1]?.runningAverage).toBe(74)
  })

  it('skips assignments that are not graded', () => {
    expect(computeGradeTrend([assignment({ grade: null })])).toEqual([])
  })
})

describe('toCsv', () => {
  it('emits a header row followed by values', () => {
    expect(toCsv([{ module: 'Calculus', hours: 12 }])).toBe('module,hours\r\nCalculus,12')
  })

  it('quotes values containing commas, quotes or newlines', () => {
    // A module named "Stats, Applied" must not shift every later column.
    const csv = toCsv([{ module: 'Stats, Applied', note: 'said "hi"' }])
    expect(csv).toBe('module,note\r\n"Stats, Applied","said ""hi"""')
  })

  it('writes an empty cell for null', () => {
    expect(toCsv([{ module: 'Calculus', grade: null }])).toBe('module,grade\r\nCalculus,')
  })

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })
})
