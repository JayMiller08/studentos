// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { DOMParser, DOMSerializer, Slice } from '@tiptap/pm/model'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NOTE_IMAGE_MESSAGES, NoteImageError } from '@/services/note-images-service'
import { getMarkdown, NOTE_EDITOR_EXTENSIONS } from '../editor-extensions'
import { NoteImage, type NoteImageOptions } from '../note-image'

const NL = String.fromCharCode(10)
const FENCE = String.fromCharCode(96).repeat(3)
const STORED = 'note-image:1b4e28ba-2fa1-41d2-883f-0016d3cca427.png'
const STORED_2 = 'note-image:6fa459ea-ee8a-4ca4-894e-db77e160355e.png'

let editor: Editor | null = null
let element: HTMLElement | null = null

afterEach(() => {
  editor?.destroy()
  element?.remove()
  editor = null
  element = null
})

/** A real editor view, with the image node's storage swapped for test doubles. */
function mount(markdown: string, options: Partial<NoteImageOptions> = {}): Editor {
  element = document.createElement('div')
  document.body.append(element)
  const extensions = NOTE_EDITOR_EXTENSIONS.map((extension) =>
    extension.name === 'image'
      ? NoteImage.configure({
          upload: async () => STORED,
          resolve: async () => 'https://signed.example/image.png',
          onError: () => {},
          ...options,
        })
      : extension,
  )
  editor = new Editor({ element, extensions, content: markdown })
  return editor
}

const png = (name = 'image.png') => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })

/** Paste the way the browser hands a paste to ProseMirror. */
function paste(ed: Editor, { files = [], text = '' }: { files?: File[]; text?: string }): boolean {
  const clipboardData = { files, items: [], getData: (type: string) => (type === 'text/plain' ? text : '') }
  const event = { clipboardData, preventDefault: () => {} } as unknown as ClipboardEvent
  return ed.view.someProp('handlePaste', (handle) => handle(ed.view, event, Slice.empty)) ?? false
}

function drop(ed: Editor, files: File[], moved = false): boolean {
  const dataTransfer = { files, items: [], getData: () => '' }
  const event = { dataTransfer, clientX: 0, clientY: 0, preventDefault: () => {} } as unknown as DragEvent
  return ed.view.someProp('handleDrop', (handle) => handle(ed.view, event, Slice.empty, moved)) ?? false
}

/** Let uploads settle and their results land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** The document, one entry per top-level node. */
function blocks(ed: Editor): string[] {
  const out: string[] = []
  ed.state.doc.forEach((node) => {
    out.push(node.type.name === 'image' ? `image:${node.attrs.src as string}` : `${node.type.name}:${node.textContent}`)
  })
  return out
}

function deferred() {
  let finish!: (src: string) => void
  let fail!: (reason: unknown) => void
  const promise = new Promise<string>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  return { promise, finish, fail }
}

