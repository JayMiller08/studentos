// @vitest-environment jsdom
import { subDays } from 'date-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toDateKey } from '@/lib/utils'
import type { Profile } from '@/types/models'

/**
 * How progress is recorded since migration 00016.
 *
 * With Supabase the client only *reports*: every XP, streak and badge change
 * is a call to `record_activity` or `unlock_badge`, and nothing it sends is a
 * number to trust. Without Supabase (demo mode) a local twin applies the same
 * rules to localStorage — pay once per source, cap per day, verify the row.
 * Both halves are pinned here; the SQL itself is probed against Postgres.
 */

const USER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'

const profile = (overrides: Partial<Profile> = {}): Profile =>
  ({
    id: USER,
    email: 'demo@uni.test',
    xp: 0,
    level: 1,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    streak_freezes: 1,
    timezone: 'UTC',
    ...overrides,
  }) as Profile

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

// ── Demo mode: the local twin ───────────────────────────────────────────────

async function demo(start: Partial<Profile> = {}) {
  vi.doMock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
  const service = await import('@/services/gamification-service')
  const { localDb } = await import('@/lib/local-db')
  localDb.insert('profiles', profile(start) as unknown as Record<string, unknown>)
  type Row = { id: string; created_at: string; updated_at: string; [key: string]: unknown }
  const insert = (table: string, values: Record<string, unknown>) => localDb.insert<Row>(table, values)
  const me = () => localDb.get<Row & Profile>('profiles', USER)!
  const ledger = () => localDb.list<Row>('xp_ledger', { filters: [{ column: 'user_id', op: 'eq', value: USER }] })
  return { ...service, localDb, insert, me, ledger }
}

