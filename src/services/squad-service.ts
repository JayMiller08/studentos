import { questsForWeek, questWeek } from '@/lib/quests'
import {
  handleProblem,
  JOIN_FAILURES_PER_HOUR,
  nameProblem,
  normalizeCode,
  randomCode,
  SQUAD_MAX,
  SQUAD_MESSAGES,
  tidyName,
} from '@/lib/squads'
import { effectiveStreak } from '@/lib/streak'
import { supabase } from '@/lib/supabase'
import { byUser, DbError, rpc, SQUAD_FULL, table } from '@/services/db'
import type { Profile, XpLedgerEntry } from '@/types/models'

/**
 * Squads.
 *
 * With Supabase every read and write is a function in migration 00020: the
 * tables themselves are closed to clients, and squad mates are known to each
 * other only by handle. Weekly XP and streaks are worked out by the database
 * from rows no client can write. Demo mode has no database, so the same rules
 * run against localStorage, with a few made-up squad mates to show the table.
 */

export type SquadRole = 'owner' | 'member'

export interface MySquad {
  id: string
  name: string
  /** Every member can see it, so any of them can invite. */
  joinCode: string
  role: SquadRole
  /** What the squad calls you. */
  handle: string
  memberCount: number
}

export interface SquadStanding {
  handle: string
  isMe: boolean
  role: SquadRole
  /** XP earned in that member's own quest week. */
  weeklyXp: number
  /** As of now (see effectiveStreak), not as of the last write. */
  streak: number
  /** Ids of this week's quests they have claimed. */
  questsClaimed: string[]
}

interface SquadRow {
  id: string
  name: string
  join_code: string
  created_by: string | null
}

/**
 * A membership in the local store. Demo mode's made-up squad mates have no
 * ledger or profile, so they carry their numbers on the row.
 */
interface MemberRow {
  id: string
  squad_id: string
  user_id: string
  handle: string
  role: SquadRole
  joined_at: string
  demo_weekly_xp?: number
  demo_streak?: number
  /** How many of this week's quests to show as claimed. */
  demo_quests?: number
}

interface MySquadRow {
  squad_id: string
  name: string
  join_code: string
  role: SquadRole
  handle: string
  member_count: number
}

interface BoardRow {
  handle: string
  is_me: boolean
  role: SquadRole
  weekly_xp: number
  streak: number
  quests_claimed: string[] | null
}

/**
 * Call a squad function. Its refusals are sentences written for the student
 * ("That squad is full (6 of 6).") and are shown as such; anything else stays a
 * generic database error.
 */
async function call<Row>(name: string, args: Record<string, unknown> = {}): Promise<Row[]> {
  try {
    return await rpc<Row>(name, args)
  } catch (error) {
    if (error instanceof DbError && (error.code === '22023' || error.code === SQUAD_FULL)) throw new Error(error.detail)
    throw error
  }
}

function byStanding(a: SquadStanding, b: SquadStanding): number {
  return b.weeklyXp - a.weeklyXp || a.handle.toLowerCase().localeCompare(b.handle.toLowerCase())
}

// ── Demo mode ───────────────────────────────────────────────────────────────

const squads = () => table<SquadRow>('squads')
const members = () => table<MemberRow>('squad_members')
const failures = () => table<{ id: string; user_id: string; at: string }>('squad_join_failures')

async function membershipOf(userId: string): Promise<MemberRow | null> {
  const [row] = await members().list({ filters: byUser(userId) })
  return row ?? null
}

async function membersOf(squadId: string): Promise<MemberRow[]> {
  return members().list({
    filters: [{ column: 'squad_id', op: 'eq', value: squadId }],
    orderBy: { column: 'joined_at', ascending: true },
  })
}

async function freshCode(): Promise<string> {
  for (;;) {
    const code = randomCode()
    if ((await squads().count([{ column: 'join_code', op: 'eq', value: code }])) === 0) return code
  }
}

/** settle_squad_after_leave()'s twin: keep an owner, close an empty squad. */
async function settleAfterLeave(squadId: string): Promise<void> {
  const left = await membersOf(squadId)
  if (left.length === 0) {
    await squads().remove(squadId)
    return
  }
  if (!left.some((member) => member.role === 'owner')) await members().update(left[0]!.id, { role: 'owner' })
}