describe('pasting an image', () => {
  it('shows it uploading, then adds it to the note once stored', async () => {
    const upload = deferred()
    const ed = mount('', { upload: () => upload.promise })
    ed.commands.setTextSelection(1)

    expect(paste(ed, { files: [png()] })).toBe(true)
    expect(element?.querySelector('.note-image-upload')?.textContent).toContain('Adding image')
    // The placeholder is not content: nothing half-finished reaches the saved note.
    expect(getMarkdown(ed)).toBe('')

    upload.finish(STORED)
    await settle()

    expect(element?.querySelector('.note-image-upload')).toBeNull()
    expect(blocks(ed)[0]).toBe('image:' + STORED)
    expect(getMarkdown(ed)).toContain('![](' + STORED + ')')
  })

  it('goes where the cursor is, between the text either side of it', async () => {
    const ed = mount('Before After')
    ed.commands.setTextSelection(8)
    paste(ed, { files: [png()] })
    await settle()
    expect(blocks(ed)).toEqual(['paragraph:Before ', 'image:' + STORED, 'paragraph:After'])
  })

  it('replaces what was selected', async () => {
    const ed = mount('Keep DELETE keep')
    ed.commands.setTextSelection({ from: 6, to: 12 })
    paste(ed, { files: [png()] })
    await settle()
    expect(ed.state.doc.textContent).not.toContain('DELETE')
    expect(blocks(ed)).toContain('image:' + STORED)
  })

  it('adds several images in the order they were pasted', async () => {
    const sources = new Map([
      ['first.png', STORED],
      ['second.png', STORED_2],
    ])
    const ed = mount('', { upload: async (file) => sources.get(file.name)! })
    ed.commands.setTextSelection(1)
    paste(ed, { files: [png('first.png'), png('second.png')] })
    await settle()
    expect(blocks(ed).filter((block) => block.startsWith('image:'))).toEqual(['image:' + STORED, 'image:' + STORED_2])
  })

  it('leaves a paste that also has text to the text', () => {
    const upload = vi.fn(async () => STORED)
    const ed = mount('', { upload })
    expect(paste(ed, { files: [png()], text: 'Quarterly results' })).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('puts an image pasted inside code after the code block, not through it', async () => {
    const ed = mount(FENCE + NL + 'x = 1' + NL + FENCE)
    ed.commands.setTextSelection(3)
    paste(ed, { files: [png()] })
    await settle()
    expect(blocks(ed).slice(0, 2)).toEqual(['codeBlock:x = 1', 'image:' + STORED])
  })

  it('adds nothing if the spot was deleted before the upload finished', async () => {
    const upload = deferred()
    const onError = vi.fn()
    const ed = mount('Some text', { upload: () => upload.promise, onError })
    ed.commands.setTextSelection(5)
    paste(ed, { files: [png()] })

    ed.commands.clearContent()
    upload.finish(STORED)
    await settle()

    expect(blocks(ed).some((block) => block.startsWith('image:'))).toBe(false)
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('when an image cannot be added', () => {
  it('tells the student why, and adds nothing', async () => {
    const onError = vi.fn()
    const ed = mount('', {
      upload: async () => {
        throw new NoteImageError(NOTE_IMAGE_MESSAGES.tooLarge)
      },
      onError,
    })
    ed.commands.setTextSelection(1)
    paste(ed, { files: [png()] })
    await settle()

    expect(onError).toHaveBeenCalledWith(NOTE_IMAGE_MESSAGES.tooLarge)
    expect(element?.querySelector('.note-image-upload')).toBeNull()
    expect(blocks(ed).some((block) => block.startsWith('image:'))).toBe(false)
  })

  it('does not show the student an internal error', async () => {
    const onError = vi.fn()
    const ed = mount('', {
      upload: async () => {
        throw new Error('StorageApiError: new row violates row-level security policy')
      },
      onError,
    })
    ed.commands.setTextSelection(1)
    paste(ed, { files: [png()] })
    await settle()
    expect(onError).toHaveBeenCalledWith(NOTE_IMAGE_MESSAGES.uploadFailed)
  })

  it('still adds the images that did upload', async () => {
    const onError = vi.fn()
    const ed = mount('', {
      upload: async (file) => {
        if (file.name === 'bad.png') throw new NoteImageError(NOTE_IMAGE_MESSAGES.unreadable)
        return STORED
      },
      onError,
    })
    ed.commands.setTextSelection(1)
    paste(ed, { files: [png('good.png'), png('bad.png')] })
    await settle()
    expect(blocks(ed)).toContain('image:' + STORED)
    expect(onError).toHaveBeenCalledWith(NOTE_IMAGE_MESSAGES.unreadable)
  })
})

describe('choosing an image from the toolbar', () => {
  it('stores it and adds it where the cursor is', async () => {
    const upload = vi.fn(async () => STORED)
    const ed = mount('Before After', { upload })
    ed.commands.setTextSelection(8)

    expect(ed.commands.insertImageFiles([png()])).toBe(true)
    await settle()

    expect(upload).toHaveBeenCalledOnce()
    expect(blocks(ed)).toEqual(['paragraph:Before ', 'image:' + STORED, 'paragraph:After'])
  })

  it('ignores a file that is not an image', () => {
    const upload = vi.fn(async () => STORED)
    const ed = mount('', { upload })
    const notes = new File([new Uint8Array([37, 80])], 'notes.pdf', { type: 'application/pdf' })
    expect(ed.commands.insertImageFiles([notes])).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('reports a failure the same way a paste does', async () => {
    const onError = vi.fn()
    const ed = mount('', {
      upload: async () => {
        throw new NoteImageError(NOTE_IMAGE_MESSAGES.tooLarge)
      },
      onError,
    })
    ed.commands.insertImageFiles([png()])
    await settle()
    expect(onError).toHaveBeenCalledWith(NOTE_IMAGE_MESSAGES.tooLarge)
    expect(blocks(ed).some((block) => block.startsWith('image:'))).toBe(false)
  })
})

describe('dropping an image', () => {
  it('adds a dropped image file', async () => {
    const ed = mount('Text')
    ed.commands.setTextSelection(5)
    expect(drop(ed, [png()])).toBe(true)
    await settle()
    expect(blocks(ed)).toContain('image:' + STORED)
  })

  it("leaves moving an image that's already in the note to the editor", () => {
    const upload = vi.fn(async () => STORED)
    const ed = mount('Text', { upload })
    expect(drop(ed, [png()], true)).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })
})

describe('showing an image', () => {
  const shown = () => element?.querySelector<HTMLElement>('.note-image')

  it('shows a stored image through the URL it resolves to', async () => {
    const resolve = vi.fn(async () => 'https://signed.example/diagram.png')
    mount('![Diagram](' + STORED + ')', { resolve })
    await settle()
    expect(resolve).toHaveBeenCalledWith(STORED)
    expect(shown()?.querySelector('img')?.getAttribute('src')).toBe('https://signed.example/diagram.png')
    expect(shown()?.querySelector('img')?.alt).toBe('Diagram')
  })

  it('shows an image from the web as it is', async () => {
    const resolve = vi.fn(async () => 'https://signed.example/unused.png')
    mount('![](https://example.com/graph.png)', { resolve })
    await settle()
    expect(resolve).not.toHaveBeenCalled()
    expect(shown()?.querySelector('img')?.getAttribute('src')).toBe('https://example.com/graph.png')
  })

  it("says so when a stored image can't be shown", async () => {
    mount('![](' + STORED + ')', {
      resolve: async () => {
        throw new Error('Object not found')
      },
    })
    await settle()
    expect(shown()?.dataset.state).toBe('error')
    expect(shown()?.textContent).toContain("couldn't be loaded")
  })

  it('keeps the note as ordinary Markdown', () => {
    const ed = mount('![Diagram](' + STORED + ')')
    expect(getMarkdown(ed)).toBe('![Diagram](' + STORED + ')')
  })

  it("never gives the browser a stored image's reference to load", () => {
    const ed = mount('![Diagram](' + STORED + ')')
    // ProseMirror draws a note from this HTML before the node view takes over.
    const image = asHtml(ed).querySelector('img')
    expect(image?.hasAttribute('src')).toBe(false)
    expect(image?.getAttribute('data-note-image')).toBe(STORED)
  })

  it('still gives an image from the web an ordinary src', () => {
    const ed = mount('![](https://example.com/graph.png)')
    expect(asHtml(ed).querySelector('img')?.getAttribute('src')).toBe('https://example.com/graph.png')
  })

  it('keeps a stored image when it is copied and pasted within a note', () => {
    const ed = mount('![Diagram](' + STORED + ')')
    const pasted = DOMParser.fromSchema(ed.schema).parse(asHtml(ed))
    expect(pasted.firstChild?.type.name).toBe('image')
    expect(pasted.firstChild?.attrs).toMatchObject({ src: STORED, alt: 'Diagram' })
  })
})

/** The note as the HTML ProseMirror renders and copies it. */
function asHtml(ed: Editor): HTMLElement {
  const container = document.createElement('div')
  container.append(DOMSerializer.fromSchema(ed.schema).serializeFragment(ed.state.doc.content))
  return container
}
