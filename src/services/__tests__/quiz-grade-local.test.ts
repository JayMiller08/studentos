// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { localDb } from '@/lib/local-db'
import { QUIZ_XP } from '@/services/gamification-service'
import { quizService } from '@/services/quiz-service'
import type { Quiz } from '@/types/models'

/**
 * Demo-mode grading. There is no quiz-grade function without a backend, so
 * quizService grades on-device — and must teach the same rules the server
 * enforces, or the demo shows a student numbers the real app never pays:
 * the first pass at a quiz pays, a re-take does not, and a quiz keeps the
 * streak. (vitest.config.ts blanks the Supabase env, so this is demo mode.)
 */

const USER = '00000000-0000-4000-8000-000000000001'
type Row = { id: string; created_at: string; updated_at: string; [key: string]: unknown }

let quiz: Quiz
let questionIds: string[]

beforeEach(() => {
  localStorage.clear()
  localDb.insert('profiles', {
    id: USER,
    xp: 0,
    level: 1,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    streak_freezes: 1,
  })
  quiz = localDb.insert<Row>('quizzes', {
    user_id: USER,
    title: 'Graphs',
    source: 'note',
    kind: 'practice',
    question_count: 3,
  }) as unknown as Quiz
  questionIds = [1, 0, 2].map(
    (correct, ordinal) =>
      localDb.insert<Row>('quiz_questions', {
        quiz_id: quiz.id,
        ordinal,
        prompt: `Q${ordinal}`,
        options: ['a', 'b', 'c'],
        correct_index: correct,
        explanation: null,
      }).id,
  )
})

const allRight = () =>
  new Map<string, number | null>([
    [questionIds[0]!, 1],
    [questionIds[1]!, 0],
    [questionIds[2]!, 2],
  ])

describe('demo grading', () => {
  it('pays the first pass and nothing for a re-take, keyed on the quiz', async () => {
    const first = await quizService.grade(USER, quiz, allRight(), 60)
    const second = await quizService.grade(USER, quiz, allRight(), 60)
    expect(first.xpAwarded).toBe(3 * QUIZ_XP.correct + QUIZ_XP.completed)
    expect(second.xpAwarded).toBe(0)
    // Both attempts are kept for revision history; only one ledger row pays.
    expect(localDb.list('quiz_attempts')).toHaveLength(2)
    expect(localDb.list<Row>('xp_ledger')).toEqual([
      expect.objectContaining({ event: 'quiz_completed', source_id: quiz.id, amount: first.xpAwarded }),
    ])
    expect(localDb.get<Row>('profiles', USER)!.xp).toBe(first.xpAwarded)
  })

  it('reports the current figures on a re-take rather than blanks', async () => {
    const first = await quizService.grade(USER, quiz, allRight(), 60)
    const second = await quizService.grade(USER, quiz, new Map(), 60)
    expect(second).toMatchObject({ score: 0, totalXp: first.totalXp, level: first.level })
  })

  it('counts toward the streak once a day', async () => {
    const first = await quizService.grade(USER, quiz, allRight(), 60)
    const second = await quizService.grade(USER, quiz, allRight(), 60)
    expect(first.streak?.patch.current_streak).toBe(1)
    expect(second.streak).toBeNull()
  })
})
