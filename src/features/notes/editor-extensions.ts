import type { Editor } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'

/**
 * The note editor's schema.
 *
 * Shared between the editor component and the round-trip tests on purpose: the
 * guarantee this editor rests on — that a note survives being opened and saved
 * — is only worth anything if the tests exercise the exact schema that ships.
 *
 * Notes are stored as Markdown (`notes.content_md`), so **every node and mark
 * here must be expressible in Markdown**. Anything that isn't survives in the
 * editor and then quietly vanishes the next time the note is opened, which is
 * far worse than never having offered it. That rules out a few things a rich
 * text editor would normally give you for free — see `underline` below.
 */
export const NOTE_EDITOR_EXTENSIONS = [
  StarterKit.configure({
    // Markdown has no underline. StarterKit enables it by default and it would
    // reach students through Ctrl+U whether or not a toolbar button existed,
    // then be silently dropped on save. Strikethrough covers the same intent
    // and does round-trip.
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  // Without this, markdown-it parses `![alt](url)` but the schema has no node to
  // put it in, so the image is dropped and the note comes back missing it. Any
  // construct the parser understands must have a home in the schema.
  Image,
  TableKit.configure({ table: { resizable: false } }),
  Markdown.configure({
    html: false,
    // Blank lines between list items read as deliberate spacing in the editor
    // but are noise in the file; keep lists tight.
    tightLists: true,
    linkify: true,
    breaks: false,
    transformPastedText: true,
    transformCopiedText: true,
  }),
]

/**
 * `tiptap-markdown` hangs its serializer off editor storage but ships no
 * declaration for it, so this states the contract once instead of casting at
 * every call site.
 */
declare module '@tiptap/core' {
  interface Storage {
    markdown: { getMarkdown(): string }
  }
}

/** The editor's content as Markdown — the form notes are stored in. */
export function getMarkdown(editor: Editor): string {
  return editor.storage.markdown.getMarkdown()
}
