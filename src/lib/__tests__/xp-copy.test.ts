import { describe, expect, it } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig, which
// deliberately excludes Node types because everything else here is browser code.
import landing from '../../features/landing/landing-page.tsx?raw'
import profileService from '../../services/profile-service.ts?raw'
import { levelForXp } from '@/services/gamification-service'

/**
 * Sample figures are still figures. A student who has just reached level 4 at
 * 900 XP and sees "Level 4 · 780 XP" on the landing page is right to wonder
 * which of the two is wrong, so every sample level is the level its XP reaches.
 */

describe('sample levels', () => {
  it('shows a level on the landing page that its XP reaches', () => {
    const samples = [...landing.matchAll(/Level (\d+) · ([\d,]+) XP/g)]
    expect(samples.length).toBeGreaterThan(0)
    for (const [text, level, xp] of samples) {
      expect(levelForXp(Number(xp!.replaceAll(',', ''))), text).toBe(Number(level))
    }
  })

  it('starts the demo student at the level their XP reaches', () => {
    const [, xp, level] = profileService.match(/xp: (\d+),\s*level: (\d+),\s*current_streak: 12/) ?? []
    expect(xp, 'the demo student sets xp and level together').toBeDefined()
    expect(levelForXp(Number(xp))).toBe(Number(level))
  })
})
