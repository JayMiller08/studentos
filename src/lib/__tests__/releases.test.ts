import { describe, expect, it } from 'vitest'
import { LATEST_RELEASE_DATE, RELEASES, unseenReleases } from '@/lib/releases'

/**
 * The release date is not decoration — it is the sort key *and* the marker of
 * what a student has already been shown. If the list is out of order or two
 * entries share a date, students silently stop being told what changed.
 */
describe('the release list holds its invariants', () => {
  it('dates every release as yyyy-mm-dd', () => {
    for (const release of RELEASES) expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('gives each release its own date', () => {
    const dates = RELEASES.map((release) => release.date)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('lists releases newest first', () => {
    const dates = RELEASES.map((release) => release.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('describes something in every release', () => {
    for (const release of RELEASES) {
      expect(release.title.length).toBeGreaterThan(0)
      expect(release.changes.length).toBeGreaterThan(0)
    }
  })

  it('points LATEST_RELEASE_DATE at the newest entry', () => {
    expect(LATEST_RELEASE_DATE).toBe(RELEASES[0]?.date)
  })
})

describe('deciding what a student still needs to see', () => {
  it('shows nothing to an account created after the latest release', () => {
    // A student who signs up today has never used the previous version, so a
    // changelog describing it would be noise.
    expect(unseenReleases(null, '2099-01-01')).toEqual([])
  })

  it('shows the backlog to an existing account that has seen nothing', () => {
    expect(unseenReleases(null, '2000-01-01')).toEqual(RELEASES)
  })

  it('shows nothing once the marker is at the latest release', () => {
    expect(unseenReleases(LATEST_RELEASE_DATE, '2000-01-01')).toEqual([])
  })

  it('shows only what landed after the marker', () => {
    const [newest] = RELEASES
    if (!newest) return
    const older = RELEASES.slice(1)[0]
    if (!older) return
    expect(unseenReleases(older.date, '2000-01-01')).toContain(newest)
  })

  it('treats an empty marker as never having been shown', () => {
    expect(unseenReleases('', '2000-01-01')).toEqual(RELEASES)
  })
})
