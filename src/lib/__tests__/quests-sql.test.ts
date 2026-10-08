import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig, which
// deliberately excludes Node types because everything else here is browser code.
import migration from '../../../supabase/migrations/00017_quests.sql?raw'
import { QUEST_CATALOGUE, type QuestMetric, questWeek } from '@/lib/quests'
import { claimKey } from '@/services/quest-service'

/**
 * The quest catalogue and its rules live in two places: the migrations (the
 * authority — 00017 counts progress and pays claims, and the latest catalogue
 * seed holds its current text) and lib/quests.ts (demo mode and display). This
 * holds them to the same rows and the same arithmetic, so the demo never shows
 * a quest the server would count differently, and a quest added to one is not
 * missing from the other.
 */

const sql = migration.replace(/--[^\n]*/g, '')

/** Every migration, in order, comments stripped. */
const migrations = Object.entries(
  import.meta.glob('../../../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, text]) => ({ name: path.split('/').pop()!, sql: text.replace(/--[^\n]*/g, '') }))

/** The last migration to seed the catalogue: what a project holds once every migration has run. */
const latestSeed = [...migrations].reverse().find((migration) => /insert into public\.quest_catalogue/i.test(migration.sql))!

function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  expect(start, `00017 defines ${name}()`).toBeGreaterThan(-1)
  const open = sql.indexOf('$$', start)
  return sql.slice(open + 2, sql.indexOf('$$', open + 2))
}

/** Parse the catalogue seed: ('id', slot, ordinal, 'title', 'description', 'metric', target, reward). */
function seeded(from: string = latestSeed.sql) {
  const values = from.match(/insert into public\.quest_catalogue[^;]*?values([\s\S]*?)on conflict/i)?.[1] ?? ''
  const tuple = /\(\s*'([^']+)',\s*(\d+),\s*(\d+),\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'(\w+)',\s*(\d+),\s*(\d+)\s*\)/g
  return [...values.matchAll(tuple)].map((match) => ({
    id: match[1]!,
    slot: Number(match[2]),
    ordinal: Number(match[3]),
    title: match[4]!.replaceAll("''", "'"),
    description: match[5]!.replaceAll("''", "'"),
    metric: match[6]!,
    target: Number(match[7]),
    reward: Number(match[8]),
  }))
}

describe('the catalogue', () => {
  it('finds the seed', () => {
    expect(seeded().length).toBeGreaterThan(0)
  })

  it('has the same rows in TypeScript as the latest seed in SQL', () => {
    const byId = (rows: Array<{ id: string }>) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(seeded())).toEqual(byId(QUEST_CATALOGUE))
  })

  it('re-seeds every column on every seed, so a changed title or reward reaches an existing project', () => {
    for (const migration of migrations.filter((entry) => /insert into public\.quest_catalogue/i.test(entry.sql))) {
      expect(migration.sql, migration.name).toMatch(/on conflict \(id\) do update\s+set slot\s+= excluded\.slot/i)
      for (const column of ['ordinal', 'title', 'description', 'metric', 'target', 'reward']) {
        expect(migration.sql, `${migration.name} re-seeds ${column}`).toMatch(new RegExp(`${column}\\s+= excluded\\.${column}`, 'i'))
      }
    }
  })

  it('never names an XP amount in a title other than its goal', () => {
    // "Earn 150 XP" beside a "+50 XP" bonus read as a promise of 150. A
    // title may state an XP goal — that is what xp_earned quests are — but
    // never the reward's own number, and never "earn" as if it were paid.
    for (const quest of QUEST_CATALOGUE) {
      expect(quest.title, quest.id).not.toMatch(/^earn\b/i)
      expect(quest.title, quest.id).not.toMatch(new RegExp(`\\b${quest.reward}\\s*XP`))
      const named = quest.title.match(/(\d+)\s*XP/)
      if (named) {
        expect(quest.metric, `${quest.id} names XP but does not count it`).toBe('xp_earned')
        expect(Number(named[1]), `${quest.id}'s title states its goal`).toBe(quest.target)
      }
    }
  })

  it('allows exactly the metrics the client knows', () => {
    const allowed = sql.match(/metric\s+text not null check \(metric in \(([\s\S]*?)\)\)/)?.[1] ?? ''
    const inSql = [...allowed.matchAll(/'(\w+)'/g)].map((match) => match[1]).sort()
    const inTs = [...new Set(QUEST_CATALOGUE.map((quest) => quest.metric))].sort()
    expect(inSql).toEqual(inTs)
  })
})

