import { describe, expect, it } from 'vitest'
import { levelForXp, levelProgress, xpForLevel } from '@/services/gamification-service'

describe('gamification level curve', () => {
  it('places thresholds on the quadratic curve', () => {
    expect(xpForLevel(1)).toBe(0)
    expect(xpForLevel(2)).toBe(100)
    expect(xpForLevel(3)).toBe(400)
    expect(xpForLevel(5)).toBe(1600)
    expect(xpForLevel(10)).toBe(8100)
  })

  it('maps XP back to the correct level', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(99)).toBe(1)
    expect(levelForXp(100)).toBe(2)
    expect(levelForXp(399)).toBe(2)
    expect(levelForXp(400)).toBe(3)
    expect(levelForXp(1600)).toBe(5)
  })

  it('reports progress within the current level', () => {
    const progress = levelProgress(250)
    expect(progress.level).toBe(2)
    expect(progress.current).toBe(150) // 250 - 100
    expect(progress.needed).toBe(300) // 400 - 100
    expect(progress.percent).toBe(50)
  })

  it('is internally consistent: level floor round-trips', () => {
    for (let level = 1; level <= 15; level += 1) {
      expect(levelForXp(xpForLevel(level))).toBe(level)
    }
  })
})
