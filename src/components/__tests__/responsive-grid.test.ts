import { describe, expect, it } from 'vitest'

/**
 * Every grid that sets its columns from a breakpoint up also sets them for
 * phones.
 *
 * Without a base `grid-cols-*` a grid falls back to an implicit `auto`
 * column, which grows to its widest item's content. On a 375px phone one
 * long note preview stretched the whole dashboard to 1,136px and the browser
 * zoomed the page out; the planner and squad pages did the same at 360px.
 * `grid-cols-1` is `minmax(0, 1fr)`: one column that may shrink to the screen.
 */

const files = {
  ...(import.meta.glob(['../../features/**/*.tsx', '!../../features/**/__tests__/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob(['../../app/**/*.tsx', '!../../app/**/__tests__/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob(['../**/*.tsx', '!../**/__tests__/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>),
}

/** className strings that make a grid with columns only from a breakpoint up. */
function phoneUnsafeGrids(source: string): string[] {
  return [...source.matchAll(/className="([^"]*)"/g)]
    .map((match) => match[1]!)
    .filter((classes) => {
      const tokens = classes.split(/\s+/)
      return (
        tokens.includes('grid') &&
        tokens.some((token) => /^(sm|md|lg|xl|2xl):grid-cols-/.test(token)) &&
        !tokens.some((token) => token.startsWith('grid-cols-'))
      )
    })
}

describe('responsive grids', () => {
  it('finds the files to check', () => {
    // A glob that silently matched nothing would make the check vacuous.
    expect(Object.keys(files).length).toBeGreaterThan(80)
  })

  it('give phones a column that can shrink', () => {
    const offenders = Object.entries(files).flatMap(([name, source]) =>
      phoneUnsafeGrids(source).map((classes) => `${name}: "${classes}"`),
    )
    expect(offenders).toEqual([])
  })

  it('catches the grid that broke the dashboard', () => {
    expect(phoneUnsafeGrids('<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">')).toHaveLength(1)
    expect(phoneUnsafeGrids('<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">')).toEqual([])
    expect(phoneUnsafeGrids('<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">')).toEqual([])
    expect(phoneUnsafeGrids('<div className="flex gap-2 md:grid-cols-2">')).toEqual([])
  })
})