describe('demo mode: record_activity, locally', () => {
  it('pays a finished task once, however often it is re-ticked', async () => {
    const { gamificationService, insert, me, ledger } = await demo()
    const task = insert('tasks', { user_id: USER, title: 'Read', status: 'done' })
    expect((await gamificationService.recordActivity(USER, 'task_completed', task.id)).awarded).toBe(3)
    expect((await gamificationService.recordActivity(USER, 'task_completed', task.id)).awarded).toBe(0)
    expect(me().xp).toBe(3)
    expect(ledger()).toHaveLength(1)
  })

  it('refuses a task that is not done, or not yours', async () => {
    const { gamificationService, insert } = await demo()
    const todo = insert('tasks', { user_id: USER, title: 'Later', status: 'todo' })
    const theirs = insert('tasks', { user_id: OTHER, title: 'Theirs', status: 'done' })
    await expect(gamificationService.recordActivity(USER, 'task_completed', todo.id)).rejects.toThrow(/nothing to record/)
    await expect(gamificationService.recordActivity(USER, 'task_completed', theirs.id)).rejects.toThrow(/nothing to record/)
    await expect(gamificationService.recordActivity(USER, 'task_completed', 'no-such-task')).rejects.toThrow()
  })

  it('stops paying at the daily cap, and still records the rest at 0', async () => {
    const { gamificationService, ACTIVITY_RULES, insert, me, ledger } = await demo()
    const { amount, dailyCap } = ACTIVITY_RULES.task_completed
    let paid = 0
    for (let i = 0; i < dailyCap + 3; i += 1) {
      const task = insert('tasks', { user_id: USER, title: `T${i}`, status: 'done' })
      paid += (await gamificationService.recordActivity(USER, 'task_completed', task.id)).awarded
    }
    expect(paid).toBe(amount * dailyCap)
    expect(me().xp).toBe(amount * dailyCap)
    expect(ledger()).toHaveLength(dailyCap + 3)
  })

  it("does not count yesterday's payouts against today", async () => {
    const { gamificationService, ACTIVITY_RULES, insert } = await demo()
    const yesterday = subDays(new Date(), 1).toISOString()
    for (let i = 0; i < ACTIVITY_RULES.note_created.dailyCap; i += 1) {
      insert('xp_ledger', { user_id: USER, event: 'note_created', source_id: `old-${i}`, amount: 5, created_at: yesterday })
    }
    const note = insert('notes', { user_id: USER, title: 'New' })
    expect((await gamificationService.recordActivity(USER, 'note_created', note.id)).awarded).toBe(5)
  })

  it('moves the streak once a day, and reports it', async () => {
    const { gamificationService, insert, me } = await demo({ current_streak: 4, longest_streak: 4, last_active_date: toDateKey(subDays(new Date(), 1)) })
    const first = await gamificationService.recordActivity(USER, 'task_completed', insert('tasks', { user_id: USER, title: 'a', status: 'done' }).id)
    expect(first.streak?.patch.current_streak).toBe(5)
    const second = await gamificationService.recordActivity(USER, 'task_completed', insert('tasks', { user_id: USER, title: 'b', status: 'done' }).id)
    expect(second.streak).toBeNull()
    expect(me().current_streak).toBe(5)
  })

  it('does not move the streak for an activity that is not studying', async () => {
    const { gamificationService, insert, me } = await demo()
    const note = insert('notes', { user_id: USER, title: 'Graphs' })
    expect((await gamificationService.recordActivity(USER, 'note_created', note.id)).streak).toBeNull()
    expect(me().current_streak).toBe(0)
  })

  it('pays a habit check-in keyed on the habit and the day', async () => {
    const { gamificationService, insert } = await demo()
    const today = toDateKey(new Date())
    const habit = insert('habits', { user_id: USER, name: 'Read' })
    insert('habit_logs', { user_id: USER, habit_id: habit.id, log_date: today })
    expect((await gamificationService.recordActivity(USER, 'habit_completed', `${habit.id}:${today}`)).awarded).toBe(5)
    await expect(gamificationService.recordActivity(USER, 'habit_completed', `${habit.id}:2020-01-01`)).rejects.toThrow()
  })

  it('pays a completed pomodoro against its session, and nothing for an abandoned one', async () => {
    const { gamificationService, insert } = await demo()
    const done = insert('study_sessions', { user_id: USER, minutes: 25 })
    insert('pomodoro_sessions', { user_id: USER, study_session_id: done.id, kind: 'focus', completed: true })
    const quit = insert('study_sessions', { user_id: USER, minutes: 9 })
    insert('pomodoro_sessions', { user_id: USER, study_session_id: quit.id, kind: 'focus', completed: false })
    expect((await gamificationService.recordActivity(USER, 'pomodoro_completed', done.id)).awarded).toBe(5)
    await expect(gamificationService.recordActivity(USER, 'pomodoro_completed', quit.id)).rejects.toThrow()
    // Still studying: the stopped session keeps the streak, at 0 XP.
    const partial = await gamificationService.recordActivity(USER, 'study_session', quit.id)
    expect(partial.awarded).toBe(0)
  })

  it('pays the submission reward only for a submitted assignment', async () => {
    const { gamificationService, insert, localDb } = await demo()
    const essay = insert('assignments', { user_id: USER, title: 'Essay', status: 'in_progress' })
    await expect(gamificationService.recordActivity(USER, 'assignment_submitted', essay.id)).rejects.toThrow()
    localDb.update('assignments', essay.id, { status: 'submitted' })
    expect((await gamificationService.recordActivity(USER, 'assignment_submitted', essay.id)).awarded).toBe(50)
  })
})

describe('demo mode: badges and quizzes, locally', () => {
  it('pays a badge its catalogue reward once', async () => {
    const { gamificationService, me, localDb } = await demo()
    expect(await gamificationService.unlockBadge(USER, 'first-assignment')).toMatchObject({ unlocked: true, awarded: 50 })
    expect(await gamificationService.unlockBadge(USER, 'first-assignment')).toMatchObject({ unlocked: false, awarded: 0 })
    expect(me().xp).toBe(50)
    expect(localDb.list('achievements')).toHaveLength(1)
  })

  it('keys quiz XP on the quiz, so a re-take pays nothing', async () => {
    const { awardXpLocally, me } = await demo()
    expect((await awardXpLocally(USER, 'quiz_completed', 'quiz-1', 39)).awarded).toBe(39)
    expect((await awardXpLocally(USER, 'quiz_completed', 'quiz-1', 47)).awarded).toBe(0)
    expect(me()).toMatchObject({ xp: 39, level: 1 })
  })
})

