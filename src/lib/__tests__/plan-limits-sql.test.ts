import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig, which
// deliberately excludes Node types because everything else here is browser code.
import migration from '../../../supabase/migrations/00010_plan_limits.sql?raw'
import { PLANS } from '@/lib/plans'

/**
 * The Free caps now live in two places: `plans.ts` (client UX) and the
 * `enforce_plan_limit` trigger (the actual boundary). They cannot be shared —
 * one is TypeScript shipped to the browser, the other is SQL running in
 * Postgres — so this asserts they agree.
 *
 * Without it, raising a cap in plans.ts would silently leave the database
 * rejecting at the old number, and the failure would look like a bug in the
 * app rather than a stale migration.
 */
/** Pull `v_limit := <n>;` out of the branch guarded by `tg_table_name = '<table>'`. */
function limitInSql(table: string): number {
  const branch = migration.split(`tg_table_name = '${table}'`)[1]
  expect(branch, `no branch for ${table} in the migration`).toBeDefined()
  const match = branch!.match(/v_limit\s*:=\s*(\d+)/)
  expect(match, `no v_limit assignment for ${table}`).not.toBeNull()
  return Number(match![1])
}

describe('the plan-limit trigger matches plans.ts', () => {
  it.each([
    ['assignments', PLANS.free.limits.assignments],
    ['tasks', PLANS.free.limits.tasks],
    ['notes', PLANS.free.limits.notes],
  ])('%s cap agrees', (table, expected) => {
    expect(limitInSql(table)).toBe(expected)
  })

  it('meters exactly the tables plans.ts meters', () => {
    const metered = migration.match(/array\['assignments', 'tasks', 'notes'\]/)
    expect(metered, 'trigger is not attached to all three metered tables').not.toBeNull()
  })
})

describe('the trigger mirrors the client predicates', () => {
  it('counts assignments the way isActiveAssignment does', () => {
    // status in ('not_started','in_progress')
    expect(migration).toContain("status in ('not_started', 'in_progress')")
  })

  it('counts tasks the way isUnfinishedTask does', () => {
    expect(migration).toContain("status <> 'done'")
  })

  it('skips rows that would not count toward the cap', () => {
    // Filing an already-submitted assignment must not be blocked just because
    // three others are still active.
    expect(migration).toMatch(/if not v_now_counts then\s+return new;/)
  })
})

describe('the cap cannot be walked around with UPDATE', () => {
  it('fires on update as well as insert', () => {
    // Otherwise: fill the quota, mark one done, create a replacement, then flip
    // the done one back to active — straight past the limit without a single
    // blocked INSERT.
    expect(migration).toContain('before insert or update on')
  })

  it('only checks rows entering the metered set', () => {
    // A row that already counted must not be re-checked, or every edit to an
    // active assignment would fail once the user is at the cap.
    expect(migration).toMatch(/if v_was_counted then\s+return new;/)
  })

  it('reads the previous state from OLD on update', () => {
    expect(migration).toMatch(/if tg_op = 'UPDATE' then\s+v_was_counted := old\.status/)
  })

  it('treats every note as already counted on update', () => {
    // Notes have no status, so an update never changes membership.
    expect(migration).toContain("v_was_counted := (tg_op = 'UPDATE')")
  })
})

describe('privileges', () => {
  it('does not revoke on the trigger function', () => {
    // A `returns trigger` function cannot be called directly, so a REVOKE buys
    // nothing while gating every write to three core tables.
    expect(migration).not.toMatch(/revoke\s+\w+\s+on function public\.enforce_plan_limit/i)
  })
})

describe('the trigger is safe to run as definer', () => {
  it('pins search_path', () => {
    // SECURITY DEFINER without a pinned search_path is the classic Postgres
    // privilege-escalation hole.
    expect(migration).toContain('security definer')
    expect(migration).toMatch(/set search_path = public, pg_temp/)
  })

  it('lifts every cap for paid plans', () => {
    expect(migration).toMatch(/if v_plan <> 'free' then\s+return new;/)
  })

  it('treats a missing profile as Free rather than unmetered', () => {
    expect(migration).toMatch(/coalesce\(v_plan, 'free'\)/)
  })

  it('raises the code the client maps to an upgrade prompt', () => {
    expect(migration).toContain("errcode = 'PL001'")
  })
})
