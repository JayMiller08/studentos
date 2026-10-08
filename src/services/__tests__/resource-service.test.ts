// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyFiles,
  fileType,
  localOutline,
  RESOURCE_MAX_BYTES,
  RESOURCE_MESSAGES,
  titleFromFile,
} from '@/services/resource-service'

/**
 * The study library's client half: what it accepts before an upload starts,
 * what it calls a file, and — in demo mode — how it reads one without a
 * server. The server half (types by first bytes, owner folders, the outline)
 * is tested against the functions and Postgres.
 */

const USER = '00000000-0000-4000-8000-000000000001'

const file = (name: string, type: string, size = 1000) => ({ name, type, size })

describe('fileType', () => {
  it('trusts a declared type', () => {
    expect(fileType(file('a.pdf', 'application/pdf'))).toBe('application/pdf')
  })

  it("fills in HEIC by its extension, where the browser left the type blank", () => {
    expect(fileType(file('IMG_0001.HEIC', ''))).toBe('image/heic')
    expect(fileType(file('scan.heif', ''))).toBe('image/heif')
  })

  it('leaves an unknown blank type blank', () => {
    expect(fileType(file('notes.pages', ''))).toBe('')
  })
})

describe('classifyFiles', () => {
  it('takes one PDF', () => {
    expect(classifyFiles([file('lecture.pdf', 'application/pdf')])).toBe('pdf')
  })

  it('takes up to ten photos as one resource', () => {
    expect(classifyFiles(Array.from({ length: 10 }, (_, i) => file(`p${i}.jpg`, 'image/jpeg')))).toBe('photos')
  })

  it.each([
    ['nothing', [], RESOURCE_MESSAGES.nothing],
    ['a PDF with photos', [file('a.pdf', 'application/pdf'), file('b.jpg', 'image/jpeg')], RESOURCE_MESSAGES.mixed],
    ['two PDFs', [file('a.pdf', 'application/pdf'), file('b.pdf', 'application/pdf')], RESOURCE_MESSAGES.onePdf],
    ['eleven photos', Array.from({ length: 11 }, (_, i) => file(`p${i}.png`, 'image/png')), RESOURCE_MESSAGES.tooManyPhotos],
    [
      'a Word document',
      [file('essay.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')],
      RESOURCE_MESSAGES.unsupported,
    ],
    ['a GIF', [file('meme.gif', 'image/gif')], RESOURCE_MESSAGES.unsupported],
    ['a PDF over 20 MB', [file('big.pdf', 'application/pdf', RESOURCE_MAX_BYTES + 1)], RESOURCE_MESSAGES.tooLarge],
    ['a HEIC over 20 MB', [file('big.heic', '', RESOURCE_MAX_BYTES + 1)], RESOURCE_MESSAGES.tooLarge],
  ])('refuses %s, saying why', (_label, files, message) => {
    expect(() => classifyFiles(files)).toThrow(message)
  })

  it('lets a large JPEG through — it is shrunk before upload', () => {
    expect(classifyFiles([file('photo.jpg', 'image/jpeg', RESOURCE_MAX_BYTES * 2)])).toBe('photos')
  })
})

describe('titleFromFile', () => {
  it.each([
    ['lecture_05-eigenvalues.pdf', 'Lecture 05 eigenvalues'],
    ['IMG_2041.jpg', 'IMG 2041'],
    ['.pdf', 'Untitled file'],
  ])('names %s "%s"', (name, title) => {
    expect(titleFromFile(name)).toBe(title)
  })
})

describe('localOutline', () => {
  it('names a run of pages by its first sentence, with the range it covers', () => {
    const outline = localOutline([
      'Eigenvalues. A vector that only scales.',
      'More on eigenvalues and vectors.',
      'Diagonalisation. P D P inverse.',
      'More on diagonalisation.',
    ])
    expect(outline.map((topic) => topic.pages)).toEqual(['1', '2', '3', '4'])
    expect(outline[0]!.name).toBe('Eigenvalues')
  })

  it('groups a long file into at most eight topics, covering every page', () => {
    const pages = Array.from({ length: 30 }, (_, i) => `Page ${i + 1} heading. Body text.`)
    const outline = localOutline(pages)
    expect(outline.length).toBeLessThanOrEqual(8)
    expect(outline[0]!.pages).toBe('1–4')
    expect(outline.at(-1)!.pages!.endsWith('30')).toBe(true)
  })

  it('skips empty pages, and falls back to page numbers for a long first line', () => {
    const outline = localOutline(['', 'x'.repeat(120)])
    expect(outline).toEqual([{ name: 'Pages 2', pages: '2', summary: null }])
  })
})

// ── Demo mode: read in the browser ──────────────────────────────────────────

