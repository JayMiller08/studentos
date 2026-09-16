// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { getMarkdown, NOTE_EDITOR_EXTENSIONS } from '../editor-extensions'
import { lineNumbers, pickerValueFor } from '../note-code-block'

const NL = String.fromCharCode(10)
/** Three backticks, spelled out so no escape layer can mangle them. */
const FENCE = String.fromCharCode(96).repeat(3)

let editor: Editor | null = null
let element: HTMLElement | null = null

afterEach(() => {
  editor?.destroy()
  element?.remove()
  editor = null
  element = null
})

/** Mount a real editor view, so node views and decorations actually render. */
function mount(markdown: string): Editor {
  element = document.createElement('div')
  document.body.append(element)
  editor = new Editor({ element, extensions: NOTE_EDITOR_EXTENSIONS, content: markdown })
  return editor
}

/** Type one keystroke at a time, the way input rules see a real keyboard. */
function type(ed: Editor, text: string) {
  for (const character of text) {
    const { from, to } = ed.state.selection
    const insert = () => ed.state.tr.insertText(character, from, to)
    const handled = ed.view.someProp('handleTextInput', (handler) =>
      handler(ed.view, from, to, character, insert),
    )
    if (!handled) ed.view.dispatch(insert())
  }
}

function codeBlock(): HTMLElement {
  const found = element?.querySelector<HTMLElement>('.note-code')
  if (!found) throw new Error('no code block rendered')
  return found
}

function picker(): HTMLSelectElement {
  const found = codeBlock().querySelector('select')
  if (!found) throw new Error('no language picker rendered')
  return found
}

describe('starting a code block', () => {
  it('turns the line into a code block the moment the third backtick is typed', () => {
    const ed = mount('')
    ed.commands.setTextSelection(1)
    type(ed, FENCE)
    expect(ed.state.doc.firstChild?.type.name).toBe('codeBlock')
    expect(ed.state.doc.firstChild?.textContent).toBe('')
  })

  it('does not fire partway through a sentence', () => {
    const ed = mount('Use')
    ed.commands.setTextSelection(4)
    type(ed, ' ' + FENCE)
    expect(ed.state.doc.firstChild?.type.name).toBe('paragraph')
  })

  it('does not start a block inside a block', () => {
    const ed = mount(FENCE + NL + 'x' + NL + FENCE)
    ed.commands.setTextSelection(2)
    type(ed, FENCE)
    // The editor always keeps an empty paragraph after a block that ends the
    // document, so count code blocks rather than top-level nodes.
    const blocks: string[] = []
    ed.state.doc.forEach((child) => {
      if (child.type.name === 'codeBlock') blocks.push(child.textContent)
    })
    expect(blocks).toEqual(['x' + FENCE])
  })
})

describe('the line-number gutter', () => {
  it('numbers every line', () => {
    mount(FENCE + 'java' + NL + 'a' + NL + 'b' + NL + 'c' + NL + FENCE)
    expect(codeBlock().querySelector('.note-code__gutter')?.textContent).toBe(['1', '2', '3'].join(NL))
  })

  it('keeps count as lines are added', () => {
    const ed = mount(FENCE + NL + 'a' + NL + FENCE)
    ed.view.dispatch(ed.state.tr.insertText(NL + 'b', 2))
    expect(codeBlock().querySelector('.note-code__gutter')?.textContent).toBe('1' + NL + '2')
  })

  it('still shows line 1 for an empty block', () => {
    expect(lineNumbers('')).toBe('1')
  })
})

describe('the language picker', () => {
  it('shows the language the block names', () => {
    mount(FENCE + 'java' + NL + 'class Box {}' + NL + FENCE)
    expect(picker().value).toBe('java')
  })

  it('understands a short alias', () => {
    mount(FENCE + 'py' + NL + 'x = 1' + NL + FENCE)
    expect(picker().value).toBe('python')
  })

  it('shows auto-detect when the block names no language', () => {
    mount(FENCE + NL + 'x = 1' + NL + FENCE)
    expect(picker().value).toBe('')
  })

  it('keeps a language it does not list, rather than mislabelling the block', () => {
    mount(FENCE + 'rust' + NL + 'fn main() {}' + NL + FENCE)
    expect(picker().value).toBe('rust')
    expect(picker().selectedOptions[0]?.textContent).toBe('rust')
  })

  it('writes the chosen language into the note', () => {
    const ed = mount(FENCE + NL + 'x = 1' + NL + FENCE)
    picker().value = 'python'
    picker().dispatchEvent(new Event('change'))
    expect(getMarkdown(ed).startsWith(FENCE + 'python')).toBe(true)
  })

  it('maps known names and aliases, and nothing else', () => {
    expect(pickerValueFor(null)).toBe('')
    expect(pickerValueFor('JS')).toBe('javascript')
    expect(pickerValueFor('c#')).toBe('csharp')
    expect(pickerValueFor('html')).toBe('html')
    expect(pickerValueFor('cobol')).toBeNull()
  })
})

describe('highlighting', () => {
  const keywords = () => [...codeBlock().querySelectorAll('.hljs-keyword')].map((node) => node.textContent)

  it('colours code in the chosen language', () => {
    mount(FENCE + 'java' + NL + 'public class Box {}' + NL + FENCE)
    expect(keywords()).toEqual(expect.arrayContaining(['public', 'class']))
  })

  it('detects the language when none is chosen', () => {
    mount(FENCE + NL + 'def greet(name):' + NL + '    return name' + NL + FENCE)
    expect(keywords()).toEqual(expect.arrayContaining(['def', 'return']))
  })
})
