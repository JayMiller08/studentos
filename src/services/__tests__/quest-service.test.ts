// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { questsForWeek, questWeek } from '@/lib/quests'

/**
 * Quests through the service. Demo mode counts and pays locally, with the same
 * three refusals as claim_quest(); with Supabase the service only relays — the
 * board and every claim come from the database.
 */

const USER = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

async function demo() {
  vi.doMock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
  const { questService, claimKey } = await import('@/services/quest-service')
  const { localDb } = await import('@/lib/local-db')
  localDb.insert('profiles', { id: USER, xp: 100, level: 2, current_streak: 0, longest_streak: 0, last_active_date: null })
  return { questService, claimKey, localDb }
}

const thisWeek = questsForWeek(questWeek().index)
const inWeek = (hours: number) => new Date(questWeek().start.getTime() + hours * 3_600_000).toISOString()

/** Rows that finish a quest, written as the server would have written them. */
function finish(localDb: Awaited<ReturnType<typeof demo>>['localDb'], metric: string, target: number) {
  const ledger = (event: string, amount: number, i: number) =>
    localDb.insert('xp_ledger', { user_id: USER, event, source_id: `${event}-${i}`, amount, created_at: inWeek(i * 24 % 160 + 1) })
  const attempt = (quizId: string, score: number, total: number, submitted_at: string) =>
    localDb.insert('quiz_attempts', { user_id: USER, quiz_id: quizId, score, total, submitted_at })
  for (let i = 0; i < target; i += 1) {
    if (metric === 'study_days') ledger('task_completed', 3, i)
    if (metric === 'pomodoros') ledger('pomodoro_completed', 5, i)
    if (metric === 'tasks') ledger('task_completed', 3, i)
    if (metric === 'habit_checkins') ledger('habit_completed', 5, i)
    if (metric === 'submissions') ledger('assignment_submitted', 50, i)
    if (metric === 'quiz_attempts') attempt('q', 1, 4, inWeek(i + 1))
  }
  if (metric === 'xp_earned') ledger('assignment_submitted', target, 0)
  if (metric === 'quiz_score_80') attempt('q', 4, 5, inWeek(1))
  if (metric === 'boss_defeated') {
    localDb.insert('quizzes', { id: 'boss', user_id: USER, kind: 'boss', title: 'Boss' })
    attempt('boss', 5, 5, inWeek(1))
  }
  if (metric === 'quiz_revised') {
    attempt('old', 1, 4, new Date(questWeek().start.getTime() - 9 * 86_400_000).toISOString())
    attempt('old', 3, 4, inWeek(1))
  }
}

describe('demo mode', () => {
  it("shows this week's three quests, unclaimed, from nothing", async () => {
    const { questService } = await demo()
    const board = await questService.board(USER)
    expect(board.map((quest) => quest.id)).toEqual(thisWeek.map((quest) => quest.id))
    expect(board.every((quest) => quest.progress === 0 && !quest.claimed)).toBe(true)
    expect(board[0]!.weekStart).toBe(questWeek().key)
  })

  it('refuses a claim until the quest is done', async () => {
    const { questService } = await demo()
    await expect(questService.claim(USER, thisWeek[0]!.id)).rejects.toThrow(/Not done yet: 0 of/)
  })

  it('refuses a quest from another week, and one that does not exist', async () => {
    const { questService } = await demo()
    const elsewhere = questsForWeek(questWeek().index + 1).find((quest) => !thisWeek.some((q) => q.id === quest.id))!
    await expect(questService.claim(USER, elsewhere.id)).rejects.toThrow(/not on this week's board/)
    await expect(questService.claim(USER, 'free-xp')).rejects.toThrow(/Unknown quest/)
  })

  it.each(thisWeek.map((quest) => [quest.id, quest] as const))(
    'pays "%s" once it is done, and only once',
    async (_id, quest) => {
      const { questService, claimKey, localDb } = await demo()
      finish(localDb, quest.metric, quest.target)
      expect((await questService.board(USER)).find((entry) => entry.id === quest.id)!.progress).toBeGreaterThanOrEqual(
        quest.target,
      )
      expect(await questService.claim(USER, quest.id)).toMatchObject({ claimed: true, awarded: quest.reward, totalXp: 100 + quest.reward })
      expect(await questService.claim(USER, quest.id)).toMatchObject({ claimed: false, awarded: 0 })
      expect((await questService.board(USER)).find((entry) => entry.id === quest.id)!.claimed).toBe(true)
      const history = await questService.history(USER)
      expect(history.map((row) => row.source_id)).toEqual([claimKey(questWeek().key, quest.id)])
    },
  )

  it("does not count last week's activity", async () => {
    const { questService, localDb } = await demo()
    const lastWeek = new Date(questWeek().start.getTime() - 3_600_000).toISOString()
    for (let i = 0; i < 30; i += 1) {
      localDb.insert('xp_ledger', { user_id: USER, event: 'task_completed', source_id: `t${i}`, amount: 3, created_at: lastWeek })
    }
    expect((await questService.board(USER)).every((quest) => quest.progress === 0)).toBe(true)
  })
})

describe('with Supabase', () => {
  async function connected(rpc: (name: string, args: unknown) => { data: unknown; error: unknown }) {
    const calls: Array<{ name: string; args: unknown }> = []
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args })
        return rpc(name, args)
      },
    }
    vi.doMock('@/lib/supabase', () => ({ supabase: client, isSupabaseConfigured: true }))
    const { questService } = await import('@/services/quest-service')
    return { questService, calls }
  }

  it('reads the board from quest_board() and sends nothing of its own', async () => {
    const { questService, calls } = await connected(() => ({
      data: [
        { quest_id: 'xp-150', slot: 2, title: 'Reach 150 XP this week', description: 'd', target: 150, reward: 50, progress: 162, claimed: false, week_start: '2026-10-05' },
      ],
      error: null,
    }))
    expect(await questService.board(USER)).toEqual([
      { id: 'xp-150', slot: 2, title: 'Reach 150 XP this week', description: 'd', target: 150, reward: 50, progress: 162, claimed: false, weekStart: '2026-10-05' },
    ])
    expect(calls).toEqual([{ name: 'quest_board', args: {} }])
  })

  it('claims with the quest id alone', async () => {
    const { questService, calls } = await connected(() => ({
      data: [{ claimed: true, awarded: 50, total_xp: 2530, new_level: 6 }],
      error: null,
    }))
    expect(await questService.claim(USER, 'xp-150')).toEqual({ claimed: true, awarded: 50, totalXp: 2530, level: 6 })
    expect(calls).toEqual([{ name: 'claim_quest', args: { p_quest_id: 'xp-150' } }])
  })

  it("turns the server's refusal into its sentence", async () => {
    const { questService } = await connected(() => ({
      data: null,
      error: { message: 'Not done yet: 4 of 5.', code: '22023' },
    }))
    await expect(questService.claim(USER, 'study-5-days')).rejects.toThrow(/^Not done yet: 4 of 5\.$/)
  })

  it('keeps any other database failure a database error, never a raw sentence', async () => {
    const { questService } = await connected(() => ({
      data: null,
      error: { message: 'permission denied for function claim_quest', code: '42501' },
    }))
    const { DbError } = await import('@/services/db')
    await expect(questService.claim(USER, 'xp-150')).rejects.toBeInstanceOf(DbError)
  })
})