/** owned_squad()'s twin. */
async function ownedSquad(userId: string): Promise<MemberRow> {
  const membership = await membershipOf(userId)
  if (!membership) throw new Error(SQUAD_MESSAGES.notInSquad)
  if (membership.role !== 'owner') throw new Error(SQUAD_MESSAGES.ownerOnly)
  return membership
}

/** One member's line, worked out from their own ledger and profile, as squad_board() does. */
async function standingOf(row: MemberRow, userId: string): Promise<SquadStanding> {
  const week = questWeek()
  const base = { handle: row.handle, isMe: row.user_id === userId, role: row.role }
  if (row.demo_weekly_xp !== undefined) {
    return {
      ...base,
      weeklyXp: row.demo_weekly_xp,
      streak: row.demo_streak ?? 0,
      questsClaimed: questsForWeek(week.index)
        .slice(0, row.demo_quests ?? 0)
        .map((quest) => quest.id)
        .sort(),
    }
  }
  const [ledger, profile] = await Promise.all([
    table<XpLedgerEntry>('xp_ledger').list({ filters: byUser(row.user_id) }),
    table<Profile>('profiles').get(row.user_id),
  ])
  const from = week.start.getTime()
  const to = week.end.getTime()
  return {
    ...base,
    weeklyXp: ledger
      .filter((entry) => {
        const at = Date.parse(entry.created_at)
        return at >= from && at < to
      })
      .reduce((sum, entry) => sum + entry.amount, 0),
    streak: effectiveStreak(profile),
    questsClaimed: ledger
      .filter((entry) => entry.event === 'quest_claimed' && entry.source_id.startsWith(`${week.key}:`))
      .map((entry) => entry.source_id.slice(week.key.length + 1))
      .sort(),
  }
}

const local = {
  async mine(userId: string): Promise<MySquad | null> {
    const membership = await membershipOf(userId)
    if (!membership) return null
    const squad = await squads().get(membership.squad_id)
    if (!squad) return null
    return {
      id: squad.id,
      name: squad.name,
      joinCode: squad.join_code,
      role: membership.role,
      handle: membership.handle,
      memberCount: (await membersOf(squad.id)).length,
    }
  },

  async board(userId: string): Promise<SquadStanding[]> {
    const membership = await membershipOf(userId)
    if (!membership) return []
    const rows = await membersOf(membership.squad_id)
    return (await Promise.all(rows.map((row) => standingOf(row, userId)))).sort(byStanding)
  },

  async create(userId: string, name: string, handle: string): Promise<{ squadId: string; joinCode: string }> {
    if (await membershipOf(userId)) throw new Error(SQUAD_MESSAGES.alreadyInToStart)
    const problem = nameProblem(name) ?? handleProblem(handle)
    if (problem) throw new Error(problem)
    const squad = await squads().insert({ name: tidyName(name), join_code: await freshCode(), created_by: userId })
    await members().insert({
      squad_id: squad.id,
      user_id: userId,
      handle: handle.trim(),
      role: 'owner',
      joined_at: new Date().toISOString(),
    })
    return { squadId: squad.id, joinCode: squad.join_code }
  },

  async join(userId: string, code: string, handle: string): Promise<{ squadId: string; name: string }> {
    const hourAgo = Date.now() - 60 * 60 * 1000
    const misses = (await failures().list({ filters: byUser(userId) })).filter((row) => Date.parse(row.at) > hourAgo)
    if (misses.length >= JOIN_FAILURES_PER_HOUR) throw new Error(SQUAD_MESSAGES.tooManyWrong)
    if (await membershipOf(userId)) throw new Error(SQUAD_MESSAGES.alreadyInToJoin)
    const problem = handleProblem(handle)
    if (problem) throw new Error(problem)

    const [squad] = await squads().list({ filters: [{ column: 'join_code', op: 'eq', value: normalizeCode(code) }] })
    if (!squad) {
      await failures().insert({ user_id: userId, at: new Date().toISOString() })
      throw new Error(SQUAD_MESSAGES.wrongCode)
    }
    const current = await membersOf(squad.id)
    const wanted = handle.trim()
    if (current.some((member) => member.handle.toLowerCase() === wanted.toLowerCase())) {
      throw new Error(SQUAD_MESSAGES.handleTaken(wanted))
    }
    if (current.length >= SQUAD_MAX) throw new Error(SQUAD_MESSAGES.full)
    await members().insert({
      squad_id: squad.id,
      user_id: userId,
      handle: wanted,
      role: 'member',
      joined_at: new Date().toISOString(),
    })
    return { squadId: squad.id, name: squad.name }
  },

  async leave(userId: string): Promise<void> {
    const membership = await membershipOf(userId)
    if (!membership) throw new Error(SQUAD_MESSAGES.notInSquad)
    await members().remove(membership.id)
    await settleAfterLeave(membership.squad_id)
  },

  async remove(userId: string, handle: string): Promise<void> {
    const owner = await ownedSquad(userId)
    const target = (await membersOf(owner.squad_id)).find(
      (member) => member.handle.toLowerCase() === handle.trim().toLowerCase(),
    )
    if (!target) throw new Error(SQUAD_MESSAGES.noSuchHandle)
    if (target.user_id === userId) throw new Error(SQUAD_MESSAGES.removeSelf)
    await members().remove(target.id)
    await settleAfterLeave(owner.squad_id)
  },

  async rename(userId: string, name: string): Promise<string> {
    const owner = await ownedSquad(userId)
    const problem = nameProblem(name)
    if (problem) throw new Error(problem)
    const tidy = tidyName(name)
    await squads().update(owner.squad_id, { name: tidy })
    return tidy
  },

  async newCode(userId: string): Promise<string> {
    const owner = await ownedSquad(userId)
    const code = await freshCode()
    await squads().update(owner.squad_id, { join_code: code })
    return code
  },
}

