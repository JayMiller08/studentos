import { describe, expect, it } from 'vitest'
import { ALL_TOUR_IDS, PAGE_TOURS, REPLAY_HINT_TOUR, tourForPath, withTourDefaults } from '@/lib/tours'
import { makeProfile } from '@/test/factories'
import type { Profile } from '@/types/models'

describe('the tour registry', () => {
  it('gives every tour a unique id and route', () => {
    expect(new Set(ALL_TOUR_IDS).size).toBe(PAGE_TOURS.length)
    expect(new Set(PAGE_TOURS.map((tour) => tour.path)).size).toBe(PAGE_TOURS.length)
  })

  it('covers every route reachable from the app shell', () => {
    // Nav is the promise: anything a user can click to should introduce itself.
    const navPaths = [
      '/app',
      '/app/planner',
      '/app/assignments',
      '/app/calendar',
      '/app/focus',
      '/app/smart-plan',
      '/app/coach',
      '/app/analytics',
      '/app/habits',
      '/app/budget',
      '/app/notes',
      '/app/achievements',
      '/app/billing',
      '/app/settings',
      '/app/admin',
    ]
    for (const path of navPaths) {
      expect(tourForPath(path), `no tour registered for ${path}`).not.toBeNull()
    }
  })

  it('gives every step something to say', () => {
    for (const tour of [...PAGE_TOURS, REPLAY_HINT_TOUR]) {
      expect(tour.steps.length).toBeGreaterThan(0)
      for (const step of tour.steps) {
        expect(step.title.trim()).not.toBe('')
        expect(step.body.trim()).not.toBe('')
      }
    }
  })

  it('keeps the replay hint out of the page tours', () => {
    // It is a one-off pointer, not a page — persisting it as one would make a
    // real page tour unreachable.
    expect(ALL_TOUR_IDS).not.toContain(REPLAY_HINT_TOUR.id)
  })
})

describe('tourForPath', () => {
  it('matches a route exactly', () => {
    expect(tourForPath('/app')?.id).toBe('dashboard')
    expect(tourForPath('/app/habits')?.id).toBe('habits')
  })

  it('ignores a trailing slash', () => {
    expect(tourForPath('/app/notes/')?.id).toBe('notes')
  })

  it('returns null for routes outside the app shell', () => {
    expect(tourForPath('/')).toBeNull()
    expect(tourForPath('/auth/login')).toBeNull()
    expect(tourForPath('/app/nope')).toBeNull()
  })
})

describe('withTourDefaults', () => {
  it('leaves an already-migrated profile untouched', () => {
    const profile = makeProfile({ tours_seen: ['dashboard'], tour_replay_hint: false })
    expect(withTourDefaults(profile)).toBe(profile)
  })

  it('treats a legacy row that finished the old tour as an experienced user', () => {
    // Pre-00007 row: no tour columns at all, old single-tour flag set.
    const legacy = makeProfile({ tour_completed: true }) as Partial<Profile>
    delete legacy.tours_seen
    delete legacy.tour_replay_hint

    const migrated = withTourDefaults(legacy as Profile)

    // Nothing auto-plays at them; they get pointed at the replay control.
    expect(migrated.tours_seen).toEqual([...ALL_TOUR_IDS])
    expect(migrated.tour_replay_hint).toBe(true)
  })

  it('lets a legacy row that never took the old tour see every page tour', () => {
    const legacy = makeProfile({ tour_completed: false }) as Partial<Profile>
    delete legacy.tours_seen
    delete legacy.tour_replay_hint

    const migrated = withTourDefaults(legacy as Profile)

    expect(migrated.tours_seen).toEqual([])
    expect(migrated.tour_replay_hint).toBe(false)
  })

  it('keeps a dismissed pointer dismissed while the row is still half-migrated', () => {
    // Dismissing writes only `tour_replay_hint`. Re-deriving it from
    // `tour_completed` would bring the pointer back on every single reload.
    const legacy = makeProfile({ tour_completed: true, tour_replay_hint: false }) as Partial<Profile>
    delete legacy.tours_seen

    const migrated = withTourDefaults(legacy as Profile)

    expect(migrated.tour_replay_hint).toBe(false)
    expect(migrated.tours_seen).toEqual([...ALL_TOUR_IDS])
  })

  it('does not mutate the row it is given', () => {
    const legacy = makeProfile({ tour_completed: true }) as Partial<Profile>
    delete legacy.tours_seen

    withTourDefaults(legacy as Profile)

    expect(legacy.tours_seen).toBeUndefined()
  })
})
