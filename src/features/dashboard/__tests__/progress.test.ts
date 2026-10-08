import { describe, expect, it } from 'vitest'
import { badgeProgress, quizStanding } from '@/features/dashboard/progress'
import type { BadgeDef, QuizAttempt } from '@/types/models'

function attempt(daysAgo: number, score: number, total = 4): QuizAttempt {
  const at = new Date(Date.UTC(2026, 8, 28 - daysAgo, 12)).toISOString()
  return {
    id: `a${daysAgo}`,
    user_id: 'u',
    quiz_id: 'q',
    score,
    total,
    duration_seconds: 60,
    xp_awarded: 0,
    submitted_at: at,
    created_at: at,
    updated_at: at,
  }
}

describe('quizStanding', () => {
  it('has nothing to say before the first attempt', () => {
    expect(quizStanding([])).toEqual({ average: null, best: null, attempts: 0, trend: null })
  })

  it('averages the latest attempts, newest first whatever order they arrive in', () => {
    // 75% then 100%, given oldest-first.
    expect(quizStanding([attempt(3, 3), attempt(1, 4)])).toMatchObject({ average: 88, best: 100, attempts: 2 })
  })

  it('only averages the most recent five', () => {
    const old = [10, 11, 12].map((d) => attempt(d, 0)) // three 0% attempts long ago
    const recent = [1, 2, 3, 4, 5].map((d) => attempt(d, 4)) // five 100% attempts
    expect(quizStanding([...old, ...recent]).average).toBe(100)
  })

  it('reports no trend from a single window', () => {
    expect(quizStanding([1, 2, 3].map((d) => attempt(d, 2))).trend).toBeNull()
  })

  it('reports the move between the latest window and the one before', () => {
    const before = [6, 7, 8, 9, 10].map((d) => attempt(d, 2)) // 50%
    const latest = [1, 2, 3, 4, 5].map((d) => attempt(d, 3)) // 75%
    expect(quizStanding([...before, ...latest]).trend).toBe(25)
  })

  it('does not divide by zero on an empty quiz', () => {
    expect(quizStanding([attempt(1, 0, 0)]).average).toBe(0)
  })
})

describe('badgeProgress', () => {
  const catalog: BadgeDef[] = [
    { id: 'one', name: 'One', description: '', emoji: '1️⃣', xp_reward: 0 },
    { id: 'two', name: 'Two', description: '', emoji: '2️⃣', xp_reward: 0 },
    { id: 'three', name: 'Three', description: '', emoji: '3️⃣', xp_reward: 0 },
    { id: 'four', name: 'Four', description: '', emoji: '4️⃣', xp_reward: 0 },
  ]

  it('counts against the catalogue', () => {
    expect(badgeProgress([], catalog)).toEqual({ unlocked: 0, total: 4, latest: [] })
  })

  it('lists the most recently earned first, three at most', () => {
    const result = badgeProgress(
      [
        { badge_id: 'one', unlocked_at: '2026-09-01T00:00:00Z' },
        { badge_id: 'four', unlocked_at: '2026-09-20T00:00:00Z' },
        { badge_id: 'two', unlocked_at: '2026-09-10T00:00:00Z' },
        { badge_id: 'three', unlocked_at: '2026-09-15T00:00:00Z' },
      ],
      catalog,
    )
    expect(result.unlocked).toBe(4)
    expect(result.latest.map((badge) => badge.id)).toEqual(['four', 'three', 'two'])
  })

  it('ignores a retired badge so it cannot inflate the count', () => {
    const result = badgeProgress(
      [
        { badge_id: 'one', unlocked_at: '2026-09-01T00:00:00Z' },
        { badge_id: 'budget-boss', unlocked_at: '2026-09-02T00:00:00Z' },
      ],
      catalog,
    )
    expect(result).toMatchObject({ unlocked: 1, total: 4 })
  })

  it('counts a badge once even if it was somehow recorded twice', () => {
    const result = badgeProgress(
      [
        { badge_id: 'one', unlocked_at: '2026-09-01T00:00:00Z' },
        { badge_id: 'one', unlocked_at: '2026-09-05T00:00:00Z' },
      ],
      catalog,
    )
    expect(result.unlocked).toBe(1)
  })
})
