import { supabase } from '@/lib/supabase'
import { authService } from '@/services/auth-service'

/**
 * Images pasted into notes.
 *
 * A note is Markdown, so an image in it is `![alt](src)`. For an image a
 * student pasted, `src` is `note-image:<file>` — a reference to a file stored
 * here, not a URL. The files are private, private URLs expire, and a note still
 * has to open next month.
 *
 * With Supabase, files live in the private `note-images` bucket (migration
 * 00012) and are shown through signed URLs. Local demo mode has no storage
 * server, and its database is localStorage, which a few screenshots would fill,
 * so there the files go to IndexedDB.
 */

export const NOTE_IMAGE_SCHEME = 'note-image:'

/** The same limit the bucket enforces, so storage never refuses a surprise. */
export const NOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** The longest side an image is stored at — wider than a note ever shows one. */
export const NOTE_IMAGE_MAX_DIMENSION = 2400

/** Below this, an image already in a stored format goes up untouched. */
const UNTOUCHED_BYTES = 1.5 * 1024 * 1024

/** What the bucket accepts, and the extension each is saved with. */
const STORED_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const BUCKET = 'note-images'

/** Every stored file is `<uuid>.<ext>`; anything else in a note is not ours to fetch. */
const FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/

export const NOTE_IMAGE_MESSAGES = {
  tooLarge: 'That image is too large to add. Images can be up to 5 MB.',
  unreadable: "That image couldn't be read. Try saving it as a PNG or JPEG first.",
  uploadFailed: "The image couldn't be saved. Check your connection and try again.",
  signedOut: 'Your session has ended. Sign in again to add images.',
  unavailableHere: "Images can't be saved in this browser.",
} as const

/** A problem with an image, worded for the student. */
export class NoteImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoteImageError'
  }
}

export function isNoteImageSrc(src: unknown): src is string {
  return typeof src === 'string' && src.startsWith(NOTE_IMAGE_SCHEME)
}

/**
 * The images a paste or a drop should add to a note — or none, when the
 * clipboard carries text as well. Word, Excel and PowerPoint put a picture of
 * the copied selection next to its text, and the text is what was meant.
 */
export function imagesToInsert(
  data: Pick<DataTransfer, 'files' | 'items' | 'getData'> | null | undefined,
): File[] {
  if (!data) return []
  let files = Array.from(data.files ?? []).filter(isImage)
  // Some browsers only list a pasted image among the clipboard's items.
  if (files.length === 0) {
    files = Array.from(data.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null && isImage(file))
  }
  if (files.length === 0) return []
  if (data.getData('text/plain').trim()) return []
  return files
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Whether an image can be stored exactly as it came: a stored format, and neither heavy nor huge. */
export function storesAsIs(image: { type: string; size: number; width: number; height: number }): boolean {
  return (
    Object.hasOwn(STORED_TYPES, image.type) &&
    image.size <= UNTOUCHED_BYTES &&
    Math.max(image.width, image.height) <= NOTE_IMAGE_MAX_DIMENSION
  )
}

/** The size to store an image at: its own, or scaled down until its longest side fits. */
export function storedSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, NOTE_IMAGE_MAX_DIMENSION / Math.max(width, height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * The image as it will be stored. Small images in a stored format are kept as
 * they are; anything big, or in a format storage doesn't take (BMP, AVIF,
 * HEIC where the browser can read it), is scaled down and re-encoded.
 */
async function prepareImage(file: Blob): Promise<Blob> {
  if (file.type === 'image/gif') {
    // Re-encoding a GIF would freeze its animation, so it goes up as it is or not at all.
    if (file.size > NOTE_IMAGE_MAX_BYTES) throw new NoteImageError(NOTE_IMAGE_MESSAGES.tooLarge)
    return file
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new NoteImageError(NOTE_IMAGE_MESSAGES.unreadable)
  }

  try {
    if (storesAsIs({ type: file.type, size: file.size, width: bitmap.width, height: bitmap.height })) return file

    const { width, height } = storedSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new NoteImageError(NOTE_IMAGE_MESSAGES.unreadable)
    context.drawImage(bitmap, 0, 0, width, height)

    // WebP keeps text in a screenshot sharp at a fraction of the size, and keeps transparency.
    const webp = await canvasBlob(canvas, 'image/webp', 0.9)
    if (webp && Object.hasOwn(STORED_TYPES, webp.type) && webp.size <= NOTE_IMAGE_MAX_BYTES) return webp

    // A browser that can't write WebP hands back a PNG, kept above if it fit.
    // Otherwise JPEG, on white where the image was transparent.
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    const jpeg = await canvasBlob(canvas, 'image/jpeg', 0.85)
    if (jpeg && jpeg.size <= NOTE_IMAGE_MAX_BYTES) return jpeg
    throw new NoteImageError(NOTE_IMAGE_MESSAGES.tooLarge)
  } finally {
    bitmap.close()
  }
}

async function currentUserId(): Promise<string> {
  const user = await authService.getUser()
  if (!user) throw new NoteImageError(NOTE_IMAGE_MESSAGES.signedOut)
  return user.id
}

// ── Local demo storage ───────────────────────────────────────────────────────

const LOCAL_DATABASE = 'studentos.note-images'
const LOCAL_STORE = 'images'
let localDatabase: Promise<IDBDatabase> | null = null

function openLocalImages(): Promise<IDBDatabase> {
  localDatabase ??= new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = indexedDB.open(LOCAL_DATABASE, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(LOCAL_STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new NoteImageError(NOTE_IMAGE_MESSAGES.unavailableHere))
    } catch {
      // No IndexedDB at all, or site data blocked.
      reject(new NoteImageError(NOTE_IMAGE_MESSAGES.unavailableHere))
    }
  }).catch((error: unknown) => {
    localDatabase = null
    throw error
  })
  return localDatabase
}

