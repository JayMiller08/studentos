// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { getMarkdown, NOTE_EDITOR_EXTENSIONS } from '../editor-extensions'

/**
 * Notes are written in a rich-text editor but stored as Markdown, so every
 * note makes a round trip through this schema each time it is opened. These
 * tests are the guarantee behind that decision.
 *
 * The property that matters is **stability**, not byte-identity. Opening a note
 * canonicalises its Markdown — a literal `*` picks up an escape, a two-space
 * line break becomes a backslash — and that is fine, because it renders the
 * same and settles immediately. What would not be fine is a note that drifts a
 * little further every time a student opens it, or one that comes back with
 * something missing.
 */
function toMarkdown(markdown: string): string {
  const editor = new Editor({ extensions: NOTE_EDITOR_EXTENSIONS, content: markdown })
  const out = getMarkdown(editor)
  editor.destroy()
  return out.trim()
}

const NL = String.fromCharCode(10)
/** A literal backslash, spelled out so no escape layer can mangle it. */
const BS = String.fromCharCode(92)

const CONSTRUCTS: Array<[string, string]> = [
  ['headings', '# One' + NL + NL + '## Two' + NL + NL + '### Three'],
  ['bold and italic', 'Some **bold** and *italic* text.'],
  ['strikethrough', 'A ~~struck~~ word.'],
  ['inline code', 'Call `useEffect()` here.'],
  ['bullet list', '- alpha' + NL + '- beta'],
  ['nested bullet list', '- alpha' + NL + '  - nested' + NL + '- beta'],
  ['ordered list', '1. first' + NL + '2. second'],
  ['task list', '- [ ] todo' + NL + NL + '- [x] done'],
  ['blockquote', '> A quoted line.'],
  ['fenced code', '```js' + NL + 'const x = 1' + NL + '```'],
  ['link', 'See [the docs](https://example.com) for more.'],
  ['horizontal rule', 'above' + NL + NL + '---' + NL + NL + 'below'],
  ['table', '| a | b |' + NL + '| --- | --- |' + NL + '| 1 | 2 |'],
  ['image', '![alt text](https://example.com/i.png)'],
  ['unicode', 'Solve det(A - lambda I) = 0.'],
]

describe('every supported construct survives the round trip', () => {
  it.each(CONSTRUCTS)('%s is not emptied', (_label, markdown) => {
    // The failure that matters most: a note opens and its content is gone.
    expect(toMarkdown(markdown)).not.toBe('')
  })

  it.each(CONSTRUCTS)('%s is stable across repeated opens', (_label, markdown) => {
    const once = toMarkdown(markdown)
    expect(toMarkdown(once)).toBe(once)
  })
})

describe('the details a student would notice going missing', () => {
  it('keeps an image and its source', () => {
    // Regression: without the Image extension in the schema, markdown-it parsed
    // the image and then the node was dropped, emptying the note.
    expect(toMarkdown('![diagram](https://example.com/graph.png)')).toContain(
      'https://example.com/graph.png',
    )
  })

  it('keeps every cell of a table', () => {
    const out = toMarkdown('| Term | Meaning |' + NL + '| --- | --- |' + NL + '| Heap | A tree |')
    for (const cell of ['Term', 'Meaning', 'Heap', 'A tree']) expect(out).toContain(cell)
  })

  it('keeps which checklist items are ticked', () => {
    const out = toMarkdown('- [ ] revise' + NL + NL + '- [x] submitted')
    expect(out).toContain('[ ] revise')
    expect(out).toContain('[x] submitted')
  })

  it('keeps the language of a code block', () => {
    expect(toMarkdown('```python' + NL + 'x = 1' + NL + '```')).toContain('```python')
  })

  it('keeps nesting depth in lists', () => {
    const out = toMarkdown('- top' + NL + '  - nested' + NL + '    - deeper')
    expect(out).toContain('nested')
    expect(out).toContain('deeper')
  })

  it('does not mistake plain prose for formatting', () => {
    // A student writing about multiplication should not end up with italics.
    const out = toMarkdown('Use 3 * 4 and snake_case_names here.')
    expect(toMarkdown(out)).toBe(out)
    expect(out).toContain('snake')
  })
})

describe('notes written before the rich editor shipped', () => {
  const LEGACY =
    '# Dijkstra vs A*' + NL + NL +
    '**Dijkstra** explores uniformly in every direction.' + NL + NL +
    '- no heuristic' + NL +
    '- guaranteed optimal' + NL + NL +
    '1. initialise' + NL +
    '2. relax edges' + NL + NL +
    '> A* = Dijkstra + heuristic' + NL + NL +
    '```python' + NL +
    'open_set = []' + NL +
    '```'

  it('keeps all of a real Markdown note', () => {
    const out = toMarkdown(LEGACY)
    for (const fragment of [
      'Dijkstra vs A',
      '**Dijkstra**',
      'no heuristic',
      'guaranteed optimal',
      'initialise',
      'relax edges',
      '> A' + BS + '* = Dijkstra + heuristic',
      '```python',
      'open_set = []',
    ]) {
      expect(out).toContain(fragment)
    }
  })

  it('settles after the first open rather than drifting', () => {
    const once = toMarkdown(LEGACY)
    expect(toMarkdown(once)).toBe(once)
  })

  it('escapes a literal asterisk so it stays literal', () => {
    // `A*` picks up a backslash on first open. That is correct — unescaped, a
    // stray asterisk is emphasis syntax — and it renders as "A*" either way.
    // It is also the reason the editor must baseline its idea of "saved"
    // against the normalised text: otherwise merely opening this note would
    // count as an edit and push a junk entry into version history.
    expect(toMarkdown('Compare A* and B*.')).toBe('Compare A' + BS + '* and B' + BS + '*.')
  })
})
