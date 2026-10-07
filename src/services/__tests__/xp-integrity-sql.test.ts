import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig, which
// deliberately excludes Node types because everything else here is browser code.
import migration from '../../../supabase/migrations/00016_xp_integrity.sql?raw'
import dbSource from '../db.ts?raw'
import { MAX_STREAK_FREEZES, STARTING_STREAK_FREEZES, STREAK_FREEZE_EVERY_DAYS } from '@/lib/streak'
import { ACTIVITY_RULES, BADGE_THRESHOLDS, BADGES, type XpEvent } from '@/services/gamification-service'

/**
 * Migration 00016 moved every XP, streak and badge decision into Postgres, and
 * the client keeps copies to explain rewards and to run demo mode. Those copies
 * cannot be shared with the SQL — one is TypeScript in the browser, the other
 * runs in the database — so this holds them equal.
 *
 * A drift either way is a quiet bug: raise a reward in TypeScript and the app
 * promises XP the server never pays; change the streak rule in streak.ts and
 * demo mode teaches a different streak from the one students actually keep.
 */

const allMigrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const ordered = Object.entries(allMigrations)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, sql]) => ({ name: path.split('/').pop()!, sql: sql.replace(/--[^\n]*/g, '') }))

/** The migration without comments, which quote statements in prose. */
const sql = migration.replace(/--[^\n]*/g, '')

/** The body of one function, from `create or replace function public.<name>` to its closing `$$;`. */
function functionBody(name: string, from: string = sql, label = '00016'): string {
  const start = from.indexOf(`create or replace function public.${name}(`)
  expect(start, `${label} defines ${name}()`).toBeGreaterThan(-1)
  const open = from.indexOf('$$', start)
  const close = from.indexOf('$$', open + 2)
  return from.slice(open + 2, close)
}

/** The body a project runs: the function as the last migration to define it left it. */
function latestFunctionBody(name: string): string {
  const latest = [...ordered].reverse().find(({ sql: text }) => text.includes(`create or replace function public.${name}(`))
  expect(latest, `some migration defines ${name}()`).toBeDefined()
  return functionBody(name, latest!.sql, latest!.name)
}

/** The rows of the last migration to seed `public.<table>`: what a migrated project holds. */
function latestSeed(table: string): { name: string; values: string } {
  const pattern = new RegExp(`insert into public\\.${table}\\b[^;]*?values([\\s\\S]*?)on conflict[^;]*;`, 'i')
  const latest = [...ordered].reverse().find(({ sql: text }) => pattern.test(text))
  expect(latest, `some migration seeds ${table}`).toBeDefined()
  const match = latest!.sql.match(pattern)!
  return { name: latest!.name, values: match[0] }
}

describe('xp_rewards matches ACTIVITY_RULES', () => {
  const seeded = new Map<string, { amount: number; dailyCap: number; advancesStreak: boolean }>()
  const values = sql.match(/insert into public\.xp_rewards[^;]*values([\s\S]*?)on conflict/i)
  for (const [, event, amount, cap, streak] of values?.[1]?.matchAll(/\('(\w+)',\s*(\d+),\s*(\d+),\s*(true|false)\)/g) ?? []) {
    seeded.set(event!, { amount: Number(amount), dailyCap: Number(cap), advancesStreak: streak === 'true' })
  }

  it('finds the seed', () => {
    expect(seeded.size).toBeGreaterThan(0)
  })

  it('seeds exactly the events the client can report', () => {
    expect([...seeded.keys()].sort()).toEqual(Object.keys(ACTIVITY_RULES).sort())
  })

  it.each(Object.entries(ACTIVITY_RULES))('%s pays, caps and counts the same', (event, rule) => {
    expect(seeded.get(event)).toEqual(rule)
  })

  it('re-seeds on every run, so a changed amount reaches an existing project', () => {
    expect(values?.[0]).toMatch(/on conflict/i)
    expect(sql).toMatch(/on conflict \(event\) do update\s+set amount\s+= excluded\.amount/i)
  })
})

describe('activity_happened knows every event', () => {
  const body = functionBody('activity_happened')

  it.each(Object.keys(ACTIVITY_RULES) as XpEvent[])('%s has a rule', (event) => {
    const branch = event === 'habit_completed' ? `p_event = 'habit_completed'` : `when '${event}' then`
    expect(body).toContain(branch)
  })

  it('pays for nothing it does not recognise', () => {
    expect(body).toMatch(/else false\s+end;/)
  })
})