async function saveLocalImage(name: string, image: Blob): Promise<void> {
  const database = await openLocalImages()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LOCAL_STORE, 'readwrite')
    transaction.objectStore(LOCAL_STORE).put(image, name)
    transaction.oncomplete = () => resolve()
    transaction.onerror = transaction.onabort = () => reject(new NoteImageError(NOTE_IMAGE_MESSAGES.unavailableHere))
  })
}

async function readLocalImage(name: string): Promise<Blob> {
  const database = await openLocalImages()
  return new Promise<Blob>((resolve, reject) => {
    const request = database.transaction(LOCAL_STORE, 'readonly').objectStore(LOCAL_STORE).get(name)
    request.onsuccess = () =>
      request.result instanceof Blob ? resolve(request.result) : reject(new Error('Image not found'))
    request.onerror = () => reject(new Error('Image not found'))
  })
}

// ── Showing a stored image ───────────────────────────────────────────────────

/** Signed URLs last an hour; each is reused until ten minutes before it runs out. */
const SIGNED_URL_SECONDS = 60 * 60
const REUSE_SIGNED_URL_MS = (SIGNED_URL_SECONDS - 10 * 60) * 1000

/** One lookup per file, shared by every note and editor that shows it. */
const resolved = new Map<string, { url: Promise<string>; until: number }>()

async function signedUrl(name: string): Promise<string> {
  const userId = await currentUserId()
  const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrl(`${userId}/${name}`, SIGNED_URL_SECONDS)
  if (error || !data) throw new Error('Image not found')
  return data.signedUrl
}

async function localUrl(name: string): Promise<string> {
  return URL.createObjectURL(await readLocalImage(name))
}

export const noteImagesService = {
  /** Store an image and return the `src` a note keeps for it. */
  async upload(file: Blob): Promise<string> {
    const image = await prepareImage(file)
    const extension = Object.hasOwn(STORED_TYPES, image.type) ? STORED_TYPES[image.type] : undefined
    if (!extension) throw new NoteImageError(NOTE_IMAGE_MESSAGES.unreadable)
    if (image.size > NOTE_IMAGE_MAX_BYTES) throw new NoteImageError(NOTE_IMAGE_MESSAGES.tooLarge)

    const name = `${crypto.randomUUID()}.${extension}`
    if (supabase) {
      const userId = await currentUserId()
      const { error } = await supabase.storage.from(BUCKET).upload(`${userId}/${name}`, image, {
        contentType: image.type,
        // A file name is never reused, so what was fetched once is good forever.
        cacheControl: '31536000',
        upsert: false,
      })
      if (error) throw new NoteImageError(NOTE_IMAGE_MESSAGES.uploadFailed)
    } else {
      await saveLocalImage(name, image)
    }
    return NOTE_IMAGE_SCHEME + name
  },

  /** A URL the browser can load for a stored image's `src`. */
  resolve(src: string): Promise<string> {
    const name = src.slice(NOTE_IMAGE_SCHEME.length)
    if (!isNoteImageSrc(src) || !FILE_NAME.test(name)) return Promise.reject(new Error('Not a stored image'))

    const known = resolved.get(name)
    if (known && known.until > Date.now()) return known.url

    const url = (supabase ? signedUrl(name) : localUrl(name)).catch((error: unknown) => {
      // Forget a failure, so the next time the note opens it asks again.
      if (resolved.get(name)?.url === url) resolved.delete(name)
      throw error
    })
    resolved.set(name, { url, until: supabase ? Date.now() + REUSE_SIGNED_URL_MS : Number.POSITIVE_INFINITY })
    return url
  },
}
