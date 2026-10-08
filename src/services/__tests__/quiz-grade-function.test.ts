import { beforeEach, describe, expect, it, vi } from 'vitest'
// The fakes first: nothing later in the import chain may reach supabase-js
// before `fakeSupabase` is bound.
import { FAKE_TODAY, type FakeStore, fakeSupabase, installDeno, post } from '@/test/edge-fakes'
import { QUIZ_XP } from '@/services/gamification-service'

/**
 * The grading Edge Function, executed.
 *
 * `quiz-grade` is the only writer of scores and quiz XP, so it is the one piece
 * of code standing between a student and a forged result. Each case below is
 * either something a student could send by hand or a mistake that would quietly
 * mis-mark every attempt in production.
 */

// Hoisted with the mock below, so it exists even if a client is built while
// the imports are still loading.
const store = vi.hoisted((): FakeStore => ({ tables: {}, tokens: {}, rpcCalls: [] }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: Parameters<ReturnType<typeof fakeSupabase>>) => fakeSupabase(store)(...args),
}))

const ALICE = 'user-alice'
const BOB = 'user-bob'
const QUIZ = 'quiz-1'
const BOSS = 'quiz-boss'

const deno = installDeno({
  SUPABASE_URL: 'https://project.test',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
})

// A variable, not a literal: tsc would otherwise follow the import into Deno
// code it has no types for. Vitest resolves it at runtime either way.
const FUNCTION_PATH = '../../../supabase/functions/quiz-grade/index.ts'

async function handler() {
  if (!deno.handler) await import(/* @vite-ignore */ FUNCTION_PATH)
  return deno.handler!
}

/** `null` sends no token at all. Not `undefined`: that would take the default. */
async function grade(body: unknown, token: string | null = 'alice-jwt', method = 'POST') {
  const response = await (await handler())(post(body, token ?? undefined, method))
  const text = await response.text()
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = null
  }
  return { status: response.status, json, text }
}

beforeEach(() => {
  store.tables = {
    profiles: [
      { id: ALICE, plan: 'free', xp: 100, level: 2 },
      { id: BOB, plan: 'pro', xp: 0, level: 1 },
    ],
    quizzes: [
      { id: QUIZ, user_id: ALICE, kind: 'practice' },
      { id: BOSS, user_id: ALICE, kind: 'boss' },
    ],
    quiz_questions: [
      { id: 'q1', quiz_id: QUIZ, ordinal: 0, correct_index: 1, explanation: 'one' },
      { id: 'q2', quiz_id: QUIZ, ordinal: 1, correct_index: 0, explanation: 'two' },
      { id: 'q3', quiz_id: QUIZ, ordinal: 2, correct_index: 2, explanation: 'three' },
      ...[0, 1, 2, 3, 4].map((n) => ({ id: `b${n}`, quiz_id: BOSS, ordinal: n, correct_index: 0, explanation: null })),
    ],
    quiz_attempts: [],
    quiz_answers: [],
    xp_ledger: [],
  }
  store.tokens = { 'alice-jwt': ALICE, 'bob-jwt': BOB }
  store.rpcCalls = []
  store.failInsertInto = undefined
  store.failRpc = undefined
})

const answers = (picks: Record<string, unknown>) =>
  Object.entries(picks).map(([questionId, chosenIndex]) => ({ questionId, chosenIndex }))

