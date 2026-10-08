import { describe, expect, it } from 'vitest'
import {
  formatCode,
  handleProblem,
  nameProblem,
  normalizeCode,
  ordinal,
  randomCode,
  rankStandings,
  SQUAD_CODE_ALPHABET,
  SQUAD_MESSAGES,
  tidyName,
} from '@/lib/squads'

describe('codes', () => {
  it('reads a code however it was typed', () => {
    expect(normalizeCode(' abcd-efgh ')).toBe('ABCDEFGH')
    expect(normalizeCode('AB CD.EF_GH')).toBe('ABCDEFGH')
  })

  it('shows a code in two halves', () => {
    expect(formatCode('ABCDEFGH')).toBe('ABCD-EFGH')
    expect(formatCode('ABC')).toBe('ABC')
  })

  it('makes eight characters from the alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = randomCode()
      expect(code).toMatch(new RegExp(`^[${SQUAD_CODE_ALPHABET}]{8}$`))
    }
  })

  it('throws away the bytes that would favour some characters', () => {
    // 248 and up would map unevenly onto 31 characters; they must be skipped.
    let calls = 0
    const bytes = (count: number) => {
      calls += 1
      return calls === 1 ? Array.from({ length: count }, () => 250) : Array.from({ length: count }, (_, i) => i)
    }
    expect(randomCode(bytes)).toBe(SQUAD_CODE_ALPHABET.slice(0, 8))
    expect(calls).toBe(2)
  })
})

describe('names and handles', () => {
  it('tidies a name the way the database stores it', () => {
    expect(tidyName('  Graph   Theory\tCrew ')).toBe('Graph Theory Crew')
  })

  it('takes names of 2 to 40 characters', () => {
    expect(nameProblem('ab')).toBeNull()
    expect(nameProblem(' a ')).toBe(SQUAD_MESSAGES.name)
    expect(nameProblem('x'.repeat(40))).toBeNull()
    expect(nameProblem('x'.repeat(41))).toBe(SQUAD_MESSAGES.name)
  })

  it('takes handles of 3 to 20 letters, numbers and underscores', () => {
    expect(handleProblem('night_owl')).toBeNull()
    expect(handleProblem(' Emma_2 ')).toBeNull()
    expect(handleProblem('xo')).toBe(SQUAD_MESSAGES.handle)
    expect(handleProblem('x'.repeat(21))).toBe(SQUAD_MESSAGES.handle)
    expect(handleProblem('no spaces')).toBe(SQUAD_MESSAGES.handle)
    expect(handleProblem('naïve')).toBe(SQUAD_MESSAGES.handle)
  })
})

describe('the table', () => {
  const row = (handle: string, weeklyXp: number) => ({ handle, weeklyXp })

  it('ranks by weekly XP, ties sharing a place', () => {
    const ranked = rankStandings([row('c', 50), row('a', 120), row('B', 120), row('d', 10)])
    expect(ranked.map(({ row: r, rank }) => `${rank}:${r.handle}`)).toEqual(['1:a', '1:B', '3:c', '4:d'])
  })

  it('does not reorder the rows it was given', () => {
    const rows = [row('z', 1), row('y', 2)]
    rankStandings(rows)
    expect(rows.map((r) => r.handle)).toEqual(['z', 'y'])
  })

  it('says a place in words', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ])
  })
})
