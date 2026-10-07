import { describe, expect, it } from 'vitest'
import {
  defeatedBoss,
  gradeLetter,
  nextDueQuiz,
  scoreOf,
  xpBreakdown,
} from '@/services/quiz-service'
import type { Quiz, QuizAttempt } from '@/types/models'

function quiz(id: string, createdAt: string, kind: Quiz['kind'] = 'practice'): Quiz {
  return {
    id,
    user_id: 'u1',
    module_id: null,
    title: id,
    source: 'ai',
    kind,
    question_count: 5,
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function attempt(quizId: string, submittedAt: string, score = 3, total = 5): QuizAttempt {
  return {
    id: `a-${quizId}-${submittedAt}`,
    user_id: 'u1',
    quiz_id: quizId,
    score,
    total,
    duration_seconds: 60,
    xp_awarded: 0,
    submitted_at: submittedAt,
    created_at: submittedAt,
    updated_at: submittedAt,
  }
}

describe('scoreOf', () => {
  it('is a percentage', () => {
    expect(scoreOf({ score: 3, total: 4 })).toBe(75)
    expect(scoreOf({ score: 5, total: 5 })).toBe(100)
    expect(scoreOf({ score: 0, total: 5 })).toBe(0)
  })

  it('does not divide by zero for an empty quiz', () => {
    expect(scoreOf({ score: 0, total: 0 })).toBe(0)
  })
})

describe('gradeLetter', () => {
  it.each([
    [100, 'A'],
    [80, 'A'],
    [79, 'B'],
    [70, 'B'],
    [60, 'C'],
    [50, 'D'],
    [49, 'F'],
    [0, 'F'],
  ])('%i%% is %s', (percent, letter) => {
    expect(gradeLetter(percent)).toBe(letter)
  })
})

describe('defeatedBoss', () => {
  it('needs 80% and a boss quiz', () => {
    expect(defeatedBoss('boss', 4, 5)).toBe(true)
    expect(defeatedBoss('boss', 8, 10)).toBe(true)
    expect(defeatedBoss('boss', 7, 10)).toBe(false)
    // A perfect practice quiz is still not a boss.
    expect(defeatedBoss('practice', 5, 5)).toBe(false)
  })

  it('is false for a quiz with no questions rather than vacuously true', () => {
    // 0/0 would be NaN; an empty boss must not count as defeated.
    expect(defeatedBoss('boss', 0, 0)).toBe(false)
  })
})

describe('xpBreakdown', () => {
  it('pays per correct answer plus a flat completion bonus', () => {
    // 3 correct × 8 = 24, + 15 for finishing.
    expect(xpBreakdown(3, 5, 'practice')).toEqual({
      correct: 24,
      completed: 15,
      boss: 0,
      total: 39,
    })
  })

  it('adds the boss bonus only when the boss is actually beaten', () => {
    expect(xpBreakdown(4, 5, 'boss').boss).toBe(120)
    expect(xpBreakdown(3, 5, 'boss').boss).toBe(0)
  })

  it('still pays the completion bonus for a score of zero', () => {
    // Turning up and being wrong is worth more than not turning up.
    expect(xpBreakdown(0, 5, 'practice').total).toBe(15)
  })
})

describe('nextDueQuiz', () => {
  const a = quiz('a', '2026-01-01')
  const b = quiz('b', '2026-01-02')
  const c = quiz('c', '2026-01-03')

  it('returns null when there is nothing to revise', () => {
    expect(nextDueQuiz([], [])).toBeNull()
  })

  it('prefers a quiz that has never been attempted', () => {
    const attempts = [attempt('a', '2026-02-01'), attempt('c', '2026-02-02')]
    expect(nextDueQuiz([a, b, c], attempts)?.id).toBe('b')
  })

  it('otherwise picks the least recently attempted', () => {
    const attempts = [
      attempt('a', '2026-02-05'),
      attempt('b', '2026-02-01'),
      attempt('c', '2026-02-03'),
    ]
    expect(nextDueQuiz([a, b, c], attempts)?.id).toBe('b')
  })

  it('uses the most recent attempt per quiz, not the first', () => {
    // `b` was attempted long ago AND just now; it is not the one due.
    const attempts = [
      attempt('a', '2026-02-02'),
      attempt('b', '2026-01-01'),
      attempt('b', '2026-02-09'),
    ]
    expect(nextDueQuiz([a, b], attempts)?.id).toBe('a')
  })

  it('breaks ties between untried quizzes by age', () => {
    expect(nextDueQuiz([c, a, b], [])?.id).toBe('a')
  })
})
