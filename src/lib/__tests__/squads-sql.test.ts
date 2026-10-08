import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig, which
// deliberately excludes Node types because everything else here is browser code.
import migration from '../../../supabase/migrations/00020_squads.sql?raw'
import dbSource from '../../services/db.ts?raw'
import {
  HANDLE_PATTERN,
  JOIN_FAILURES_PER_HOUR,
  SQUAD_CODE_ALPHABET,
  SQUAD_CODE_LENGTH,
  SQUAD_MAX,
  SQUAD_MESSAGES,
  SQUAD_NAME_LENGTH,
} from '@/lib/squads'

/**
 * Squads live in two places: migration 00020 (the authority — every write is
 * one of its functions) and lib/squads.ts (form checks and demo mode). A drift
 * is a quiet bug: a form that accepts a handle the database refuses, or demo
 * mode letting a seventh member in. This holds them to the same numbers and
 * the same sentences, and pins the access rules that make squads the one safe
 * place where students see each other.
 */

const sql = migration.replace(/--[^\n]*/g, '')

function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start, `00020 defines ${name}()`).toBeGreaterThan(-1)
  const open = sql.indexOf('$$', start)
  return sql.slice(open + 2, sql.indexOf('$$', open + 2))
}

/** A sentence as it appears inside a SQL string literal. */
const quoted = (text: string) => text.replaceAll("'", "''")

/** Functions a signed-in student may call. Everything else in 00020 is closed. */
const STUDENT_FUNCTIONS = [
  'my_squad()',
  'squad_board()',
  'create_squad(text, text)',
  'join_squad(text, text)',
  'leave_squad()',
  'remove_squad_member(text)',
  'rename_squad(text)',
  'new_squad_code()',
]
const PRIVATE_FUNCTIONS = [
  'enforce_squad_size()',
  'settle_squad_after_leave()',
  'squad_code()',
  'effective_streak(uuid)',
  'squad_week_xp(uuid)',
  'squad_check_handle(text)',
  'squad_check_name(text)',
  'owned_squad(uuid)',
]

describe('the limits match lib/squads.ts', () => {
  it(`caps a squad at SQUAD_MAX (${SQUAD_MAX}), in the trigger`, () => {
    const body = functionBody('enforce_squad_size')
    expect(body).toContain(`if v_count >= ${SQUAD_MAX} then`)
    expect(body).toContain(`'${SQUAD_MESSAGES.full}' using errcode = 'SQ001'`)
    expect(body).toContain('for update')
  })

  it('raises the SQLSTATE db.ts shows verbatim', () => {
    expect(dbSource).toContain(`SQUAD_FULL = 'SQ001'`)
  })

  it('uses the same code alphabet and length everywhere', () => {
    expect(sql).toContain(`join_code ~ '^[${SQUAD_CODE_ALPHABET}]{${SQUAD_CODE_LENGTH}}$'`)
    expect(functionBody('squad_code')).toContain(`v_alphabet constant text := '${SQUAD_CODE_ALPHABET}'`)
    expect(functionBody('squad_code')).toContain(`while char_length(v_code) < ${SQUAD_CODE_LENGTH} loop`)
    expect(functionBody('squad_code')).toContain(`(v_byte % ${SQUAD_CODE_ALPHABET.length}) + 1`)
    expect(SQUAD_CODE_ALPHABET).not.toMatch(/[01ILO]/)
  })

  it('rejects the bytes that would bias the code towards some characters', () => {
    expect(functionBody('squad_code')).toContain(`v_byte >= ${256 - (256 % SQUAD_CODE_ALPHABET.length)}`)
  })

  it('checks handles with the same pattern', () => {
    expect(sql).toContain(`handle ~ '${HANDLE_PATTERN.source}'`)
    expect(functionBody('squad_check_handle')).toContain(`v_handle !~ '${HANDLE_PATTERN.source}'`)
  })

  it('checks names with the same lengths', () => {
    expect(sql).toContain(`check (char_length(name) between ${SQUAD_NAME_LENGTH.min} and ${SQUAD_NAME_LENGTH.max})`)
    expect(functionBody('squad_check_name')).toContain(
      `char_length(v_name) < ${SQUAD_NAME_LENGTH.min} or char_length(v_name) > ${SQUAD_NAME_LENGTH.max}`,
    )
  })

  it('limits wrong codes to JOIN_FAILURES_PER_HOUR an hour', () => {
    expect(functionBody('join_squad')).toMatch(
      new RegExp(`f\\.at > now\\(\\) - interval '1 hour'\\) >= ${JOIN_FAILURES_PER_HOUR} then`),
    )
  })

  it.each(Object.entries(SQUAD_MESSAGES).filter(([, text]) => typeof text === 'string'))(
    'says "%s" in the same words',
    (_key, text) => {
      expect(sql).toContain(quoted(text as string))
    },
  )

  it('says a taken handle in the same words', () => {
    const [before, after] = SQUAD_MESSAGES.handleTaken('%').split('%')
    expect(sql).toContain(`'${quoted(before!)}%${quoted(after!)}', v_handle`)
  })
})

