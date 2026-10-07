import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig, which
// deliberately excludes Node types because everything else here is browser code.
import migration from '../../../supabase/migrations/00018_study_resources.sql?raw'
import writer from '../../../supabase/functions/_shared/quiz-writer.ts?raw'
import material from '../../../supabase/functions/_shared/material.ts?raw'
import { PLAN_ORDER, PLANS } from '@/lib/plans'
import { QUIZ_LENGTHS } from '@/services/quiz-service'
import { DAILY_FILE_READINGS, RESOURCE_MAX_BYTES, RESOURCE_MAX_PHOTOS, RESOURCE_TYPES } from '@/services/resource-service'

/**
 * The numbers behind quizzes-from-your-files live in three places: migration
 * 00018 (the authority: storage limits, the library cap, the allowances), the
 * Edge Functions (what they accept and re-check) and the client (what it
 * offers and explains). This holds all three to the same figures, so the app
 * never promises a quiz the database refuses, or sends a file storage rejects.
 */

const sql = migration.replace(/--[^\n]*/g, '')

describe('the monthly AI quiz allowance', () => {
  const body = sql.match(/function public\.ai_quiz_allowance[\s\S]*?\$\$([\s\S]*?)\$\$/)?.[1] ?? ''

  it.each(PLAN_ORDER)('%s matches plans.ts', (plan) => {
    const expected = PLANS[plan].limits.aiQuizzesPerMonth
    if (plan === 'free') {
      // Free is the fallback for any plan the case doesn't name.
      expect(body).toMatch(new RegExp(`else ${expected} end`))
    } else {
      expect(body).toContain(`when '${plan}' then ${expected}`)
    }
  })

  it('is what every plan can generate with', () => {
    for (const plan of PLAN_ORDER) expect(PLANS[plan].limits.aiQuiz).toBe(true)
  })

  it('counts charged quizzes since the 1st, and refuses with AI001', () => {
    expect(sql).toContain("u.kind = 'quiz' and u.charged")
    expect(sql).toContain("u.created_at >= date_trunc('month', now())")
    expect(sql).toMatch(/using errcode = 'AI001'/)
  })
})

describe('the library', () => {
  it('caps a Free library at the number plans.ts sells', () => {
    expect(sql).toMatch(new RegExp(`if v_count >= ${PLANS.free.limits.resources} then`))
    expect(PLANS.pro.limits.resources).toBeNull()
    expect(PLANS.elite.limits.resources).toBeNull()
  })

  it('allows as many photos as the client offers', () => {
    expect(sql).toContain(`cardinality(storage_paths) between 1 and ${RESOURCE_MAX_PHOTOS}`)
  })

  it('reads at most as many files a day as the client says', () => {
    expect(sql).toContain(`if v_used >= ${DAILY_FILE_READINGS} then`)
    expect(sql).toContain(`You have added ${DAILY_FILE_READINGS} files today`)
  })
})

describe('the bucket', () => {
  const bucket = sql.match(/insert into storage\.buckets[\s\S]*?values \(([\s\S]*?)\)\s*on conflict/)?.[1] ?? ''

  it('holds files to the size the client checks, and the functions re-check', () => {
    expect(bucket).toContain(String(RESOURCE_MAX_BYTES))
    expect(material).toContain('MAX_RESOURCE_BYTES = 20 * 1024 * 1024')
    expect(RESOURCE_MAX_BYTES).toBe(20 * 1024 * 1024)
  })

  it('accepts exactly the types the client accepts', () => {
    const allowed = [...bucket.matchAll(/'([a-z]+\/[a-z0-9.+-]+)'/g)].map((match) => match[1]).sort()
    expect(allowed).toEqual([...RESOURCE_TYPES].sort())
  })

  it('is private', () => {
    expect(bucket).toMatch(/'study-resources',\s*'study-resources',\s*false/)
  })
})

describe('quiz length', () => {
  it('offers only lengths the function will make', () => {
    const min = Number(writer.match(/minCount:\s*(\d+)/)?.[1])
    const max = Number(writer.match(/maxCount:\s*(\d+)/)?.[1])
    expect(Math.min(...QUIZ_LENGTHS)).toBe(min)
    expect(Math.max(...QUIZ_LENGTHS)).toBe(max)
  })
})

describe('who may call what', () => {
  it.each(['begin_quiz_generation(uuid, uuid, uuid, text, jsonb)', 'begin_outline(uuid, uuid)'])(
    'no client may call %s',
    (signature) => {
      expect(sql).toContain(`revoke all on function public.${signature} from authenticated;`)
      expect(sql).toContain(`revoke all on function public.${signature} from anon;`)
      expect(sql).not.toContain(`grant execute on function public.${signature}`)
    },
  )

  it('lets a client describe a file, never what reading it found', () => {
    expect(sql).toContain(
      'grant insert (user_id, module_id, title, kind, storage_paths, size_bytes) on public.study_resources to authenticated;',
    )
    expect(sql).toContain('grant update (title, module_id) on public.study_resources to authenticated;')
  })

  it('keeps jobs and the meter server-written', () => {
    expect(sql).toContain('revoke insert, update, delete on public.quiz_generations from anon, authenticated;')
    expect(sql).toContain('revoke insert, update, delete on public.ai_usage from anon, authenticated;')
  })

  it("pins every file to its owner's folder, for every writer", () => {
    expect(sql).toContain('constraint study_resources_paths_owned check (public.storage_paths_owned(user_id, storage_paths))')
  })
})
