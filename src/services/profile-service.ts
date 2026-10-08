import { isSupabaseConfigured } from '@/lib/env'
import { STARTING_STREAK_FREEZES } from '@/lib/streak'
import { withTourDefaults } from '@/lib/tours'
import { toDateKey } from '@/lib/utils'
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

/** A real account starts empty and is filled in by onboarding. */
function blankStudent(user: AuthUser) {
  return {
    full_name: user.fullName ?? null,
    avatar_url: null,
    university: null,
    degree: null,
    semester: null,
    goals: [],
    xp: 0,
    level: 1,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    onboarding_completed: false,
  }
}

/** "jane.doe@uni.ac.za" -> "Jane Doe". Falls back when the address has no usable name. */
function nameFromEmail(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? ''
  const words = local
    .split(/[._+-]+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ''))
    .filter((word) => word.length > 1)
  if (words.length === 0) return 'Demo Student'
  return words.map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

/**
 * A demo account arrives mid-semester, not on day one.
 *
 * Demo sign-in used to create the same blank profile as a real signup, so the
 * first thing anyone trying the demo met was a three-step onboarding form —
 * which reads as a registration wall, not a login — and behind it a Level 1
 * profile with no XP and no streak. The gamification layer is the point of the
 * product and it looked empty in exactly the place people go to see it.
 *
 * So: onboarded, a few weeks of progress, level 5 and close to 6 (the next
 * quiz tips it over), a live streak that today's work will extend, and two
 * freezes to show the safety net. Tours stay unseen so each page still
 * introduces itself.
 */
function demoStudent(user: AuthUser) {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return {
    full_name: user.fullName ?? nameFromEmail(user.email),
    avatar_url: null,
    university: 'University of Cape Town',
    degree: 'BSc Computer Science',
    semester: 'Semester 2',
    goals: ['grades', 'focus'],
    // 2,480 XP is level 5 at 98%: one quiz from a level-up.
    xp: 2480,
    level: 5,
    current_streak: 12,
    longest_streak: 21,
    // Yesterday, not today: the streak is alive but today's session is what
    // keeps it, which is the loop the demo should let someone feel.
    last_active_date: toDateKey(yesterday),
    streak_freezes: 2,
    onboarding_completed: true,
  }
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
    // Populate a believable sample workload so every feature demonstrates real
    // behaviour instead of empty states.
    //
    // Runs on every demo sign-in, not just the first. The seed is a set of
    // independently flag-guarded blocks, and new ones are added as features
    // ship — gating the whole call on "no profile yet" meant anyone who had
    // already opened demo mode never saw anything added later. Each block
    // no-ops once its own flag is set, so repeating the call is cheap.
    if (!isSupabaseConfigured) {
      const { ensureDemoSeed } = await import('@/lib/demo-seed')
      ensureDemoSeed(user.id)
    }

    const existing = await profiles().get(user.id)
    if (existing) {
      // Every demo account shares one profile id, so a browser that tried the
      // demo before demo accounts arrived onboarded still holds that old
      // profile — and would keep landing on the onboarding form forever.
      // Bring it up to the showcase state. It can only be one that never got
      // past onboarding, so there is no progress in it to lose.
      if (!isSupabaseConfigured && !existing.onboarding_completed) {
        return normalize(await profiles().update(user.id, demoStudent(user)))
      }
      return normalize(existing)
    }

    const created = await profiles().upsert({
      id: user.id,
      email: user.email,
      timezone: defaultTimezone(),
      // Demo mode showcases the full product, including the admin dashboard.
      role: isSupabaseConfigured ? 'student' : 'admin',
      plan: isSupabaseConfigured ? 'free' : 'pro',
      ...(isSupabaseConfigured ? blankStudent(user) : demoStudent(user)),
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