describe('the board reads what no client can write', () => {
  const board = functionBody('squad_board')

  it('returns a handle and four numbers, and no account', () => {
    expect(sql).toMatch(
      /function public\.squad_board\(\)\s+returns table \(handle text, is_me boolean, role text, weekly_xp integer, streak integer, quests_claimed text\[\]\)/,
    )
    expect(board).not.toMatch(/user_id\s*,|m\.user_id\s+as|email|full_name/)
  })

  it("counts XP over each member's own quest week, bonuses included", () => {
    const xp = functionBody('squad_week_xp')
    expect(xp).toContain('public.quest_week(p_user_id) w')
    expect(xp).toContain('l.created_at >= w.starts_at and l.created_at < w.ends_at')
    expect(xp).not.toContain('quest_claimed')
  })

  it('takes the streak as effectiveStreak() does: today or yesterday, or two days back with a freeze', () => {
    const streak = functionBody('effective_streak')
    expect(streak).toMatch(/if v_days <= 1 then\s+return v_profile\.current_streak;/)
    expect(streak).toMatch(/if v_days = 2 and coalesce\(v_profile\.streak_freezes, 0\) > 0 then\s+return v_profile\.current_streak;/)
    expect(streak).toMatch(/return 0;\s*end;\s*$/)
  })

  it("ticks this week's claimed quests, keyed as claim_quest pays them", () => {
    expect(board).toContain("l.event = 'quest_claimed'")
    expect(board).toContain("l.source_id like w.week_start::text || ':%'")
  })
})

describe('who may call what', () => {
  it.each(STUDENT_FUNCTIONS)('students may call %s', (signature) => {
    expect(sql).toContain(`grant execute on function public.${signature} to authenticated;`)
    expect(sql).toContain(`revoke all on function public.${signature} from anon;`)
  })

  it.each(PRIVATE_FUNCTIONS)('no client may call %s', (signature) => {
    expect(sql).toContain(`revoke all on function public.${signature} from authenticated;`)
    expect(sql).toContain(`revoke all on function public.${signature} from anon;`)
    expect(sql).not.toContain(`grant execute on function public.${signature}`)
  })

  it('grants nothing else', () => {
    const granted = [...sql.matchAll(/grant execute on function public\.([\w]+\([^)]*\)) to (\w+);/g)]
    expect(granted.map(([, fn, role]) => `${fn} ${role}`).sort()).toEqual(
      STUDENT_FUNCTIONS.map((fn) => `${fn} authenticated`).sort(),
    )
  })

  it.each(STUDENT_FUNCTIONS.map((fn) => fn.split('(')[0]!))('%s takes the student from the JWT, never a parameter', (name) => {
    expect(functionBody(name)).toMatch(/v_user\s+uuid := auth\.uid\(\);/)
    expect(sql.match(new RegExp(`function public\\.${name}\\(([^)]*)\\)`))?.[1]).not.toMatch(/uuid/)
  })

  it.each(['squads', 'squad_members', 'squad_join_failures'])('closes %s to clients entirely', (tableName) => {
    expect(sql).toContain(`alter table public.${tableName} enable row level security;`)
    expect(sql).toContain(`revoke all on public.${tableName} from anon, authenticated;`)
    expect(sql).not.toMatch(new RegExp(`create policy "[^"]+" on public\\.${tableName}\\b`))
  })

  it('pins search_path on every function, as a security definer must', () => {
    const definers = [...sql.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\bas \$\$/g)]
    expect(definers.length).toBe(STUDENT_FUNCTIONS.length + PRIVATE_FUNCTIONS.length)
    for (const [header, name] of definers) {
      expect(header, name).toContain('security definer')
      expect(header, name).toContain('set search_path = public, pg_temp')
    }
  })
})
