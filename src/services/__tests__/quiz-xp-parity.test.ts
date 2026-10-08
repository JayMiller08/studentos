import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig, which
// deliberately excludes Node types because everything else here is browser code.
import gradeFunction from '../../../supabase/functions/quiz-grade/index.ts?raw'
import quizMigration from '../../../supabase/migrations/00014_quiz_engine.sql?raw'
import { QUIZ_XP, levelForXp } from '@/services/gamification-service'

/**
 * Every migration, in the order they are applied.
 *
 * The security assertions below are about the database's *end state*, not any
 * one file: 00015 replaced 00014's view, and a later migration could just as
 * easily add a policy. Reading all of them in order is what the database does.
 */
const migrations = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>
const orderedMigrations = Object.keys(migrations)
  .sort()
  .map((path) => ({ path, sql: migrations[path]! }))
const allSql = orderedMigrations.map((migration) => migration.sql).join('\n')

/**
 * Quiz XP is decided in the Edge Function and displayed by the client, so the
 * numbers exist twice and cannot be shared: one runs in Deno on Supabase, the
 * other ships to the browser.
 *
 * Without this, changing the reward in the function would leave the result
 * screen confidently reporting the old figure — and the student would read
 * "+64 XP" while their profile went up by a different amount.
 */
function constantInFunction(name: string): number {
  const match = gradeFunction.match(new RegExp(`const ${name}\\s*=\\s*([\\d._]+)`))
  expect(match, `no ${name} in quiz-grade/index.ts`).not.toBeNull()
  return Number(match![1]!.replace(/_/g, ''))
}

describe('quiz XP agrees between the client and the grading function', () => {
  it.each([
    ['XP_PER_CORRECT', QUIZ_XP.correct],
    ['XP_QUIZ_COMPLETED', QUIZ_XP.completed],
    ['XP_BOSS_DEFEATED', QUIZ_XP.boss],
    ['BOSS_PASS_RATIO', QUIZ_XP.bossPassRatio],
  ])('%s matches', (name, expected) => {
    expect(constantInFunction(name)).toBe(expected)
  })
})

describe('the quiz tables cannot be written by a student', () => {
  it('finds the migrations to check', () => {
    // A glob that silently matches nothing would make every assertion vacuous.
    expect(orderedMigrations.length).toBeGreaterThanOrEqual(15)
  })

  /**
   * The security assertion of the whole feature. `quiz_attempts`,
   * `quiz_answers` and `xp_ledger` are written only by the service role, which
   * works solely because RLS denies what it has no policy for. Adding an insert
   * policy to any of them — the obvious "fix" when a client write 403s — would
   * hand students the ability to POST their own scores. Checked across every
   * migration, so a policy added by a later file is caught too.
   */
  it.each(['quiz_attempts', 'quiz_answers', 'xp_ledger'])(
    '%s has no insert, update or delete policy in any migration',
    (table) => {
      const policies =
        allSql.match(new RegExp(`create policy "[^"]*" on public\\.${table}[\\s\\S]*?;`, 'g')) ?? []
      expect(policies.length, `no policies at all found for ${table}`).toBeGreaterThan(0)
      for (const policy of policies) {
        expect(policy, `${table} must stay read-only to its owner`).toMatch(/for select/)
      }
    },
  )
})

describe('the answer key stays server-side', () => {
  /**
   * Supabase's advisor flags SECURITY DEFINER views as critical, and it is
   * right to: they bypass RLS entirely. 00014 shipped one; 00015 replaced it.
   * This holds every view's *latest* definition to `security_invoker = true`,
   * so neither that view nor a new one can quietly go back to running as its
   * owner.
   */
  it('defines every view to run as the caller', () => {
    const latest = new Map<string, string>()
    for (const { sql } of orderedMigrations) {
      for (const match of sql.matchAll(
        /create (?:or replace )?view public\.(\w+)([\s\S]*?)\bas\b/gi,
      )) {
        latest.set(match[1]!, match[2]!)
      }
    }
    expect(latest.size, 'no views found').toBeGreaterThan(0)
    for (const [view, options] of latest) {
      expect(options, `${view} must be created with (security_invoker = true)`).toMatch(
        /security_invoker\s*=\s*true/,
      )
    }
  })

  it('revokes table-level SELECT on quiz_questions from client roles', () => {
    // Without this, Supabase's default table grant covers every column and the
    // column-level grant below restricts nothing.
    expect(allSql).toMatch(
      /revoke select on public\.quiz_questions from anon, authenticated;/,
    )
  })

  it('grants SELECT only on columns that are safe before grading', () => {
    const grants = [
      ...allSql.matchAll(/grant select \(([^)]*)\)\s+on public\.quiz_questions to authenticated;/g),
    ]
    expect(grants.length, 'no column-level grant on quiz_questions').toBeGreaterThan(0)
    const columns = grants.at(-1)![1]!.split(',').map((column) => column.trim())
    expect(columns).toEqual(expect.arrayContaining(['id', 'quiz_id', 'prompt', 'options']))
    expect(columns, 'the answer key must never be readable by a student').not.toContain(
      'correct_index',
    )
    expect(columns, 'the explanation gives the answer away').not.toContain('explanation')
  })

  it('never grants table-wide SELECT on quiz_questions back to a client role', () => {
    expect(allSql).not.toMatch(/grant select on public\.quiz_questions to (anon|authenticated)/)
    expect(allSql).not.toMatch(/grant all on public\.quiz_questions to (anon|authenticated)/)
  })

  it('projects the answer away in the runner view', () => {
    const views = allSql.split('create view public.quiz_questions_public')
    const latest = views.at(-1)!.split(';')[0]!
    expect(latest).toContain('prompt')
    expect(latest).not.toContain('correct_index')
    expect(latest).not.toContain('explanation')
  })
})

describe('the SQL level curve matches the TypeScript one', () => {
  it('uses floor(sqrt(xp / 100)) + 1', () => {
    expect(quizMigration).toContain('floor(sqrt((xp + v_amount) / 100.0)) + 1')
  })

  // Spot-check the boundaries the SQL has to reproduce.
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [399, 2],
    [400, 3],
    [1600, 5],
    [8100, 10],
  ])('%i XP is level %i', (xp, level) => {
    expect(levelForXp(xp)).toBe(level)
  })
})