describe('badge_earned matches the client badge checks', () => {
  const body = latestFunctionBody('badge_earned')

  it.each(Object.entries(BADGE_THRESHOLDS))('%s unlocks at %d', (badgeId, threshold) => {
    const branch = body.split(`when '${badgeId}' then`)[1]
    expect(branch, `badge_earned has no rule for ${badgeId}`).toBeDefined()
    // The first comparison in the branch is its threshold: a count, or an
    // interval in days.
    expect(Number(branch!.match(/>=\s*(?:interval\s+')?(\d+)/)?.[1])).toBe(threshold)
  })

  it('measures Early Bird against the submission time the database stamped', () => {
    expect(body.split(`when 'early-bird' then`)[1]).toMatch(/^\s*exists \([\s\S]*?a\.due_at - a\.submitted_at >= interval '/)
  })

  it('can award every badge the app shows, so no badge promises XP it cannot pay', () => {
    const ruled = [...body.matchAll(/when '([\w-]+)' then/g)].map((match) => match[1]).sort()
    expect(ruled).toEqual(BADGES.map((badge) => badge.id).sort())
  })

  it('reads the server-owned best streak and level for the badges that use them', () => {
    expect(body.split(`when 'streak-7' then`)[1]).toMatch(/^\s*\(\s*select p\.longest_streak/)
    expect(body.split(`when 'level-5' then`)[1]).toMatch(/^\s*\(\s*select p\.level/)
  })

  it('has a rule for every badge the client can award, and no others', () => {
    const ruled = [...body.matchAll(/when '([\w-]+)' then/g)].map((match) => match[1]).sort()
    const clientAwarded = [
      'first-assignment',
      'first-submission',
      'first-pomodoro',
      ...Object.keys(BADGE_THRESHOLDS),
    ].sort()
    expect(ruled).toEqual(clientAwarded)
    // Every rule names a badge that exists.
    for (const id of ruled) expect(BADGES.some((badge) => badge.id === id), id).toBe(true)
  })

  it('leaves badges without a rule unearnable from a client', () => {
    expect(body).toMatch(/else false\s+end, false\)/)
  })
})

describe('the badge catalogue matches BADGES', () => {
  const seed = latestSeed('badges')
  const rows = [
    ...seed.values.matchAll(/\(\s*'([\w-]+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'([^']*)',\s*(\d+)\s*\)/g),
  ].map(([, id, name, description, emoji, xp]) => ({
    id: id!,
    name: name!.replaceAll("''", "'"),
    description: description!.replaceAll("''", "'"),
    emoji: emoji!,
    xp_reward: Number(xp),
  }))

  it('finds the seed', () => {
    expect(rows.length).toBeGreaterThan(0)
  })

  it('seeds the same badges, names and XP the achievements page shows', () => {
    const byId = (list: Array<{ id: string }>) => [...list].sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(rows)).toEqual(byId(BADGES))
  })

  it('overwrites on conflict, so a corrected reward reaches an existing project', () => {
    for (const column of ['name', 'description', 'emoji', 'xp_reward']) {
      expect(seed.values, `${seed.name} re-seeds ${column}`).toMatch(new RegExp(`${column}\\s+= excluded\\.${column}`, 'i'))
    }
  })
})

describe('when an assignment was submitted', () => {
  const latest = ordered.find(({ sql: text }) => text.includes('function public.stamp_assignment_submission('))!
  const stamp = functionBody('stamp_assignment_submission', latest?.sql ?? '', latest?.name ?? 'a migration')

  it('is stamped by the database, on insert and on update, whatever the client sends', () => {
    expect(latest.sql).toMatch(
      /create trigger assignments_stamp_submission\s+before insert or update on public\.assignments\s+for each row execute function public\.stamp_assignment_submission\(\);/,
    )
    expect(stamp).toMatch(/elsif tg_op = 'INSERT' then\s+new\.submitted_at := now\(\);/)
    expect(stamp).toMatch(/elsif old\.status not in \('submitted', 'graded'\) then\s+new\.submitted_at := now\(\);/)
  })

  it('keeps the first stamp while the assignment stays submitted, and clears it if taken back', () => {
    expect(stamp).toMatch(/else\s+new\.submitted_at := old\.submitted_at;/)
    expect(stamp).toMatch(/if new\.status not in \('submitted', 'graded'\) then\s+new\.submitted_at := null;/)
  })
})

describe('touch_streak follows streak.ts', () => {
  const body = functionBody('touch_streak')

  it('earns a freeze every STREAK_FREEZE_EVERY_DAYS days, up to MAX_STREAK_FREEZES', () => {
    expect(body).toContain(`v_next % ${STREAK_FREEZE_EVERY_DAYS} = 0 and v_freezes < ${MAX_STREAK_FREEZES}`)
  })

  it('clamps a stored count the way heldFreezes() does', () => {
    expect(body).toContain(`least(${MAX_STREAK_FREEZES}, greatest(0, coalesce(v_profile.streak_freezes, 0)))`)
  })

  it('continues after one day, rescues after two with a freeze, otherwise restarts at 1', () => {
    expect(body).toMatch(/v_next\s+integer := 1;/)
    expect(body).toMatch(/if v_days = 1 then\s+v_next := v_current \+ 1;/)
    expect(body).toMatch(/elsif v_days = 2 and v_current > 0 and v_freezes > 0 then\s+v_next := v_current \+ 1;\s+v_used := true;/)
  })

  it('treats today, and a date ahead of today, as already counted', () => {
    expect(body).toContain('if v_days is not null and v_days <= 0 then')
  })

  it("counts days on the student's calendar, not the server's", () => {
    expect(body).toContain('now() at time zone coalesce(nullif(v_profile.timezone')
  })

  it('starts a client-made profile with STARTING_STREAK_FREEZES', () => {
    expect(functionBody('guard_profile_progress')).toContain(`new.streak_freezes   := ${STARTING_STREAK_FREEZES};`)
  })
})

describe('the progress lock', () => {
  const guard = functionBody('guard_profile_progress')

  it('raises the SQLSTATE db.ts recognises', () => {
    expect(dbSource).toContain(`PROGRESS_LOCKED = 'XP001'`)
    expect(guard).toContain(`errcode = 'XP001'`)
  })

  it.each(['xp', 'level', 'current_streak', 'longest_streak', 'last_active_date', 'streak_freezes'])(
    'freezes %s',
    (column) => {
      expect(guard).toMatch(new RegExp(`new\\.${column}\\s+is distinct from old\\.${column}`))
    },
  )

  it('lets everything but the two client roles through', () => {
    expect(guard).toContain(`if current_user not in ('anon', 'authenticated') then`)
  })

  it('guards inserts as well as updates', () => {
    expect(sql).toMatch(/create trigger profiles_guard_progress\s+before insert or update on public\.profiles/)
  })
})

describe('who may call what', () => {
  // Across every migration, in order, so a later file cannot quietly re-grant.
  const grants = (fn: string, role: string) =>
    ordered.filter(({ sql: text }) =>
      new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to ${role}`, 'i').test(text),
    )

  it.each(['record_activity', 'unlock_badge'])('students may call %s', (fn) => {
    expect(grants(fn, 'authenticated').length).toBeGreaterThan(0)
  })

  it.each(['award_xp', 'touch_streak', 'activity_happened', 'badge_earned'])(
    'no client may call %s',
    (fn) => {
      expect(grants(fn, 'authenticated')).toEqual([])
      expect(grants(fn, 'anon')).toEqual([])
      expect(sql + ordered.find(({ name }) => name.startsWith('00014'))!.sql).toMatch(
        new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from authenticated`, 'i'),
      )
    },
  )

  it.each(['record_activity', 'unlock_badge'])(
    '%s takes the student from the JWT, never from a parameter',
    (fn) => {
      expect(functionBody(fn)).toMatch(/v_user\s+uuid := auth\.uid\(\);/)
      // No uuid parameter that could name somebody else.
      const signature = sql.match(new RegExp(`function public\\.${fn}\\(([^)]*)\\)`))?.[1]
      expect(signature).toBeDefined()
      expect(signature).not.toMatch(/uuid/)
    },
  )
})

describe('content a client may no longer write', () => {
  /** The last migration to mention a policy decides whether it exists. */
  function policyExists(name: string): boolean {
    let exists = false
    for (const { sql: text } of ordered) {
      for (const match of text.matchAll(new RegExp(`(create|drop) policy (if exists )?"${name}"`, 'gi'))) {
        exists = match[1]!.toLowerCase() === 'create'
      }
    }
    return exists
  }

  it.each([
    'quizzes_insert_own',
    'quiz_questions_insert_own',
    'quiz_questions_update_own',
    'quiz_questions_delete_own',
  ])('%s is gone', (policy) => {
    expect(policyExists(policy)).toBe(false)
  })

  it('still lets a student read, rename and delete their quizzes', () => {
    expect(policyExists('quizzes_select_own')).toBe(true)
    expect(policyExists('quizzes_delete_own')).toBe(true)
    expect(sql).toContain('grant update (title, module_id) on public.quizzes to authenticated;')
  })

  it('revokes the table privileges too, not only the policies', () => {
    expect(sql).toContain('revoke insert, update, delete on public.quiz_questions from anon, authenticated;')
    expect(sql).toContain('revoke insert, update, delete on public.achievements from anon, authenticated;')
  })
})
