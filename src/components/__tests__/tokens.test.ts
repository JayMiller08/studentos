import { describe, expect, it } from 'vitest'

/**
 * Every component source, read as text.
 *
 * Components pulled from an outside registry (Watermelon) ship hard-coded
 * `zinc-*` utilities and their own `dark:` variants. Dropped in as-is they look
 * almost right and drift from the theme: they ignore the oklch tokens, and they
 * do not follow a theme change. Adopting one means retokenising it — this is
 * what stops that step being forgotten.
 */
const sources = import.meta.glob('../**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Palettes with no place in this app: the theme owns colour. */
const RAW_PALETTES =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:zinc|slate|gray|neutral|stone)-\d{2,3}\b/

/**
 * A `dark:` variant on a raw palette — the signature of a component written
 * against someone else's theme. `dark:bg-success/20` is fine: that is a token
 * being tuned per theme, which a few components legitimately need.
 */
const DARK_VARIANT = new RegExp(`\\bdark:${RAW_PALETTES.source.replace(/^\\b/, '')}`)

describe('component styling stays on the design tokens', () => {
  it('finds component sources to check', () => {
    // A glob that silently matches nothing would make every assertion below vacuous.
    expect(Object.keys(sources).length).toBeGreaterThan(20)
  })

  it.each(Object.keys(sources))('%s uses no raw colour palette', (path) => {
    const match = sources[path]!.match(RAW_PALETTES)
    expect(
      match?.[0],
      `${path} hard-codes "${match?.[0]}". Use a semantic token (bg-card, text-muted-foreground, border-border) or add one.`,
    ).toBeUndefined()
  })

  it.each(Object.keys(sources))('%s leaves dark mode to the tokens', (path) => {
    const match = sources[path]!.match(DARK_VARIANT)
    expect(
      match?.[0],
      `${path} uses "${match?.[0]}". Tokens already flip with the theme; a per-component dark: variant will drift from them.`,
    ).toBeUndefined()
  })
})
