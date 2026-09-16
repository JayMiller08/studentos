import { textblockTypeInputRule } from '@tiptap/core'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import {
  CODE_LANGUAGES,
  detectLanguage,
  labelFor,
  lowlight,
  pickerValueFor,
} from '@/features/notes/code-languages'

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
      const auto = new Option('Auto-detect', '')
      picker.append(auto)
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

        // With nothing chosen, name what was detected — "Java (auto)" — so the
        // colours on screen are explained, and a wrong guess is one click from
        // being corrected. It is the same answer the highlighter used.
        const detected = value === '' ? detectLanguage(current.textContent) : null
        const autoText = detected ? labelFor(detected) + ' (auto)' : 'Auto-detect'
        if (auto.text !== autoText) auto.text = autoText

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
