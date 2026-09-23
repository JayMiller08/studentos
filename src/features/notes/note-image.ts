import type { Editor } from '@tiptap/core'
import { Image, type ImageOptions } from '@tiptap/extension-image'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { toast } from 'sonner'
import {
  imagesToInsert,
  isNoteImageSrc,
  NOTE_IMAGE_MESSAGES,
  NoteImageError,
  noteImagesService,
  pickImageFiles,
} from '@/services/note-images-service'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteImage: {
      /**
       * Store these images and add them where the cursor is. What the toolbar's
       * image button runs, so choosing a file does exactly what pasting one does.
       */
      insertImageFiles: (files: File[]) => ReturnType
    }
  }
}

export interface NoteImageOptions extends ImageOptions {
  /** Stores a pasted or dropped image and returns the `src` the note keeps for it. */
  upload: (file: File) => Promise<string>
  /** A URL the browser can load for a stored image's `src`. */
  resolve: (src: string) => Promise<string>
  /** Tells the student why an image didn't go in. */
  onError: (message: string) => void
}

/** More than this in one paste is almost certainly a slip, and a long wait. */
const MAX_IMAGES_AT_ONCE = 10

interface UploadMeta {
  add?: { id: string; pos: number; previews: string[] }
  done?: string
}

/** Placeholders for images still uploading. Decorations, so they never reach the saved note. */
const uploads = new PluginKey<DecorationSet>('noteImageUploads')

let uploadCount = 0

/** A local preview of the file, where the browser can make one. */
function previewOf(file: File): string {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
}

function uploadPlaceholder(previews: string[]): HTMLElement {
  const element = document.createElement('span')
  element.className = 'note-image-upload'
  for (const preview of previews) {
    if (!preview) continue
    const image = document.createElement('img')
    image.src = preview
    image.alt = ''
    element.append(image)
  }
  const label = document.createElement('span')
  label.className = 'note-image-upload__label'
  label.setAttribute('role', 'status')
  label.textContent = previews.length === 1 ? 'Adding image…' : `Adding ${previews.length} images…`
  element.append(label)
  return element
}

/**
 * Store these images and put them in the note — the one path every way of
 * adding an image runs through, whether it arrived by paste, by drop, or from
 * the toolbar's file picker.
 *
 * `droppedAt` is the position a drop landed on; null means "where the cursor
 * is", and replaces the selection the way pasting over selected text does.
 */
function startUpload(
  editor: Editor,
  options: NoteImageOptions,
  name: string,
  files: File[],
  droppedAt: number | null,
): void {
  const view = editor.view
  const batch = files.slice(0, MAX_IMAGES_AT_ONCE)
  const id = `upload-${++uploadCount}`
  const previews = batch.map(previewOf)

  // A paste replaces what is selected; a drop lands where it was dropped.
  const tr = droppedAt === null ? view.state.tr.deleteSelection() : view.state.tr
  let pos = droppedAt ?? tr.selection.from
  const $pos = tr.doc.resolve(pos)
  // Code can't hold an image, and splitting the block in two would be worse
  // than putting the image after it.
  if ($pos.parent.type.spec.code) pos = $pos.after()
  view.dispatch(tr.setMeta(uploads, { add: { id, pos, previews } } satisfies UploadMeta))

  void Promise.allSettled(batch.map((file) => options.upload(file))).then((results) => {
    if (!editor.isDestroyed) {
      const placeholder = uploads.getState(editor.state)?.find(undefined, undefined, (spec) => spec.id === id)[0]
      const sources = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      const { selection } = editor.state
      // Keep typing after the image if the cursor never moved; leave it alone if it did.
      const cursorWaited = selection.empty && selection.from === placeholder?.from

      let chain = editor.chain().command(({ tr: done }) => {
        done.setMeta(uploads, { done: id } satisfies UploadMeta)
        return true
      })
      // No placeholder means the text around it was deleted while uploading —
      // the student took the image out before it arrived.
      if (placeholder && sources.length > 0) {
        chain = chain.insertContentAt(
          placeholder.from,
          sources.map((src) => ({ type: name, attrs: { src } })),
          { updateSelection: cursorWaited },
        )
      }
      chain.run()
    }

    for (const preview of previews) if (preview) URL.revokeObjectURL(preview)

    const failure = results.find((result) => result.status === 'rejected')
    if (failure) {
      options.onError(
        failure.reason instanceof NoteImageError ? failure.reason.message : NOTE_IMAGE_MESSAGES.uploadFailed,
      )
    }
  })
}

function dropPosition(view: EditorView, event: DragEvent): number | null {
  try {
    return view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null
  } catch {
    // No layout to measure against (a test DOM) — fall back to the selection.
    return null
  }
}

