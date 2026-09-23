// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RichNoteEditor } from '../rich-note-editor'

const STORED = 'note-image:1b4e28ba-2fa1-41d2-883f-0016d3cca427.png'

// Only the storage is stood in for; everything the editor does is real.
const images = vi.hoisted(() => ({ upload: vi.fn(), resolve: vi.fn() }))
vi.mock('@/services/note-images-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/note-images-service')>()
  return { ...actual, noteImagesService: images }
})

// Lets `act` flush effects and state updates without React warning about it.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null
let markdown = ''

function render(value = ''): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  React.act(() => {
    root!.render(
      React.createElement(RichNoteEditor, {
        value,
        onChange: (next: string) => {
          markdown = next
        },
      }),
    )
  })
  return container
}

beforeEach(() => {
  images.upload.mockResolvedValue(STORED)
  images.resolve.mockResolvedValue('https://signed.example/image.png')
})

afterEach(() => {
  React.act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  markdown = ''
  vi.clearAllMocks()
})

const labels = () =>
  [...(container?.querySelectorAll('[role=toolbar] button') ?? [])].map((button) =>
    button.getAttribute('aria-label'),
  )

const fileInput = () => container?.querySelector<HTMLInputElement>('input[type=file]') ?? null

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'diagram.png', { type: 'image/png' })

/** Choose files, the way the file picker hands them back. */
async function choose(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await React.act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('the note toolbar', () => {
  it('offers a control for everything a student can add', () => {
    render()
    // A contract, deliberately exact: a capability with no button is one a
    // student cannot find. Adding a control means adding it here too.
    expect(labels()).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bold',
      'Italic',
      'Strikethrough',
      'Inline code',
      'Bulleted list',
      'Numbered list',
      'Checklist',
      'Quote',
      'Code block',
      'Insert image',
      'Add link',
      'Undo',
      'Redo',
    ])
  })

  it('takes any image the browser can read', () => {
    render()
    expect(fileInput()?.accept).toBe('image/*')
    expect(fileInput()?.multiple).toBe(true)
  })

  it('opens the file picker from the image button', () => {
    render()
    const input = fileInput()!
    const opened = vi.spyOn(input, 'click')
    const button = container!.querySelector<HTMLButtonElement>('button[aria-label="Insert image"]')!
    React.act(() => button.click())
    expect(opened).toHaveBeenCalled()
  })
})

describe('adding an image from the toolbar', () => {
  it('stores the chosen file and puts it in the note', async () => {
    render('Lecture notes')
    const file = png()

    await choose(fileInput()!, [file])
    await React.act(async () => {
      await Promise.resolve()
    })

    expect(images.upload).toHaveBeenCalledWith(file)
    expect(markdown).toContain('![](' + STORED + ')')
  })

  it('leaves the note alone when the picker is dismissed', async () => {
    render('Lecture notes')
    await choose(fileInput()!, [])
    expect(images.upload).not.toHaveBeenCalled()
    expect(markdown).toBe('')
  })
})
