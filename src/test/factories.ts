import { DEFAULT_NOTIFICATION_PREFS, type Profile } from '@/types/models'

/**
 * A fully-populated profile for tests to override field by field. Shared so
 * adding a column to `Profile` breaks in one place instead of every suite.
 */
export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    email: 'student@example.com',
    full_name: 'Kwandu Mthethwa',
    avatar_url: null,
    university: 'University of Cape Town',
    degree: 'BSc Computer Science',
    semester: 1,
    timezone: 'Africa/Johannesburg',
    goals: ['grades'],
    role: 'student',
    plan: 'free',
    xp: 0,
    level: 1,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    onboarding_completed: true,
    tour_completed: true,
    tours_seen: [],
    tour_replay_hint: false,
    notification_prefs: DEFAULT_NOTIFICATION_PREFS,
    language: 'en',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}