describe('quiz-grade: the request boundary', () => {
  it('answers a CORS preflight', async () => {
    const result = await grade(undefined, null, 'OPTIONS')
    expect(result.status).toBe(200)
  })

  it('refuses anything but POST', async () => {
    expect((await grade(undefined, 'alice-jwt', 'GET')).status).toBe(405)
  })

  it('rejects a missing or forged token before touching any data', async () => {
    expect((await grade({ quizId: QUIZ }, null)).status).toBe(401)
    expect((await grade({ quizId: QUIZ }, 'forged-jwt')).status).toBe(401)
    expect(store.tables.quiz_attempts).toHaveLength(0)
  })

  it('rejects a body that is not JSON', async () => {
    expect((await grade('{not json')).status).toBe(400)
  })

  it('rejects a request with no quiz', async () => {
    expect((await grade({ answers: [] })).status).toBe(400)
  })

  it("will not grade someone else's quiz, and says so the same way as a missing one", async () => {
    const theirs = await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) }, 'bob-jwt')
    const missing = await grade({ quizId: 'no-such-quiz' }, 'bob-jwt')
    expect(theirs.status).toBe(404)
    // Identical responses, so the endpoint cannot be used to probe quiz ids.
    expect(theirs.text).toBe(missing.text)
    expect(store.tables.quiz_attempts).toHaveLength(0)
    expect(store.rpcCalls).toHaveLength(0)
  })

  it('grades a Free-plan student — being marked is not a Pro feature', async () => {
    expect((await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) })).status).toBe(200)
  })
})

describe('quiz-grade: marking', () => {
  it('marks against the answer key and pays per correct answer', async () => {
    const { status, json } = await grade({ quizId: QUIZ, answers: answers({ q1: 1, q2: 3, q3: 2 }) })
    expect(status).toBe(200)
    expect(json).toMatchObject({ score: 2, total: 3, defeatedBoss: false })
    expect(json!.xpAwarded).toBe(2 * QUIZ_XP.correct + QUIZ_XP.completed)
    // The answer key comes back only now, after marking.
    expect(json!.answers).toEqual([
      expect.objectContaining({ questionId: 'q1', chosenIndex: 1, correctIndex: 1, correct: true }),
      expect.objectContaining({ questionId: 'q2', chosenIndex: 3, correctIndex: 0, correct: false }),
      expect.objectContaining({ questionId: 'q3', chosenIndex: 2, correctIndex: 2, correct: true }),
    ])
  })

  it('counts an omitted question as wrong instead of dropping it from the total', async () => {
    // Submitting only the one you are sure of must not score 100%.
    const { json } = await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) })
    expect(json).toMatchObject({ score: 1, total: 3 })
  })

  it('ignores answers to questions that are not in this quiz', async () => {
    const { json } = await grade({
      quizId: QUIZ,
      answers: [...answers({ q1: 1 }), { questionId: 'b0', chosenIndex: 0 }, { questionId: 'made-up', chosenIndex: 0 }],
    })
    expect(json).toMatchObject({ score: 1, total: 3 })
  })

  it('treats malformed choices as unanswered rather than crashing or matching', async () => {
    const { status, json } = await grade({
      quizId: QUIZ,
      answers: answers({ q1: '1', q2: -1, q3: 2.5 }),
    })
    expect(status).toBe(200)
    expect(json).toMatchObject({ score: 0, total: 3 })
    const picks = (json!.answers as Array<{ chosenIndex: unknown }>).map((answer) => answer.chosenIndex)
    expect(picks).toEqual([null, null, null])
  })

  it('survives a non-array answers field', async () => {
    const { status, json } = await grade({ quizId: QUIZ, answers: 'all of them' })
    expect(status).toBe(200)
    expect(json).toMatchObject({ score: 0, total: 3 })
  })

  it('defeats a boss at 80% and not below', async () => {
    const beaten = await grade({ quizId: BOSS, answers: answers({ b0: 0, b1: 0, b2: 0, b3: 0, b4: 1 }) })
    expect(beaten.json).toMatchObject({ score: 4, total: 5, defeatedBoss: true })
    expect(beaten.json!.xpAwarded).toBe(4 * QUIZ_XP.correct + QUIZ_XP.completed + QUIZ_XP.boss)
  })

  it('does not defeat a boss at 60%', async () => {
    const { json } = await grade({ quizId: BOSS, answers: answers({ b0: 0, b1: 0, b2: 0 }) })
    expect(json).toMatchObject({ score: 3, total: 5, defeatedBoss: false })
  })
})