// ── The service ─────────────────────────────────────────────────────────────

export const squadService = {
  /** The student's squad, or null when they are not in one. */
  async mine(userId: string): Promise<MySquad | null> {
    if (!supabase) return local.mine(userId)
    const [row] = await call<MySquadRow>('my_squad')
    return row
      ? {
          id: row.squad_id,
          name: row.name,
          joinCode: row.join_code,
          role: row.role,
          handle: row.handle,
          memberCount: row.member_count,
        }
      : null
  },

  /** This week's table for the student's squad, highest weekly XP first. */
  async board(userId: string): Promise<SquadStanding[]> {
    if (!supabase) return local.board(userId)
    const rows = await call<BoardRow>('squad_board')
    return rows
      .map((row) => ({
        handle: row.handle,
        isMe: row.is_me,
        role: row.role,
        weeklyXp: row.weekly_xp,
        streak: row.streak,
        questsClaimed: row.quests_claimed ?? [],
      }))
      .sort(byStanding)
  },

  async create(userId: string, name: string, handle: string): Promise<{ squadId: string; joinCode: string }> {
    if (!supabase) return local.create(userId, name, handle)
    const [row] = await call<{ squad_id: string; join_code: string }>('create_squad', { p_name: name, p_handle: handle })
    if (!row) throw new Error('create_squad returned nothing')
    return { squadId: row.squad_id, joinCode: row.join_code }
  },

  /** Join with a code as typed: case, dashes and spaces do not matter. */
  async join(userId: string, code: string, handle: string): Promise<{ squadId: string; name: string }> {
    if (!supabase) return local.join(userId, code, handle)
    const [row] = await call<{ joined: boolean; squad_id: string | null; name: string | null; message: string | null }>(
      'join_squad',
      { p_code: code, p_handle: handle },
    )
    // A wrong code comes back as a row, so the database can count the miss.
    if (!row?.joined || !row.squad_id || !row.name) throw new Error(row?.message ?? SQUAD_MESSAGES.wrongCode)
    return { squadId: row.squad_id, name: row.name }
  },

  async leave(userId: string): Promise<void> {
    if (!supabase) return local.leave(userId)
    await call('leave_squad')
  },

  /** Owner only. */
  async remove(userId: string, handle: string): Promise<void> {
    if (!supabase) return local.remove(userId, handle)
    await call('remove_squad_member', { p_handle: handle })
  },

  /** Owner only. Returns the name as stored: trimmed, spaces collapsed. */
  async rename(userId: string, name: string): Promise<string> {
    if (!supabase) return local.rename(userId, name)
    const [stored] = await call<string>('rename_squad', { p_name: name })
    return stored ?? tidyName(name)
  },

  /** Owner only. The old code stops working at once; nobody is removed. */
  async newCode(userId: string): Promise<string> {
    if (!supabase) return local.newCode(userId)
    const [code] = await call<string>('new_squad_code')
    if (!code) throw new Error('new_squad_code returned nothing')
    return code
  },
}
