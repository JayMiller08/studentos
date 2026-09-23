import { describe, expect, it } from 'vitest'
// `?raw` so the stylesheet is checked as it ships, the way the SQL tests read migrations.
import css from '../rich-note-editor.css?raw'

const UNCHECKED = ".note-editor ul[data-type='taskList'] > li > div > p"
const CHECKED = ".note-editor ul[data-type='taskList'] > li[data-checked='true'] > div > p"

/** The declarations inside one rule, by its exact selector. */
function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'))
  if (!match) throw new Error(`no rule for ${selector}`)
  return match[1]!
}

describe('the checklist strike-through', () => {
  it('draws no decoration on an item that is not ticked', () => {
    // Regression: the line was drawn on every item and merely made transparent,
    // so it faded in on tick. Browsers paint a spell-check highlight by
    // re-drawing the word and its decorations in the highlight's own colour,
    // which made that invisible line show up as a strike through any misspelled
    // word a student typed.
    expect(declarations(UNCHECKED)).not.toMatch(/text-decoration/)
  })

  it('strikes an item through once it is ticked', () => {
    expect(declarations(CHECKED)).toMatch(/text-decoration-line:\s*line-through/)
  })

  it('never hides a decoration behind a transparent colour', () => {
    expect(css).not.toMatch(/text-decoration-color:\s*transparent/)
  })
})
