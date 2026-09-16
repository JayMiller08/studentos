import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  imagesToInsert,
  isNoteImageSrc,
  NOTE_IMAGE_MAX_BYTES,
  NOTE_IMAGE_MESSAGES,
  NoteImageError,
  noteImagesService,
  storedSize,
  storesAsIs,
} from '@/services/note-images-service'

const storage = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
}))
const session = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: (bucket: string) => {
        storage.from(bucket)
        return { upload: storage.upload, createSignedUrl: storage.createSignedUrl }
      },
    },
  },
}))
vi.mock('@/services/auth-service', () => ({ authService: { getUser: async () => session.user } }))

beforeEach(() => {
  storage.from.mockReset()
  storage.upload.mockReset()
  storage.createSignedUrl.mockReset()
  session.user = { id: 'user-1' }
})

const png = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' })
const pdf = new File([new Uint8Array([37, 80, 68, 70])], 'notes.pdf', { type: 'application/pdf' })

function clipboard({
  files = [],
  items = [],
  text = '',
}: {
  files?: File[]
  items?: Array<{ kind: string; getAsFile: () => File | null }>
  text?: string
}): DataTransfer {
  return { files, items, getData: (type: string) => (type === 'text/plain' ? text : '') } as unknown as DataTransfer
}

/** A stored file name: what `upload` makes and `resolve` accepts. Distinct per test, since lookups are shared. */
const stored = (n: number) => `note-image:00000000-0000-4000-8000-${String(n).padStart(12, '0')}.png`

describe('imagesToInsert', () => {
  it('takes the images from a paste', () => {
    expect(imagesToInsert(clipboard({ files: [png, pdf] }))).toEqual([png])
  })

  it('finds an image the browser only lists among the clipboard items', () => {
    const items = [
      { kind: 'string', getAsFile: () => null },
      { kind: 'file', getAsFile: () => png },
    ]
    expect(imagesToInsert(clipboard({ items }))).toEqual([png])
  })

  it('leaves a paste that has text to the text', () => {
    // Word copies a picture of the selection alongside the words themselves.
    expect(imagesToInsert(clipboard({ files: [png], text: 'Quarterly results' }))).toEqual([])
  })

  it('does not count whitespace as text', () => {
    expect(imagesToInsert(clipboard({ files: [png], text: '  \n' }))).toEqual([png])
  })

  it('has nothing to add from an empty clipboard', () => {
    expect(imagesToInsert(null)).toEqual([])
    expect(imagesToInsert(clipboard({}))).toEqual([])
  })
})

describe('preparing an image', () => {
  it('stores a small image in a stored format exactly as it is', () => {
    expect(storesAsIs({ type: 'image/png', size: 300_000, width: 1280, height: 720 })).toBe(true)
  })

  it('re-encodes one that is heavy, huge, or in a format storage does not take', () => {
    expect(storesAsIs({ type: 'image/png', size: 2_000_000, width: 1280, height: 720 })).toBe(false)
    expect(storesAsIs({ type: 'image/jpeg', size: 300_000, width: 4032, height: 3024 })).toBe(false)
    expect(storesAsIs({ type: 'image/bmp', size: 30_000, width: 64, height: 64 })).toBe(false)
  })

  it('scales the longest side down to fit, keeping proportions', () => {
    expect(storedSize(4800, 1200)).toEqual({ width: 2400, height: 600 })
    expect(storedSize(1200, 800)).toEqual({ width: 1200, height: 800 })
    expect(storedSize(1, 10_000)).toEqual({ width: 1, height: 2400 })
  })
})

describe('noteImagesService.upload', () => {
  it("stores the image in the student's own folder and returns what the note keeps", async () => {
    storage.upload.mockResolvedValue({ data: {}, error: null })
    const gif = new Blob([new Uint8Array(16)], { type: 'image/gif' })

    const src = await noteImagesService.upload(gif)

    expect(src).toMatch(/^note-image:[0-9a-f-]{36}\.gif$/)
    expect(storage.from).toHaveBeenCalledWith('note-images')
    const [path, body, options] = storage.upload.mock.calls[0]!
    expect(path).toBe('user-1/' + src.slice('note-image:'.length))
    expect(body).toBe(gif)
    expect(options).toMatchObject({ contentType: 'image/gif', upsert: false })
  })

  it('refuses an image over the limit without uploading it', async () => {
    const huge = new Blob([new Uint8Array(NOTE_IMAGE_MAX_BYTES + 1)], { type: 'image/gif' })
    await expect(noteImagesService.upload(huge)).rejects.toThrow(NOTE_IMAGE_MESSAGES.tooLarge)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('explains an upload that storage refused', async () => {
    storage.upload.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } })
    const gif = new Blob([new Uint8Array(16)], { type: 'image/gif' })
    const failure = noteImagesService.upload(gif)
    await expect(failure).rejects.toBeInstanceOf(NoteImageError)
    await expect(failure).rejects.toThrow(NOTE_IMAGE_MESSAGES.uploadFailed)
  })

  it('asks a signed-out student to sign in again', async () => {
    session.user = null
    const gif = new Blob([new Uint8Array(16)], { type: 'image/gif' })
    await expect(noteImagesService.upload(gif)).rejects.toThrow(NOTE_IMAGE_MESSAGES.signedOut)
  })

  it('says so when the image cannot be read', async () => {
    const notReally = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    await expect(noteImagesService.upload(notReally)).rejects.toThrow(NOTE_IMAGE_MESSAGES.unreadable)
  })
})

describe('noteImagesService.resolve', () => {
  it("signs a URL for the student's own file, and reuses it", async () => {
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/1' }, error: null })

    expect(await noteImagesService.resolve(stored(1))).toBe('https://signed.example/1')
    expect(await noteImagesService.resolve(stored(1))).toBe('https://signed.example/1')

    expect(storage.createSignedUrl).toHaveBeenCalledOnce()
    expect(storage.createSignedUrl).toHaveBeenCalledWith('user-1/' + stored(1).slice('note-image:'.length), 3600)
  })

  it('asks again after a failed lookup, instead of remembering the failure', async () => {
    storage.createSignedUrl
      .mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://signed.example/2' }, error: null })

    await expect(noteImagesService.resolve(stored(2))).rejects.toThrow()
    expect(await noteImagesService.resolve(stored(2))).toBe('https://signed.example/2')
  })

  it('fetches nothing for an address that is not a stored file', async () => {
    await expect(noteImagesService.resolve('note-image:../someone-else/photo.png')).rejects.toThrow()
    await expect(noteImagesService.resolve('https://example.com/photo.png')).rejects.toThrow()
    expect(storage.createSignedUrl).not.toHaveBeenCalled()
  })
})

describe('isNoteImageSrc', () => {
  it('recognises a stored image, and nothing else', () => {
    expect(isNoteImageSrc(stored(3))).toBe(true)
    expect(isNoteImageSrc('https://example.com/a.png')).toBe(false)
    expect(isNoteImageSrc(null)).toBe(false)
  })
})

describe('in local demo mode', () => {
  it('explains when this browser cannot keep images', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase', () => ({ supabase: null }))
    const local = await import('@/services/note-images-service')
    const gif = new Blob([new Uint8Array(16)], { type: 'image/gif' })
    // No IndexedDB here, as in a browser with site data blocked.
    await expect(local.noteImagesService.upload(gif)).rejects.toThrow(local.NOTE_IMAGE_MESSAGES.unavailableHere)
    vi.doUnmock('@/lib/supabase')
  })
})