describe('demo uploads', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  async function demo(pages: string[] | Error) {
    vi.doMock('@/lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
    vi.doMock('@/lib/pdf-text', () => ({
      pdfPages: async () => {
        if (pages instanceof Error) throw pages
        return pages
      },
    }))
    const { resourceService } = await import('@/services/resource-service')
    const { localDb } = await import('@/lib/local-db')
    return { resourceService, localDb }
  }

  const pdf = (name = 'lecture_05.pdf') => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' })
  const text = 'Eigenvalues are the roots of the characteristic polynomial of a square matrix, found from the determinant. '

  it('reads the PDF on the spot and keeps its pages on the local row, ready to quiz', async () => {
    const { resourceService, localDb } = await demo([text.repeat(2), text.repeat(2)])
    const resource = await resourceService.upload(USER, { files: [pdf()] })
    expect(resource).toMatchObject({ title: 'Lecture 05', kind: 'pdf', status: 'ready', page_count: 2, user_id: USER })
    expect(resource.outline.length).toBeGreaterThan(0)
    const stored = localDb.get<{ id: string; created_at: string; updated_at: string; local_pages: string[] }>(
      'study_resources',
      resource.id,
    )!
    expect(stored.local_pages).toHaveLength(2)
    expect(resource.storage_paths[0]!.startsWith(`${USER}/`)).toBe(true)
  })

  it('keeps a name the student gave', async () => {
    const { resourceService } = await demo([text.repeat(3)])
    expect((await resourceService.upload(USER, { files: [pdf()], title: '  Week 5  ' })).title).toBe('Week 5')
  })

  it('declines photos, which need the AI', async () => {
    const { resourceService } = await demo([])
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'board.jpg', { type: 'image/jpeg' })
    await expect(resourceService.upload(USER, { files: [photo] })).rejects.toThrow(RESOURCE_MESSAGES.photosNeedAi)
  })

  it('explains a scanned PDF with no text layer', async () => {
    const { resourceService } = await demo(['', ' '])
    await expect(resourceService.upload(USER, { files: [pdf()] })).rejects.toThrow(RESOURCE_MESSAGES.noText)
  })

  it('explains a PDF that will not open', async () => {
    const { resourceService } = await demo(new Error('bad xref'))
    await expect(resourceService.upload(USER, { files: [pdf()] })).rejects.toThrow(RESOURCE_MESSAGES.unreadable)
  })
})

// ── With Supabase: storage, then the row ────────────────────────────────────

describe('uploads with Supabase', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function connected(options: { failInsert?: boolean; failUpload?: boolean } = {}) {
    const uploaded: Array<{ path: string; type: string | undefined }> = []
    const removed: string[][] = []
    const inserted: Array<Record<string, unknown>> = []
    const builder = (table: string) => {
      const api: Record<string, unknown> = {
        insert: (values: Record<string, unknown>) => {
          inserted.push({ table, ...values })
          return api
        },
        select: () => api,
        single: () => api,
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            options.failInsert
              ? { data: null, error: { message: 'Your plan includes up to 15 study files.', code: 'PL001' } }
              : { data: { id: 'res-1', ...inserted.at(-1) }, error: null },
          ),
      }
      return api
    }
    const client = {
      from: builder,
      storage: {
        from: () => ({
          upload: async (path: string, _blob: Blob, opts: { contentType?: string }) => {
            if (options.failUpload) return { error: { message: 'network' } }
            uploaded.push({ path, type: opts.contentType })
            return { error: null }
          },
          remove: async (paths: string[]) => {
            removed.push(paths)
            return { error: null }
          },
        }),
      },
    }
    vi.doMock('@/lib/supabase', () => ({ supabase: client, isSupabaseConfigured: true }))
    const { resourceService } = await import('@/services/resource-service')
    return { resourceService, uploaded, removed, inserted }
  }

  const pdf = () => new File([new Uint8Array(2048)], 'Lecture 5.pdf', { type: 'application/pdf' })

  it("uploads into the student's own folder, then describes the file", async () => {
    const { resourceService, uploaded, inserted } = await connected()
    await resourceService.upload(USER, { files: [pdf()], moduleId: 'mod-1' })
    expect(uploaded).toHaveLength(1)
    expect(uploaded[0]!.path).toMatch(new RegExp(`^${USER}/[0-9a-f-]{36}\\.pdf$`))
    expect(uploaded[0]!.type).toBe('application/pdf')
    expect(inserted[0]).toEqual({
      table: 'study_resources',
      user_id: USER,
      module_id: 'mod-1',
      title: 'Lecture 5',
      kind: 'pdf',
      storage_paths: [uploaded[0]!.path],
      size_bytes: 2048,
    })
  })

  it('never sends what reading the file will find — the server writes that', async () => {
    const { resourceService, inserted } = await connected()
    await resourceService.upload(USER, { files: [pdf()] })
    for (const column of ['status', 'outline', 'page_count', 'summary', 'error', 'local_pages']) {
      expect(inserted[0], column).not.toHaveProperty(column)
    }
  })

  it('removes the uploads when the description is refused, so nothing is orphaned', async () => {
    const { resourceService, uploaded, removed } = await connected({ failInsert: true })
    await expect(resourceService.upload(USER, { files: [pdf()] })).rejects.toThrow()
    expect(removed).toEqual([uploaded.map((entry) => entry.path)])
  })

  it('says plainly when the upload itself fails, and describes nothing', async () => {
    const { resourceService, inserted } = await connected({ failUpload: true })
    await expect(resourceService.upload(USER, { files: [pdf()] })).rejects.toThrow(RESOURCE_MESSAGES.uploadFailed)
    expect(inserted).toHaveLength(0)
  })
})
