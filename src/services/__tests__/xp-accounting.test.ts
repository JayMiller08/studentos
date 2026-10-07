// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { questBonus } from '@/features/quests/quest-status'
import { localDb } from '@/lib/local-db'
import {
  ACTIVITY_RULES,
  BADGES,
  gamificationService,
  levelForXp,
  QUIZ_XP,
} from '@/services/gamification-service'
import { questService } from '@/services/quest-service'
import { quizService } from '@/services/quiz-service'
import type { Profile, Quiz } from '@/types/models'

/**
 * The XP a student is shown is the XP they are paid.
 *
 * A week of work runs through demo mode, which keeps the server's books on
 * localStorage under the same rules, and the totals are checked from first
 * principles: the profile moves by exactly what the ledger records, the level
 * is the curve's, an XP quest counts what was earned but not its own bonus,
 * and a claim pays the bonus its card showed. The report that started this:
 * a card that read "Earn 150 XP", and a claim that paid 50.
 * (vitest.config.ts blanks the Supabase env, so this is demo mode.)
 */

const USER = '00000000-0000-4000-8000-000000000001'
/** Wednesday 7 October 2026, local noon: week 144, when the XP quest is on the board. */
const WEDNESDAY = new Date(2026, 9, 7, 12)
const DAY_MS = 86_400_000

type Row = { id: string; created_at: string; updated_at: string; [key: string]: unknown }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(WEDNESDAY)
  localStorage.clear()
  localDb.insert('profiles', {
    id: USER,
    xp: 0,
    level: 1,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    streak_freezes: 1,
    timezone: 'UTC',
  })
})

afterEach(() => {
  vi.useRealTimers()
})

const insert = (table: string, values: Record<string, unknown>) => localDb.insert<Row>(table, values)
const me = () => localDb.get<Row & Profile>('profiles', USER)!
const ledger = () => localDb.list<Row>('xp_ledger', { filters: [{ column: 'user_id', op: 'eq', value: USER }] })
const ledgerTotal = () => ledger().reduce((sum, row) => sum + Number(row.amount), 0)

/** The books balance: the profile is the ledger, and the level is the curve's. */
function expectBalanced() {
  expect(me().xp).toBe(ledgerTotal())
  expect(me().level).toBe(levelForXp(me().xp))
}

/** A three-question quiz and the answers that get all of it right. */
function quizOfThree() {
  const quiz = insert('quizzes', { user_id: USER, title: 'Graphs', source: 'note', kind: 'practice', question_count: 3 })
  const answers = new Map<string, number | null>()
  for (const [ordinal, correct] of [1, 0, 2].entries()) {
    const question = insert('quiz_questions', {
      quiz_id: quiz.id,
      ordinal,
      prompt: `Q${ordinal}`,
      options: ['a', 'b', 'c'],
      correct_index: correct,
      explanation: null,
    })
    answers.set(question.id, correct)
  }
  return { quiz: quiz as unknown as Quiz, answers }
}

describe('a week of XP, in demo mode', () => {
  it('adds up, from the first task to the quest bonus', async () => {
    // A task, ticked twice, pays once.
    const task = insert('tasks', { user_id: USER, title: 'Read chapter 4', status: 'done' })
    expect((await gamificationService.recordActivity(USER, 'task_completed', task.id)).awarded).toBe(
      ACTIVITY_RULES.task_completed.amount,
    )
    expect((await gamificationService.recordActivity(USER, 'task_completed', task.id)).awarded).toBe(0)
    expectBalanced()

    // A first assignment, and the badge it unlocks.
    const essay = insert('assignments', {
      user_id: USER,
      title: 'Essay',
      status: 'not_started',
      due_at: new Date(Date.now() + 10 * DAY_MS).toISOString(),
    })
    await gamificationService.award(USER, me(), 'assignment_created', essay.id)
    expectBalanced()

    // A quiz pays its first pass; the re-take pays nothing.
    const { quiz, answers } = quizOfThree()
    const first = await quizService.grade(USER, quiz, answers, 60)
    const retake = await quizService.grade(USER, quiz, answers, 60)
    expect(first.xpAwarded).toBe(3 * QUIZ_XP.correct + QUIZ_XP.completed)
    expect(retake.xpAwarded).toBe(0)
    expectBalanced()

    // Handed in ten days early: the reward, First Submission and Early Bird.
    localDb.update('assignments', essay.id, { status: 'submitted' })
    const submitted = await gamificationService.award(USER, me(), 'assignment_submitted', essay.id)
    expect(submitted.unlockedBadges.map((badge) => badge.id)).toEqual(['first-submission', 'early-bird'])
    expectBalanced()

    // Everything so far was earned studying, and the XP quest counts all of it.
    const earned = ledgerTotal()
    const card = (await questService.board(USER)).find((quest) => quest.id === 'xp-150')!
    expect(card.progress).toBe(earned)
    expect(card.progress).toBeGreaterThanOrEqual(card.target)

    // The claim pays the bonus the card showed, not the goal.
    const claim = await questService.claim(USER, card.id)
    expect(claim.awarded).toBe(card.reward)
    expect(questBonus(card)).toBe(`+${claim.awarded} XP bonus`)
    expect(claim.totalXp).toBe(earned + card.reward)
    expectBalanced()

    // And the bonus is not counted towards the quest that paid it.
    expect((await questService.board(USER)).find((quest) => quest.id === card.id)!.progress).toBe(earned)
  })

  it('pays the catalogue amount for every badge and activity, and nothing else', async () => {
    const paidFor = (event: string, sourceId: string) =>
      ledger().find((row) => row.event === event && row.source_id === sourceId)?.amount

    const note = insert('notes', { user_id: USER, title: 'Dijkstra' })
    await gamificationService.award(USER, me(), 'note_created', note.id)
    expect(paidFor('note_created', note.id)).toBe(ACTIVITY_RULES.note_created.amount)

    for (const badge of BADGES) {
      await gamificationService.unlockBadge(USER, badge.id)
      expect(paidFor('badge_unlocked', badge.id), badge.id).toBe(badge.xp_reward)
    }
    expectBalanced()
  })
})
