import { isSupabaseConfigured } from '@/lib/env'
import { table } from '@/services/db'
import type { AuthUser } from '@/services/auth-service'
import { DEFAULT_NOTIFICATION_PREFS, type Profile } from '@/types/models'

const profiles = () => table<Profile>('profiles')

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export const profileService = {
  async get(userId: string): Promise<Profile | null> {
    return profiles().get(userId)
  },

  /**
   * Guarantee a profile row exists. In production this is normally created by
   * a database trigger on auth.users insert; this covers demo mode and any
   * race right after email confirmation.
   */
  async ensure(user: AuthUser): Promise<Profile> {
    const existing = await profiles().get(user.id)
    if (existing) return existing

    // First demo sign-in: populate a believable sample workload so every
    // feature demonstrates real behavior instead of empty states.
    if (!isSupabaseConfigured) {
      const { ensureDemoSeed } = await import('@/lib/demo-seed')
      ensureDemoSeed(user.id)
    }

    return profiles().upsert({
      id: user.id,
      email: user.email,
      full_name: user.fullName ?? null,
      avatar_url: null,
      university: null,
      degree: null,
      semester: null,
      timezone: defaultTimezone(),
      goals: [],
      // Demo mode showcases the full product, including the admin dashboard.
      role: isSupabaseConfigured ? 'student' : 'admin',
      plan: isSupabaseConfigured ? 'free' : 'pro',
      xp: 0,
      level: 1,
      current_streak: 0,
      longest_streak: 0,
      last_active_date: null,
      onboarding_completed: false,
      tour_completed: false,
      notification_prefs: DEFAULT_NOTIFICATION_PREFS,
      language: 'en',
    })
  },

  async update(userId: string, patch: Partial<Profile>): Promise<Profile> {
    return profiles().update(userId, patch)
  },
}
