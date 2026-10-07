// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { questsForWeek, questWeek } from '@/lib/quests'
import { SQUAD_MESSAGES } from '@/lib/squads'
import { toDateKey } from '@/lib/utils'

/**
 * Squads through the service. Demo mode keeps 00020's rules on localStorage —
 * the same refusals in the same words, the same hand-over when an owner goes —
 * and with Supabase the service only relays: the client sends a code, a handle
 * or a name, never a number and never another student's id.
 */

const user = (n: string) => `00000000-0000-4000-8000-00000000000${n}`
const A = user('a')
const B = user('b')
const C = user('c')
const D = user('d')
const E = user('e')
const F = user('f')
const G = user('g')

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

async function demo() {
  vi.doMock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
  const { squadService } = await import('@/services/squad-service')
  const { localDb } = await import('@/lib/local-db')
  for (const id of [A, B, C, D, E, F, G]) {
    localDb.insert('profiles', { id, xp: 0, level: 1, current_streak: 0, longest_streak: 0, last_active_date: null, streak_freezes: 1 })
  }
  return { squadService, localDb }
}

describe('demo mode', () => {
  it('starts a squad with its owner in it', async () => {
    const { squadService } = await demo()
    const { joinCode } = await squadService.create(A, '  Graph   Crew ', 'ayanda')
    expect(joinCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
    expect(await squadService.mine(A)).toMatchObject({ name: 'Graph Crew', role: 'owner', handle: 'ayanda', memberCount: 1, joinCode })
    expect(await squadService.mine(B)).toBeNull()
  })

  it('refuses a second squad, a bad name and a bad handle, in the database’s words', async () => {
    const { squadService } = await demo()
    await squadService.create(A, 'Graphs', 'ayanda')
    await expect(squadService.create(A, 'Again', 'ayanda')).rejects.toThrow(SQUAD_MESSAGES.alreadyInToStart)
    await expect(squadService.create(B, 'x', 'bongani')).rejects.toThrow(SQUAD_MESSAGES.name)
    await expect(squadService.create(B, 'Stats', 'b!')).rejects.toThrow(SQUAD_MESSAGES.handle)
  })

  it('joins with a code typed any way, up to six, then refuses with the full sentence', async () => {
    const { squadService } = await demo()
    const { joinCode } = await squadService.create(A, 'Graphs', 'ayanda')
    const messy = `${joinCode.slice(0, 4).toLowerCase()}-${joinCode.slice(4)}`
    expect(await squadService.join(B, messy, 'bongani')).toMatchObject({ name: 'Graphs' })
    for (const [who, handle] of [[C, 'chloe'], [D, 'dumi'], [E, 'emma'], [F, 'fezile']] as const) {
      await squadService.join(who, joinCode, handle)
    }
    expect((await squadService.mine(A))!.memberCount).toBe(6)
    await expect(squadService.join(G, joinCode, 'gugu')).rejects.toThrow(SQUAD_MESSAGES.full)
  })

  it('keeps handles unique in a squad, ignoring case', async () => {
    const { squadService } = await demo()
    const { joinCode } = await squadService.create(A, 'Graphs', 'ayanda')
    await expect(squadService.join(B, joinCode, 'AYANDA')).rejects.toThrow(SQUAD_MESSAGES.handleTaken('AYANDA'))
  })

  it('counts wrong codes and stops at ten an hour', async () => {
    const { squadService, localDb } = await demo()
    const { joinCode } = await squadService.create(A, 'Graphs', 'ayanda')
    for (let i = 0; i < 10; i += 1) {
      await expect(squadService.join(B, 'ZZZZZZZZ', 'bongani')).rejects.toThrow(SQUAD_MESSAGES.wrongCode)
    }
    await expect(squadService.join(B, joinCode, 'bongani')).rejects.toThrow(SQUAD_MESSAGES.tooManyWrong)
    // An hour on, the misses no longer count.
    for (const row of localDb.list<{ id: string; created_at: string; updated_at: string }>('squad_join_failures')) {
      localDb.update('squad_join_failures', row.id, { at: new Date(Date.now() - 2 * 3_600_000).toISOString() })
    }
    expect(await squadService.join(B, joinCode, 'bongani')).toMatchObject({ name: 'Graphs' })
  })

  it('hands the squad to the longest-standing member when the owner leaves, and closes it when the last goes', async () => {
    const { squadService, localDb } = await demo()
    const { joinCode, squadId } = await squadService.create(A, 'Graphs', 'ayanda')
    await squadService.join(B, joinCode, 'bongani')
    await squadService.join(C, joinCode, 'chloe')
    await squadService.leave(A)
    expect(await squadService.mine(A)).toBeNull()
    expect((await squadService.mine(B))!.role).toBe('owner')
    await squadService.leave(B)
    await squadService.leave(C)
    expect(localDb.get('squads', squadId)).toBeNull()
    await expect(squadService.leave(C)).rejects.toThrow(SQUAD_MESSAGES.notInSquad)
  })

  it('lets only the owner remove, rename and change the code', async () => {
    const { squadService } = await demo()
    const { joinCode } = await squadService.create(A, 'Graphs', 'ayanda')
    await squadService.join(B, joinCode, 'bongani')
    await squadService.join(C, joinCode, 'chloe')
    await expect(squadService.remove(B, 'chloe')).rejects.toThrow(SQUAD_MESSAGES.ownerOnly)
    await expect(squadService.rename(B, 'Mine')).rejects.toThrow(SQUAD_MESSAGES.ownerOnly)
    await expect(squadService.newCode(B)).rejects.toThrow(SQUAD_MESSAGES.ownerOnly)
    await expect(squadService.remove(A, 'ayanda')).rejects.toThrow(SQUAD_MESSAGES.removeSelf)
    await expect(squadService.remove(A, 'nobody')).rejects.toThrow(SQUAD_MESSAGES.noSuchHandle)

    await squadService.remove(A, 'CHLOE')
    expect(await squadService.mine(C)).toBeNull()
    expect(await squadService.rename(A, '  Graph   Theory ')).toBe('Graph Theory')

    const fresh = await squadService.newCode(A)
    expect(fresh).not.toBe(joinCode)
    await expect(squadService.join(C, joinCode, 'chloe')).rejects.toThrow(SQUAD_MESSAGES.wrongCode)
    expect(await squadService.join(C, fresh, 'chloe')).toMatchObject({ name: 'Graph Theory' })
  })

  it("builds the table from each member's own week, as squad_board() does", async () => {
    const { squadService, localDb } = await demo()
    const { joinCode } = await squadService.create(A, 'Graphs', 'ayanda')
    await squadService.join(B, joinCode, 'bongani')
    const week = questWeek()
    const inWeek = new Date(week.start.getTime() + 3_600_000).toISOString()
    const lastWeek = new Date(week.start.getTime() - 1000).toISOString()
    const pay = (user_id: string, event: string, source_id: string, amount: number, created_at: string) =>
      localDb.insert('xp_ledger', { user_id, event, source_id, amount, created_at })
    pay(B, 'quiz_completed', 'q1', 39, inWeek)
    pay(B, 'quest_claimed', `${week.key}:${questsForWeek(week.index)[0]!.id}`, 75, inWeek)
    pay(B, 'task_completed', 'old', 3, lastWeek)
    pay(A, 'task_completed', 't1', 3, inWeek)
    localDb.update('profiles', B, { current_streak: 6, last_active_date: toDateKey(new Date()) })

    const board = await squadService.board(B)
    expect(board.map((row) => row.handle)).toEqual(['bongani', 'ayanda'])
    expect(board[0]).toEqual({
      handle: 'bongani',
      isMe: true,
      role: 'member',
      weeklyXp: 39 + 75,
      streak: 6,
      questsClaimed: [questsForWeek(week.index)[0]!.id],
    })
    expect(board[1]).toMatchObject({ handle: 'ayanda', isMe: false, role: 'owner', weeklyXp: 3, streak: 0, questsClaimed: [] })
    expect(await squadService.board(G)).toEqual([])
  })

  it("reads a made-up squad mate's week from the row", async () => {
    const { squadService, localDb } = await demo()
    const { squadId } = await squadService.create(A, 'Graphs', 'ayanda')
    localDb.insert('squad_members', {
      squad_id: squadId,
      user_id: 'demo-peer',
      handle: 'thandi_m',
      role: 'member',
      joined_at: new Date().toISOString(),
      demo_weekly_xp: 240,
      demo_streak: 9,
      demo_quests: 2,
    })
    const [top] = await squadService.board(A)
    expect(top).toMatchObject({ handle: 'thandi_m', weeklyXp: 240, streak: 9 })
    expect(top!.questsClaimed).toHaveLength(2)
  })
})

describe('with Supabase', () => {
  async function connected(reply: (name: string, args: unknown) => { data: unknown; error: unknown }) {
    const calls: Array<{ name: string; args: unknown }> = []
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args })
        return reply(name, args)
      },
    }
    vi.doMock('@/lib/supabase', () => ({ supabase: client, isSupabaseConfigured: true }))
    const { squadService } = await import('@/services/squad-service')
    const { DbError } = await import('@/services/db')
    return { squadService, calls, DbError }
  }

  it('reads the squad and the table from the functions, sending nothing of its own', async () => {
    const { squadService, calls } = await connected((name) =>
      name === 'my_squad'
        ? { data: [{ squad_id: 's1', name: 'Graphs', join_code: 'ABCDEFGH', role: 'member', handle: 'bongani', member_count: 4 }], error: null }
        : {
            data: [
              { handle: 'chloe', is_me: false, role: 'owner', weekly_xp: 40, streak: 2, quests_claimed: null },
              { handle: 'bongani', is_me: true, role: 'member', weekly_xp: 90, streak: 5, quests_claimed: ['xp-150'] },
            ],
            error: null,
          },
    )
    expect(await squadService.mine(B)).toEqual({ id: 's1', name: 'Graphs', joinCode: 'ABCDEFGH', role: 'member', handle: 'bongani', memberCount: 4 })
    expect(await squadService.board(B)).toEqual([
      { handle: 'bongani', isMe: true, role: 'member', weeklyXp: 90, streak: 5, questsClaimed: ['xp-150'] },
      { handle: 'chloe', isMe: false, role: 'owner', weeklyXp: 40, streak: 2, questsClaimed: [] },
    ])
    expect(calls).toEqual([
      { name: 'my_squad', args: {} },
      { name: 'squad_board', args: {} },
    ])
  })

  it('is null without a squad', async () => {
    const { squadService } = await connected(() => ({ data: [], error: null }))
    expect(await squadService.mine(B)).toBeNull()
  })

  it('sends a name and a handle, a code and a handle, or a handle: never an id', async () => {
    const { squadService, calls } = await connected((name) => {
      if (name === 'create_squad') return { data: [{ squad_id: 's1', join_code: 'ABCDEFGH' }], error: null }
      if (name === 'join_squad') return { data: [{ joined: true, squad_id: 's1', name: 'Graphs', message: null }], error: null }
      if (name === 'rename_squad') return { data: 'Graphs', error: null }
      if (name === 'new_squad_code') return { data: 'HGFEDCBA', error: null }
      return { data: null, error: null }
    })
    await squadService.create(A, 'Graphs', 'ayanda')
    await squadService.join(B, 'abcd-efgh', 'bongani')
    await squadService.remove(A, 'bongani')
    expect(await squadService.rename(A, ' Graphs ')).toBe('Graphs')
    expect(await squadService.newCode(A)).toBe('HGFEDCBA')
    await squadService.leave(A)
    expect(calls).toEqual([
      { name: 'create_squad', args: { p_name: 'Graphs', p_handle: 'ayanda' } },
      { name: 'join_squad', args: { p_code: 'abcd-efgh', p_handle: 'bongani' } },
      { name: 'remove_squad_member', args: { p_handle: 'bongani' } },
      { name: 'rename_squad', args: { p_name: ' Graphs ' } },
      { name: 'new_squad_code', args: {} },
      { name: 'leave_squad', args: {} },
    ])
  })

  it("turns a wrong code's answer into its sentence", async () => {
    const { squadService } = await connected(() => ({
      data: [{ joined: false, squad_id: null, name: null, message: SQUAD_MESSAGES.wrongCode }],
      error: null,
    }))
    await expect(squadService.join(B, 'ZZZZZZZZ', 'bongani')).rejects.toThrow(SQUAD_MESSAGES.wrongCode)
  })

  it.each([
    ['22023', SQUAD_MESSAGES.ownerOnly],
    ['SQ001', SQUAD_MESSAGES.full],
  ])('shows a %s refusal as its sentence', async (code, message) => {
    const { squadService, DbError } = await connected(() => ({ data: null, error: { message, code } }))
    const failure = squadService.join(B, 'ABCDEFGH', 'bongani')
    await expect(failure).rejects.toThrow(new RegExp(`^${message.replace(/[()]/g, '\\$&')}$`))
    await expect(failure).rejects.not.toBeInstanceOf(DbError)
  })

  it('keeps any other failure a database error', async () => {
    const { squadService, DbError } = await connected(() => ({
      data: null,
      error: { message: 'permission denied for function squad_board', code: '42501' },
    }))
    await expect(squadService.board(B)).rejects.toBeInstanceOf(DbError)
  })
})
