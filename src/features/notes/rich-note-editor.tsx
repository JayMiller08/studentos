import type { Editor } from '@tiptap/core'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { getMarkdown, NOTE_EDITOR_EXTENSIONS } from '@/features/notes/editor-extensions'
import { cn } from '@/lib/utils'

const BUTTON_CLASS =
  'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/60 inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40'

/**
 * A formatting control.
 *
 * `aria-pressed` rather than a visual highlight alone: a student using a screen
 * reader needs to know the cursor is already inside a bold run, and the
 * shortcut in the tooltip is how the keyboard-inclined discover there is one.
 */
function ToolbarButton({
  label,
  shortcut,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  shortcut?: string
  icon: typeof Bold
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      title={shortcut ? label + ' (' + shortcut + ')' : label}
      // Formatting applies to the current selection, and a mousedown that moved
      // focus out of the editor would collapse that selection first.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(BUTTON_CLASS, active && 'bg-accent text-foreground')}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  )
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [href, setHref] = React.useState('')

  function apply() {
    const url = href.trim()
    if (!url) return
    // A bare "example.com" is what a student will type. Without a scheme the
    // browser resolves it against the app's own origin and the link is broken.
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : 'https://' + url
    editor.chain().focus().extendMarkRange('link').setLink({ href: withScheme }).run()
    setHref('')
    setOpen(false)
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setHref((editor.getAttributes('link').href as string) ?? '')
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add link"
            title="Add link"
            onMouseDown={(event) => event.preventDefault()}
            className={cn(BUTTON_CLASS, active && 'bg-accent text-foreground')}
          >
            <Link2 aria-hidden className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-72 gap-2 p-2">
          <Input
            autoFocus
            value={href}
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                apply()
              }
            }}
            placeholder="example.com"
            aria-label="Link address"
            className="h-8"
          />
          <Button size="sm" className="h-8" onClick={apply}>
            Add
          </Button>
        </PopoverContent>
      </Popover>
      {active ? (
        <ToolbarButton
          label="Remove link"
          icon={Link2Off}
          onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
        />
      ) : null}
    </>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  // Subscribing to a narrow slice keeps every keystroke from re-rendering the
  // whole toolbar; the buttons only care about what is active right now.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 border-y py-1.5"
    >
      <ToolbarButton
        label="Heading 1"
        icon={Heading1}
        active={state.h1}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        label="Heading 2"
        icon={Heading2}
        active={state.h2}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="Heading 3"
        icon={Heading3}
        active={state.h3}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <ToolbarButton
        label="Bold"
        shortcut="Ctrl+B"
        icon={Bold}
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italic"
        shortcut="Ctrl+I"
        icon={Italic}
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="Strikethrough"
        icon={Strikethrough}
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        label="Code"
        icon={Code}
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <ToolbarButton
        label="Bulleted list"
        icon={List}
        active={state.bullet}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Numbered list"
        icon={ListOrdered}
        active={state.ordered}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Checklist"
        icon={ListChecks}
        active={state.task}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      />
      <ToolbarButton
        label="Quote"
        icon={Quote}
        active={state.quote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />

      <Separator orientation="vertical" className="mx-1 !h-5" />

      <LinkButton editor={editor} active={state.link} />

      <div className="ml-auto flex items-center gap-0.5">
        <ToolbarButton
          label="Undo"
          shortcut="Ctrl+Z"
          icon={Undo2}
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          label="Redo"
          shortcut="Ctrl+Shift+Z"
          icon={Redo2}
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>
    </div>
  )
}

interface RichNoteEditorProps {
  /** Markdown in. */
  value: string
  /** Markdown out, on every edit. */
  onChange: (markdown: string) => void
  placeholder?: string
}

/**
 * The note writing surface.
 *
 * What a student types is what they see — no syntax to learn, no preview to
 * toggle. The Markdown shortcuts still work for anyone who knows them (`# `
 * makes a heading, `- ` starts a list); they are simply no longer the only way
 * in.
 *
 * Content stays Markdown, because `notes.content_md` is what search, version
 * history, the dashboard previews and the AI coach all read. See
 * `docs/NOTES_EDITOR_PLAN.md`.
 */
export function RichNoteEditor({ value, onChange, placeholder }: RichNoteEditorProps) {
  /**
   * The last Markdown this editor produced.
   *
   * Opening a note canonicalises its Markdown, so the text on screen may differ
   * from the `value` prop before a single key is pressed. Comparing against
   * what the editor last emitted — rather than against its current serialised
   * content — is what distinguishes "the parent is handing us something new"
   * from "this is just our own output coming back", and keeps a freshly opened
   * note from being reset a moment after it renders.
   */
  const lastEmitted = React.useRef(value)

  const editor = useEditor({
    extensions: [
      ...NOTE_EDITOR_EXTENSIONS,
      Placeholder.configure({ placeholder: placeholder ?? 'Start writing…' }),
    ],
    content: value,
    editorProps: {
      attributes: {
        'aria-label': 'Note content',
        class:
          'prose prose-sm dark:prose-invert max-w-none px-1 py-2 focus:outline-none [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-0 [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2 [&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
      },
    },
    onUpdate: ({ editor: instance }) => {
      const markdown = getMarkdown(instance)
      lastEmitted.current = markdown
      onChange(markdown)
    },
  })

  /**
   * Pull in changes that came from somewhere other than typing — restoring a
   * version, for instance. Without the guard, every keystroke would round-trip
   * back through `setContent` and drop the cursor to the end of the note.
   */
  React.useEffect(() => {
    if (!editor) return
    if (value === lastEmitted.current) return
    lastEmitted.current = value
    editor.commands.setContent(value, { emitUpdate: false })
  }, [value, editor])

  if (!editor) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} />
      <div
        className="min-h-0 flex-1 cursor-text overflow-y-auto"
        // Clicking the empty space below the last line should put the cursor in
        // the note, the way a plain textarea would.
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault()
            editor.commands.focus('end')
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
