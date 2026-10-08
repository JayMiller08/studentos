import { afterEach, describe, expect, it, vi } from 'vitest'
import { installDeno } from '@/test/edge-fakes'
import { fakeGemini, jpegBytes, pdfBytes } from '@/test/gemini-fake'

/**
 * The material loader the AI functions share. It runs with the service role,
 * which can read every student's files, so it decides what a file *is* from
 * its own bytes and refuses any path outside the caller's folder — even one a
 * resource row names, which the database would already have refused.
 */

installDeno({ GEMINI_API_KEY: 'key' })
const { countPdfPages, loadResource, MaterialError, sniffMime } = await import('../../../supabase/functions/_shared/material.ts')

const ascii = (text: string) => new TextEncoder().encode(text)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('sniffMime', () => {
  it.each([
    ['a PDF', ascii('%PDF-1.7\n...'), 'application/pdf'],
    ['a PDF with a little junk before its header', ascii(`${' '.repeat(300)}%PDF-1.4`), 'application/pdf'],
    ['a PNG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
    ['a JPEG', jpegBytes(), 'image/jpeg'],
    ['a WebP', ascii('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '), 'image/webp'],
    ['a HEIC', ascii('\u0000\u0000\u0000\u0018ftypheic'), 'image/heic'],
    ['a HEIF', ascii('\u0000\u0000\u0000\u0018ftypmif1'), 'image/heif'],
  ])('recognises %s', (_label, bytes, type) => {
    expect(sniffMime(bytes)).toBe(type)
  })

  it.each([
    ['an HTML page named .pdf', ascii('<!doctype html><title>x</title>')],
    ['a Windows executable', ascii('MZ\u0090\u0000')],
    ['a zip (a .docx is one)', new Uint8Array([0x50, 0x4b, 0x03, 0x04])],
    ['nothing at all', new Uint8Array()],
  ])('refuses %s', (_label, bytes) => {
    expect(sniffMime(bytes)).toBeNull()
  })
})

describe('countPdfPages', () => {
  it('counts page objects', () => {
    expect(countPdfPages(pdfBytes(7))).toBe(7)
  })

  it('does not count the /Pages tree as a page', () => {
    expect(countPdfPages(ascii('%PDF-1.7 << /Type /Pages /Kids [] /Count 3 >> << /Type /Page >>'))).toBe(1)
  })

  it('falls back to the page tree count when page objects are compressed away', () => {
    expect(countPdfPages(ascii('%PDF-1.7 << /Type /Pages /Kids [4 0 R] /Count 42 >>'))).toBe(42)
  })

  it('says it does not know rather than guessing', () => {
    expect(countPdfPages(ascii('%PDF-1.7 stream...endstream'))).toBeNull()
  })
})

describe('loadResource', () => {
  const storage = (files: Record<string, Uint8Array>) => ({
    storage: {
      from: () => ({
        download: async (path: string) =>
          files[path] ? { data: new Blob([files[path] as Uint8Array<ArrayBuffer>]), error: null } : { data: null, error: { message: 'nope' } },
      }),
    },
  })
  const resource = (overrides: Record<string, unknown> = {}) => ({
    id: 'r1',
    user_id: 'me',
    module_id: null,
    title: 'Lecture',
    kind: 'pdf' as const,
    storage_paths: ['me/a.pdf'],
    status: 'ready' as const,
    page_count: null,
    outline: [],
    updated_at: '',
    ...overrides,
  })

  it("refuses a path outside the caller's folder, before downloading anything", async () => {
    const gemini = fakeGemini({})
    const db = storage({ 'them/a.pdf': pdfBytes(1) })
    await expect(loadResource(db, 'me', resource({ storage_paths: ['them/a.pdf'] }))).rejects.toBeInstanceOf(MaterialError)
    expect(gemini.uploads).toHaveLength(0)
  })

  it('refuses a resource that belongs to someone else', async () => {
    await expect(loadResource(storage({}), 'me', resource({ user_id: 'them' }))).rejects.toThrow(/could not be found/)
  })

  it('uploads a real PDF once, with its counted pages, and deletes it on release', async () => {
    const gemini = fakeGemini({})
    const loaded = await loadResource(storage({ 'me/a.pdf': pdfBytes(4) }), 'me', resource())
    expect(loaded).toMatchObject({ kind: 'pdf', pageCount: 4 })
    expect(gemini.uploads).toEqual([expect.objectContaining({ mimeType: 'application/pdf' })])
    await loaded.release()
    await loaded.release()
    expect(gemini.deleted).toEqual(['files/f1'])
  })

  it('cleans up the photos already sent when a later one is not a photo', async () => {
    const gemini = fakeGemini({})
    const db = storage({ 'me/1.jpg': jpegBytes(), 'me/2.jpg': ascii('not an image') })
    await expect(
      loadResource(db, 'me', resource({ kind: 'photos', storage_paths: ['me/1.jpg', 'me/2.jpg'] })),
    ).rejects.toThrow(/couldn't be read/)
    expect(gemini.uploads).toHaveLength(1)
    expect(gemini.deleted).toEqual(['files/f1'])
  })

  it('refuses an empty file and an oversized one', async () => {
    fakeGemini({})
    await expect(loadResource(storage({ 'me/a.pdf': new Uint8Array() }), 'me', resource())).rejects.toThrow(/empty/)
    const huge = new Uint8Array(20 * 1024 * 1024 + 1)
    huge.set(ascii('%PDF-1.7'))
    await expect(loadResource(storage({ 'me/a.pdf': huge }), 'me', resource())).rejects.toThrow(/20 MB/)
  })
})