describe('quest_progress matches questProgress', () => {
  const body = functionBody('quest_progress')

  it.each([...new Set(QUEST_CATALOGUE.map((quest) => quest.metric))] as QuestMetric[])(
    '%s has a branch',
    (metric) => {
      expect(body).toContain(`when '${metric}' then`)
    },
  )

  it('passes at 80% in integers, for quizzes and bosses alike', () => {
    expect(body.match(/a\.score \* 5 >= a\.total \* 4/g)).toHaveLength(2)
    expect(body).toContain("z.kind = 'boss'")
  })

  it('counts a revision a week after the last attempt', () => {
    expect(body).toContain("<= a.submitted_at - interval '7 days'")
  })

  it('keeps quest rewards out of the XP quest', () => {
    expect(body).toContain("l.event <> 'quest_claimed'")
  })

  it('makes a study day from streak activity or a quiz, as STUDY_EVENTS does', () => {
    expect(body).toContain(
      "l.event = 'quiz_completed'\n                or l.event in (select r.event from public.xp_rewards r where r.advances_streak)",
    )
  })

  it('windows every count to [Monday 00:00, next Monday)', () => {
    const windows = body.match(/>= p_from and [\w.]+ < p_to/g) ?? []
    // One per counted source: two in study_days, then one per remaining branch.
    expect(windows.length).toBeGreaterThanOrEqual(10)
  })
})

describe('the week and the rotation', () => {
  it('counts Mondays from the same epoch', () => {
    expect(functionBody('quest_week')).toContain("(v_monday - date '2024-01-01') / 7")
    expect(questWeek(new Date(2024, 0, 1)).index).toBe(0)
  })

  it("reads the student's timezone, falling back to UTC", () => {
    const body = functionBody('quest_week')
    expect(body).toContain('v_today := (now() at time zone v_tz)::date;')
    expect(body).toMatch(/exception when others then\s+v_tz := 'UTC';/)
  })

  it('rotates by week_index % pool size, in one shared function', () => {
    expect(functionBody('quest_rotation')).toContain(
      'p_week_index % nullif((select count(*)::integer from public.quest_catalogue c where c.slot = p_slot), 0)',
    )
    expect(functionBody('quest_board')).toContain('q.ordinal = public.quest_rotation(q.slot, v_week.week_index)')
    expect(functionBody('claim_quest')).toContain(
      'v_quest.ordinal is distinct from public.quest_rotation(v_quest.slot, v_week.week_index)',
    )
  })
})

describe('claims', () => {
  const claim = functionBody('claim_quest')

  it('pays under the same key the client reads back', () => {
    expect(claim).toContain(
      "award_xp(v_user, 'quest_claimed', v_week.week_start::text || ':' || v_quest.id, v_quest.reward)",
    )
    expect(functionBody('quest_board')).toContain("l.source_id = v_week.week_start::text || ':' || q.id")
    expect(claimKey('2026-10-05', 'xp-150')).toBe('2026-10-05:xp-150')
  })

  it('recounts progress before paying, and takes the student from the JWT', () => {
    expect(claim).toMatch(/v_user\s+uuid := auth\.uid\(\);/)
    expect(claim).toContain('if v_progress < v_quest.target then')
  })

  it('refuses with code 22023, which quest-service turns into the sentence', () => {
    expect(claim.match(/errcode = '22023'/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

describe('who may call what', () => {
  it.each(['quest_board()', 'claim_quest(text)'])('students may call %s', (signature) => {
    expect(sql).toContain(`grant execute on function public.${signature} to authenticated;`)
  })

  it.each([
    'quest_week(uuid)',
    'quest_rotation(integer, integer)',
    'quest_progress(uuid, text, timestamptz, timestamptz, text)',
  ])('no client may call %s', (signature) => {
    expect(sql).toContain(`revoke all on function public.${signature} from authenticated;`)
    expect(sql).toContain(`revoke all on function public.${signature} from anon;`)
    expect(sql).not.toContain(`grant execute on function public.${signature}`)
  })

  it('leaves the catalogue read-only', () => {
    expect(sql).toContain('revoke insert, update, delete on public.quest_catalogue from anon, authenticated;')
  })
})