describe('demo mode: award()', () => {
  it('unlocks Off the Blocks with a first assignment, and both rewards land', async () => {
    const { gamificationService, insert, me } = await demo()
    const essay = insert('assignments', { user_id: USER, title: 'Essay', status: 'not_started' })
    const result = await gamificationService.award(USER, profile(), 'assignment_created', essay.id)
    expect(result.xpGained).toBe(5 + 50)
    expect(result.unlockedBadges.map((badge) => badge.id)).toEqual(['first-assignment'])
    expect(me().xp).toBe(55)
  })

  it('checks the level badges against XP a badge just paid', async () => {
    // 1,550 XP is level 4; +5 for the assignment and +50 for its badge is 1,605: level 5.
    const start = { xp: 1550, level: 4 }
    const { gamificationService, insert } = await demo(start)
    const essay = insert('assignments', { user_id: USER, title: 'Essay', status: 'not_started' })
    const result = await gamificationService.award(USER, profile(start), 'assignment_created', essay.id)
    expect(result.leveledUpTo).toBe(5)
    expect(result.unlockedBadges.map((badge) => badge.id)).toEqual(['first-assignment', 'level-5'])
  })

  it('unlocks Early Bird for a submission with 3+ days to spare', async () => {
    const { gamificationService, BADGES, insert, me } = await demo()
    const essay = insert('assignments', {
      user_id: USER,
      title: 'Essay',
      status: 'submitted',
      due_at: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    })
    const result = await gamificationService.award(USER, profile(), 'assignment_submitted', essay.id)
    expect(result.unlockedBadges.map((badge) => badge.id)).toEqual(['first-submission', 'early-bird'])
    const reward = (id: string) => BADGES.find((badge) => badge.id === id)!.xp_reward
    expect(result.xpGained).toBe(50 + reward('first-submission') + reward('early-bird'))
    expect(me().xp).toBe(result.xpGained)
  })

  it('does not unlock Early Bird for one handed in with less than 3 days to spare', async () => {
    const { gamificationService, insert } = await demo()
    const essay = insert('assignments', {
      user_id: USER,
      title: 'Essay',
      status: 'submitted',
      due_at: new Date(Date.now() + 2.5 * 86_400_000).toISOString(),
    })
    const result = await gamificationService.award(USER, profile(), 'assignment_submitted', essay.id)
    expect(result.unlockedBadges.map((badge) => badge.id)).toEqual(['first-submission'])
  })

  it('pays nothing for a repeat, and unlocks nothing twice', async () => {
    const { gamificationService, insert } = await demo()
    const essay = insert('assignments', { user_id: USER, title: 'Essay', status: 'not_started' })
    await gamificationService.award(USER, profile(), 'assignment_created', essay.id)
    const again = await gamificationService.award(USER, profile({ xp: 55 }), 'assignment_created', essay.id)
    expect(again).toMatchObject({ xpGained: 0, unlockedBadges: [], leveledUpTo: null })
  })
})

// ── With Supabase: the client only reports ──────────────────────────────────

type Call = { kind: 'rpc'; name: string; args: unknown } | { kind: 'from'; table: string; op: string }

async function connected(rows: Record<string, unknown[]>, tables: Record<string, unknown[]> = {}) {
  const calls: Call[] = []
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ kind: 'rpc', name, args })
      return { data: rows[name] ?? [], error: null }
    },
    from: (table: string) => {
      const record = (op: string) => () => {
        calls.push({ kind: 'from', table, op })
        return builder
      }
      const builder: Record<string, unknown> = {
        select: record('select'),
        insert: record('insert'),
        update: record('update'),
        upsert: record('upsert'),
        delete: record('delete'),
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: tables[table] ?? [], count: (tables[table] ?? []).length, error: null }),
      }
      return builder
    },
  }
  vi.doMock('@/lib/supabase', () => ({ supabase: client, isSupabaseConfigured: true }))
  const service = await import('@/services/gamification-service')
  return { ...service, calls }
}