/**
 * Images in notes: paste one (a screenshot, an image copied from anywhere) or
 * drop one in, and it is stored and added where the cursor was.
 *
 * The same `image` node as before, so the note stays ordinary Markdown. What is
 * new is where the picture comes from: a pasted image is uploaded and the note
 * keeps a `note-image:` reference, which this node view turns into something
 * the browser can show. Images linked from the web still show as they are.
 */
export const NoteImage = Image.extend<NoteImageOptions>({
  addOptions() {
    return {
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
      resize: false,
      upload: (file) => noteImagesService.upload(file),
      resolve: (src) => noteImagesService.resolve(src),
      onError: (message) => {
        toast.error(message)
      },
    }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-image') ?? element.getAttribute('src'),
        // As HTML, a stored image's reference is data, never `src`. ProseMirror draws
        // a note once from this HTML before the node view takes over, and copying
        // uses it too; as `src`, the browser would try to load `note-image:…` and
        // log a failed request for every image, every time a note opened.
        renderHTML: (attributes) =>
          isNoteImageSrc(attributes.src) ? { 'data-note-image': attributes.src } : { src: attributes.src },
      },
    }
  },

  parseHTML() {
    // Reads back what renderHTML writes, so copying an image within a note keeps it.
    return [...(this.parent?.() ?? []), { tag: 'img[data-note-image]' }]
  },

  addNodeView() {
    return ({ node }) => {
      let current = node

      const dom = document.createElement('div')
      dom.className = 'note-image'
      const image = document.createElement('img')
      // The block drags as a whole; the browser's own image drag would take a copy instead.
      image.draggable = false
      const fallback = document.createElement('span')
      fallback.className = 'note-image__fallback'
      fallback.textContent = "This image couldn't be loaded."
      dom.append(image, fallback)

      /** Bumped on every change, so a slow lookup can't overwrite a newer image. */
      let showing = 0

      const describe = () => {
        image.alt = (current.attrs.alt as string | null) ?? ''
        const title = current.attrs.title as string | null
        if (title) image.title = title
        else image.removeAttribute('title')
      }

      const show = () => {
        describe()
        const request = ++showing
        const src = current.attrs.src as string | null
        const settle = (state: 'ready' | 'error') => {
          if (request === showing) dom.dataset.state = state
        }
        image.onload = () => settle('ready')
        image.onerror = () => settle('error')
        dom.dataset.state = 'loading'

        const load = (url: string) => {
          if (request !== showing) return
          image.src = url
          if (image.complete && image.naturalWidth > 0) settle('ready')
        }
        if (!src) settle('error')
        else if (isNoteImageSrc(src)) {
          image.removeAttribute('src')
          this.options.resolve(src).then(load, () => settle('error'))
        } else load(src)
      }
      show()

      return {
        dom,
        update: (updated) => {
          if (updated.type !== current.type) return false
          const previous = current
          current = updated
          if (updated.attrs.src !== previous.attrs.src) show()
          else describe()
          return true
        },
        destroy: () => {
          showing++
        },
      }
    }
  },

  addCommands() {
    return {
      insertImageFiles:
        (files: File[]) =>
        ({ editor }) => {
          const images = pickImageFiles(files)
          if (images.length === 0) return false
          startUpload(editor, this.options, this.name, images, null)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    const { editor, name } = this
    const options = this.options

    const addImages = (files: File[], droppedAt: number | null) =>
      startUpload(editor, options, name, files, droppedAt)

    return [
      ...(this.parent?.() ?? []),
      new Plugin<DecorationSet>({
        key: uploads,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            let next = set.map(tr.mapping, tr.doc)
            const meta = tr.getMeta(uploads) as UploadMeta | undefined
            if (meta?.add) {
              const { id, pos, previews } = meta.add
              // side -1: the placeholder sits before the cursor, so typing carries on after it.
              next = next.add(tr.doc, [
                Decoration.widget(pos, () => uploadPlaceholder(previews), { id, key: id, side: -1 }),
              ])
            }
            if (meta?.done) {
              const done = meta.done
              next = next.remove(next.find(undefined, undefined, (spec) => spec.id === done))
            }
            return next
          },
        },
        props: {
          decorations: (state) => uploads.getState(state),
          handlePaste: (_view, event) => {
            const files = imagesToInsert(event.clipboardData)
            if (files.length === 0) return false
            event.preventDefault()
            addImages(files, null)
            return true
          },
          handleDrop: (view, event, _slice, moved) => {
            // Moving an image already in the note is ProseMirror's job.
            if (moved) return false
            const files = imagesToInsert(event.dataTransfer)
            if (files.length === 0) return false
            event.preventDefault()
            addImages(files, dropPosition(view, event) ?? view.state.selection.to)
            return true
          },
        },
      }),
    ]
  },
})
