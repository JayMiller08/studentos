import { isSupabaseConfigured } from '@/lib/env'
import { STARTING_STREAK_FREEZES } from '@/lib/streak'
import { withTourDefaults } from '@/lib/tours'
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

/**
 * Streak freezes in demo mode.
 *
 * Demo profiles live in localStorage, which will store any field, so freezes are
 * available there — including on demo profiles created before freezes existed.
 * A real database gets no such default: a row without `streak_freezes` means
 * migration 00011 hasn't run, and defaulting it would make the next streak write
 * name a column Postgres doesn't have. Where the column does exist, the starting
 * freeze comes from its default instead (migration 00013).
 */
function withFreezeDefaults(profile: Profile): Profile {
  if (isSupabaseConfigured || typeof profile.streak_freezes === 'number') return profile
  return { ...profile, streak_freezes: STARTING_STREAK_FREEZES }
}

/** Every profile leaves this service with its optional fields settled. */
function normalize(profile: Profile): Profile {
  return withFreezeDefaults(withTourDefaults(profile))
}

export const profileService = {
  async get(userId: string): Promise<Profile | null> {
    const profile = await profiles().get(userId)
    return profile ? normalize(profile) : null
  },

  /**
   * Guarantee a profile row exists. In production this is normally created by
   * a database trigger on auth.users insert; this covers demo mode and any
   * race right after email confirmation.
   */
  async ensure(user: AuthUser): Promise<Profile> {
    const existing = await profiles().get(user.id)
    if (existing) return normalize(existing)

    // First demo sign-in: populate a believable sample workload so every
    // feature demonstrates real behavior instead of empty states.
    if (!isSupabaseConfigured) {
      const { ensureDemoSeed } = await import('@/lib/demo-seed')
      ensureDemoSeed(user.id)
    }

    const created = await profiles().upsert({
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
      // `tour_completed` is deliberately not written: it is the legacy 00006
      // flag, superseded by `tours_seen`, and a project that only ran 00007
      // has no such column. Writing it would fail the insert (42703).
      tours_seen: [],
      tour_replay_hint: false,
      notification_prefs: DEFAULT_NOTIFICATION_PREFS,
      language: 'en',
    })
    return normalize(created)
  },

  async update(userId: string, patch: Partial<Profile>): Promise<Profile> {
    return normalize(await profiles().update(userId, patch))
  },
}