const activityRow = (overrides: Record<string, unknown> = {}) => ({
  awarded: 3,
  total_xp: 3,
  new_level: 1,
  streak: 1,
  best_streak: 1,
  freezes: 1,
  active_on: '2026-10-07',
  used_freeze: false,
  earned_freeze: false,
  streak_changed: true,
  ...overrides,
})

describe('with Supabase', () => {
  it('reports a finished task through record_activity and writes nothing itself', async () => {
    const { gamificationService, calls } = await connected({ record_activity: [activityRow()] })
    const result = await gamificationService.award(USER, profile(), 'task_completed', 'task-1')
    expect(calls.filter((call) => call.kind === 'rpc')).toEqual([
      { kind: 'rpc', name: 'record_activity', args: { p_event: 'task_completed', p_source_id: 'task-1' } },
    ])
    // Reads only: no insert, update or upsert anywhere, and the profile is
    // never touched — the database moved the XP and the streak.
    expect(calls.filter((call) => call.kind === 'from' && call.op !== 'select')).toEqual([])
    expect(calls.some((call) => call.kind === 'from' && call.table === 'profiles')).toBe(false)
    expect(result.xpGained).toBe(3)
  })

  it("passes the server's streak report on in the shape announceStreak reads", async () => {
    const { gamificationService } = await connected({
      record_activity: [activityRow({ streak: 13, best_streak: 21, freezes: 1, used_freeze: true })],
    })
    const result = await gamificationService.recordActivity(USER, 'task_completed', 'task-1')
    expect(result.streak).toEqual({
      patch: { current_streak: 13, longest_streak: 21, last_active_date: '2026-10-07', streak_freezes: 1 },
      usedFreeze: true,
      earnedFreeze: false,
    })
  })

  it('reports no streak change when the server says the day was already counted', async () => {
    const { gamificationService } = await connected({ record_activity: [activityRow({ streak_changed: false })] })
    expect((await gamificationService.recordActivity(USER, 'task_completed', 'task-1')).streak).toBeNull()
  })

  it('asks the database for a badge rather than inserting one', async () => {
    const { gamificationService, calls } = await connected({
      record_activity: [activityRow({ awarded: 5, total_xp: 5, streak_changed: false })],
      unlock_badge: [{ unlocked: true, awarded: 50, total_xp: 55, new_level: 1 }],
    })
    const result = await gamificationService.award(USER, profile(), 'assignment_created', 'essay-1')
    expect(calls).toContainEqual({ kind: 'rpc', name: 'unlock_badge', args: { p_badge_id: 'first-assignment' } })
    expect(calls.some((call) => call.kind === 'from' && call.table === 'achievements' && call.op === 'insert')).toBe(false)
    expect(result).toMatchObject({ xpGained: 55, unlockedBadges: [expect.objectContaining({ id: 'first-assignment' })] })
  })

  it('does not ask again for a badge already held', async () => {
    const { gamificationService, calls } = await connected(
      { record_activity: [activityRow({ awarded: 5, streak_changed: false })] },
      { achievements: [{ id: 'a1', user_id: USER, badge_id: 'first-assignment' }] },
    )
    await gamificationService.award(USER, profile(), 'assignment_created', 'essay-1')
    expect(calls.some((call) => call.kind === 'rpc' && call.name === 'unlock_badge')).toBe(false)
  })

  it('announces a level-up from the level the server reports', async () => {
    const { gamificationService } = await connected(
      {
        record_activity: [activityRow({ awarded: 5, total_xp: 1605, new_level: 5, streak_changed: false })],
        unlock_badge: [{ unlocked: true, awarded: 0, total_xp: 1605, new_level: 5 }],
      },
    )
    const result = await gamificationService.award(USER, profile({ xp: 1600, level: 4 }), 'note_created', 'note-1')
    expect(result.leveledUpTo).toBe(5)
  })
})
