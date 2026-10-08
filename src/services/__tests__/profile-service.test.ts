// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectiveStreak } from '@/lib/streak'
import { levelForXp } from '@/services/gamification-service'
import type { AuthUser } from '@/services/auth-service'

/**
 * `profileService.ensure()` now behaves differently by mode, and the
 * difference must never leak: demo accounts arrive onboarded with a showcase
 * of progress, real accounts arrive blank and go through onboarding. A bug
 * here in production would either skip onboarding for real students or hand
 * them 2,480 XP they never earned.
 *
 * Both the env and the Supabase client are mocked, so no test in this file can
 * reach a real project whatever `.env` contains.
 */

const DEMO_ID = '00000000-0000-4000-8000-000000000001'

async function load(configured: boolean) {
  vi.resetModules()
  vi.doMock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: configured }))
  vi.doMock('@/lib/env', () => ({
    isSupabaseConfigured: configured,
    env: { appUrl: 'http://localhost:5173', appEnv: 'development' },
  }))
  const { profileService } = await import('@/services/profile-service')
  const { localDb } = await import('@/lib/local-db')
  return { profileService, localDb }
}

const user = (email: string, fullName?: string): AuthUser =>
  ({ id: DEMO_ID, email, emailConfirmed: true, ...(fullName ? { fullName } : {}) }) as AuthUser

beforeEach(() => {
  localStorage.clear()
})

describe('a real account (Supabase configured)', () => {
  it('starts blank and unonboarded, with no borrowed progress', async () => {
    const { profileService } = await load(true)
    const profile = await profileService.ensure(user('real@uni.ac.za'))
    expect(profile).toMatchObject({
      onboarding_completed: false,
      xp: 0,
      level: 1,
      current_streak: 0,
      full_name: null,
      university: null,
      role: 'student',
      plan: 'free',
    })
  })

  it('keeps the name given at signup', async () => {
    const { profileService } = await load(true)
    const profile = await profileService.ensure(user('real@uni.ac.za', 'Thandi Nkosi'))
    expect(profile.full_name).toBe('Thandi Nkosi')
  })

  it('leaves an unfinished profile unfinished, so the student still onboards', async () => {
    const { profileService, localDb } = await load(true)
    localDb.upsert('profiles', {
      id: DEMO_ID,
      email: 'real@uni.ac.za',
      onboarding_completed: false,
      xp: 0,
      level: 1,
      current_streak: 0,
      tours_seen: [],
    })
    const profile = await profileService.ensure(user('real@uni.ac.za'))
    expect(profile.onboarding_completed).toBe(false)
    expect(profile.xp).toBe(0)
  })

  it('seeds no demo workload', async () => {
    const { profileService, localDb } = await load(true)
    await profileService.ensure(user('real@uni.ac.za'))
    expect(localDb.list('modules')).toHaveLength(0)
    expect(localDb.list('quizzes')).toHaveLength(0)
  })
})

describe('a demo account (no backend)', () => {
  it('arrives onboarded, mid-semester, with a live streak', async () => {
    const { profileService } = await load(false)
    const profile = await profileService.ensure(user('jane.doe@uni.ac.za'))
    expect(profile).toMatchObject({
      onboarding_completed: true,
      full_name: 'Jane Doe',
      university: 'University of Cape Town',
      xp: 2480,
      current_streak: 12,
      streak_freezes: 2,
    })
    // The stored level must agree with the curve, or the header and the
    // achievements page would disagree about what level this is.
    expect(profile.level).toBe(levelForXp(profile.xp))
    // Active yesterday: alive today, and today's work is what extends it.
    expect(effectiveStreak(profile)).toBe(12)
  })

  it('prefers a name given at signup over one guessed from the email', async () => {
    const { profileService } = await load(false)
    const profile = await profileService.ensure(user('jd@uni.ac.za', 'Jane Doe-Smith'))
    expect(profile.full_name).toBe('Jane Doe-Smith')
  })

  it.each([
    ['x@uni.test', 'Demo Student'],
    ['12345@uni.test', 'Demo Student'],
    ['sipho_ndlovu@uni.ac.za', 'Sipho Ndlovu'],
    ['MARY-ANNE.OKAFOR@uni.test', 'Mary Anne Okafor'],
  ])('names %s as "%s"', async (email, name) => {
    const { profileService } = await load(false)
    expect((await profileService.ensure(user(email))).full_name).toBe(name)
  })

  it('upgrades a profile left stuck before onboarding', async () => {
    const { profileService, localDb } = await load(false)
    localDb.upsert('profiles', {
      id: DEMO_ID,
      email: 'test@example.com',
      onboarding_completed: false,
      full_name: null,
      xp: 0,
      level: 1,
      current_streak: 0,
      tours_seen: [],
    })
    const profile = await profileService.ensure(user('test@example.com'))
    expect(profile.onboarding_completed).toBe(true)
    expect(profile.xp).toBe(2480)
  })

  it('never overwrites a demo profile that already has progress', async () => {
    const { profileService, localDb } = await load(false)
    localDb.upsert('profiles', {
      id: DEMO_ID,
      email: 'jane.doe@uni.ac.za',
      full_name: 'Jane Doe',
      onboarding_completed: true,
      xp: 3150,
      level: 6,
      current_streak: 3,
      tours_seen: [],
    })
    const profile = await profileService.ensure(user('jane.doe@uni.ac.za'))
    expect(profile).toMatchObject({ xp: 3150, level: 6, current_streak: 3 })
  })
})