describe('quiz-grade: XP and records', () => {
  it('awards through award_xp, keyed on the quiz so only the first pass pays', async () => {
    await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) })
    expect(store.rpcCalls[0]).toEqual({
      name: 'award_xp',
      args: expect.objectContaining({
        p_user_id: ALICE,
        p_event: 'quiz_completed',
        // The quiz id, not an attempt id: a new attempt must not be a new payout.
        p_source_id: QUIZ,
      }),
    })
  })

  it('pays nothing for a re-take, but still records the score', async () => {
    const first = await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) })
    const second = await grade({ quizId: QUIZ, answers: answers({ q1: 1, q2: 0, q3: 2 }) })
    expect(first.json!.xpAwarded).toBeGreaterThan(0)
    expect(second.json).toMatchObject({ score: 3, xpAwarded: 0 })
    expect(store.tables.quiz_attempts).toHaveLength(2)
    expect(store.tables.quiz_attempts![1]).toMatchObject({ score: 3, total: 3, xp_awarded: 0 })
  })

  it('stores the attempt against the caller, whatever the body claims', async () => {
    await grade({ quizId: QUIZ, user_id: BOB, userId: BOB, answers: answers({ q1: 1 }) })
    expect(store.tables.quiz_attempts![0]).toMatchObject({ user_id: ALICE, quiz_id: QUIZ })
  })

  it('writes one answer row per question for the review screen', async () => {
    await grade({ quizId: QUIZ, answers: answers({ q1: 1, q2: 0 }) })
    expect(store.tables.quiz_answers).toHaveLength(3)
    expect(store.tables.quiz_answers!.map((row) => row.correct)).toEqual([true, true, false])
  })

  it.each([
    [1_000_000_000, 86_400],
    [-30, 0],
    ['soon', 0],
    [42.6, 43],
  ])('clamps a reported duration of %s to %s seconds', async (reported, stored) => {
    await grade({ quizId: QUIZ, durationSeconds: reported, answers: answers({ q1: 1 }) })
    expect(store.tables.quiz_attempts![0]!.duration_seconds).toBe(stored)
  })

  it('reports a failure to save rather than claiming a score it did not record', async () => {
    store.failInsertInto = 'quiz_attempts'
    const { status, json } = await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) })
    expect(status).toBe(502)
    expect(json).toEqual({ error: 'Could not record your score.' })
  })
})

describe('quiz-grade: the streak', () => {
  it('counts a graded quiz toward the streak, after the score is saved', async () => {
    const { status, json } = await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) })
    expect(status).toBe(200)
    expect(store.rpcCalls.map((call) => call.name)).toEqual(['award_xp', 'touch_streak'])
    // The caller's id from the verified JWT, never anything in the body.
    expect(store.rpcCalls[1]!.args).toEqual({ p_user_id: ALICE })
    expect(json!.streak).toEqual({
      patch: { current_streak: 1, longest_streak: 1, last_active_date: FAKE_TODAY, streak_freezes: 1 },
      usedFreeze: false,
      earnedFreeze: false,
    })
  })

  it('reports no change when today was already counted', async () => {
    Object.assign(store.tables.profiles![0]!, { current_streak: 4, longest_streak: 9, last_active_date: FAKE_TODAY })
    const { json } = await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) })
    expect(json!.streak).toBeNull()
  })

  it('still returns the grade when the streak cannot be moved', async () => {
    store.failRpc = 'touch_streak'
    const { status, json } = await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) })
    expect(status).toBe(200)
    expect(json).toMatchObject({ score: 1, total: 3, streak: null })
    expect(json!.xpAwarded).toBeGreaterThan(0)
    expect(store.tables.quiz_attempts).toHaveLength(1)
  })

  it('does not count a day for a grade it refused', async () => {
    const { status } = await grade({ quizId: QUIZ, answers: answers({ q1: 1 }) }, 'bob-jwt')
    expect(status).toBe(404)
    expect(store.rpcCalls).toHaveLength(0)
  })
})
