import { textblockTypeInputRule } from '@tiptap/core'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import matlab from 'highlight.js/lib/languages/matlab'
import php from 'highlight.js/lib/languages/php'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { createLowlight } from 'lowlight'

/**
 * Grammars for the languages students actually keep notes in.
 *
 * A short list rather than lowlight's `common` bundle, for two reasons: every
 * grammar ships in the notes chunk, and auto-detection improves with fewer
 * lookalikes — a Java snippet is less likely to be read as some other C-family
 * language when fewer of them are competing for it.
 */
export const lowlight = createLowlight({
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  kotlin,
  matlab,
  php,
  plaintext,
  python,
  r,
  sql,
  typescript,
  xml,
})

/** What the language picker offers, in the order it offers it. */
export const CODE_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'bash', label: 'Bash' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'html', label: 'HTML' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'matlab', label: 'MATLAB' },
  { value: 'php', label: 'PHP' },
  { value: 'python', label: 'Python' },
  { value: 'r', label: 'R' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
]

/**
 * Short names a block may already carry — from pasted Markdown, or a student who
 * typed ```py — mapped to the picker entry that means the same thing. lowlight
 * highlights every one of these already; this only keeps the label in agreement.
 */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  h: 'c',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  golang: 'go',
  htm: 'html',
  xhtml: 'html',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  kt: 'kotlin',
  kts: 'kotlin',
  py: 'python',
  ts: 'typescript',
  tsx: 'typescript',
  text: 'plaintext',
  txt: 'plaintext',
}

/**
 * The picker entry for a block's language: '' for auto-detect, the matching
 * entry for a known name or alias, or null when the list has no such language.
 */
export function pickerValueFor(language: string | null | undefined): string | null {
  if (!language) return ''
  const key = language.toLowerCase()
  const value = LANGUAGE_ALIASES[key] ?? key
  return CODE_LANGUAGES.some((entry) => entry.value === value) ? value : null
}

/** One number per line, newline-separated. An empty block still has a line 1. */
export function lineNumbers(text: string): string {
  const count = text.split('\n').length
  return Array.from({ length: count }, (_, index) => String(index + 1)).join('\n')
}

/**
 * Code blocks in notes: coloured as you type, with numbered lines and a language
 * picker in the corner.
 *
 * It is the same `codeBlock` node as before, so a note is still an ordinary
 * Markdown fence. The gutter and the picker are drawn by the node view and never
 * enter the document — not the saved file, not search, not the AI coach's copy.
 */
export const NoteCodeBlock = CodeBlockLowlight.extend({
  addInputRules() {
    return [
      // Three backticks become a code block the moment the third one lands.
      // TipTap's own rule waits for a space or Enter after them, which looks
      // like nothing happened. The language is then picked, or detected.
      textblockTypeInputRule({ find: /^\x60{3}$/, type: this.type }),
      ...(this.parent?.() ?? []),
    ]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node

      const dom = document.createElement('div')
      dom.className = 'note-code'

      // Chrome, not content: contenteditable off, so the caret never lands in it.
      const corner = document.createElement('div')
      corner.className = 'note-code__corner'
      corner.contentEditable = 'false'

      const picker = document.createElement('select')
      picker.className = 'note-code__language'
      picker.setAttribute('aria-label', 'Code language')
      picker.append(new Option('Auto-detect', ''))
      for (const { value, label } of CODE_LANGUAGES) picker.append(new Option(label, value))
      // Holds a language the list doesn't carry (```rust from pasted Markdown), so
      // the label shows what the block says instead of the nearest thing we list.
      const unlisted = new Option('', '')
      unlisted.hidden = true
      picker.append(unlisted)

      picker.addEventListener('change', () => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            language: picker.value || null,
          }),
        )
      })
      corner.append(picker)

      const body = document.createElement('div')
      body.className = 'note-code__body'

      const gutter = document.createElement('div')
      gutter.className = 'note-code__gutter'
      gutter.contentEditable = 'false'
      gutter.setAttribute('aria-hidden', 'true')

      const pre = document.createElement('pre')
      pre.className = 'note-code__pre'
      // Red squiggles under identifiers are noise, not help.
      pre.spellcheck = false
      const code = document.createElement('code')
      pre.append(code)

      body.append(gutter, pre)
      dom.append(corner, body)

      const render = () => {
        const language = (current.attrs.language as string | null | undefined) ?? null

        const numbers = lineNumbers(current.textContent)
        if (gutter.textContent !== numbers) gutter.textContent = numbers

        const value = pickerValueFor(language)
        if (value === null) {
          unlisted.value = language ?? ''
          unlisted.text = language ?? ''
          unlisted.hidden = false
          picker.value = unlisted.value
        } else {
          unlisted.hidden = true
          picker.value = value
        }
        dom.dataset.language = value === '' ? 'auto' : (language ?? 'auto')
      }
      render()

      return {
        dom,
        contentDOM: code,
        update(updated) {
          if (updated.type !== current.type) return false
          current = updated
          render()
          return true
        },
        // Only text inside <code> is document content. The gutter, the picker
        // and the attributes set above are ours, and re-reading them as edits
        // would make ProseMirror redraw the block on every keystroke.
        ignoreMutation(mutation) {
          if (mutation.type === 'selection') return !code.contains(mutation.target)
          if (mutation.type === 'attributes') return true
          return !code.contains(mutation.target)
        },
        // Clicks and keys on the picker belong to the picker, not the editor.
        stopEvent(event) {
          return event.target instanceof Node && corner.contains(event.target)
        },
      }
    }
  },
}).configure({
  lowlight,
  defaultLanguage: null,
  enableTabIndentation: true,
  tabSize: 4,
})
