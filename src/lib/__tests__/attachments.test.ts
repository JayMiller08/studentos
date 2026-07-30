import { describe, expect, it } from 'vitest'
import {
  type Attachment,
  formatBytes,
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  resolveMimeType,
  validateFile,
} from '@/lib/attachments'

/** Minimal stand-in — validation only reads name/size/type. */
function file(name: string, size: number, type = ''): File {
  return { name, size, type } as File
}

function attachment(size: number): Attachment {
  return { name: 'x', mimeType: 'application/pdf', size, data: '' }
}

describe('resolveMimeType', () => {
  it('maps supported extensions', () => {
    expect(resolveMimeType(file('slides.pdf', 10))).toBe('application/pdf')
    expect(resolveMimeType(file('photo.JPG', 10))).toBe('image/jpeg')
    expect(resolveMimeType(file('shot.png', 10))).toBe('image/png')
  })

  it('trusts the extension when the browser reports nothing', () => {
    // Windows commonly reports an empty type for .md.
    expect(resolveMimeType(file('notes.md', 10, ''))).toBe('text/plain')
  })

  it('normalises text subtypes to text/plain', () => {
    // Gemini accepts text/plain; text/markdown would be rejected.
    expect(resolveMimeType(file('notes.markdown', 10, 'text/markdown'))).toBe('text/plain')
  })

  it('rejects everything else', () => {
    expect(resolveMimeType(file('archive.zip', 10, 'application/zip'))).toBeNull()
    expect(resolveMimeType(file('essay.docx', 10))).toBeNull()
    expect(resolveMimeType(file('clip.mp4', 10, 'video/mp4'))).toBeNull()
  })
})

describe('validateFile', () => {
  it('accepts a normal file', () => {
    expect(validateFile(file('slides.pdf', 1_000_000))).toBeNull()
  })

  it('rejects an unsupported type by name', () => {
    expect(validateFile(file('essay.docx', 1000))).toContain('essay.docx')
  })

  it('rejects an empty file', () => {
    expect(validateFile(file('blank.pdf', 0))).toContain('empty')
  })

  it('rejects a file over the per-file cap and says the limit', () => {
    const problem = validateFile(file('huge.pdf', MAX_FILE_BYTES + 1))
    expect(problem).toContain('huge.pdf')
    expect(problem).toContain('5 MB')
  })

  it('rejects a batch that would exceed the total cap', () => {
    const existing = [attachment(MAX_TOTAL_BYTES - 1000)]
    expect(validateFile(file('one-more.pdf', 5000), existing)).toContain('8 MB')
  })

  it('counts existing attachments toward the total, not just the new file', () => {
    // Each file is individually fine; together they are not.
    const half = Math.floor(MAX_TOTAL_BYTES / 2) + 1
    expect(validateFile(file('b.pdf', half), [attachment(half)])).toContain('8 MB')
    expect(validateFile(file('b.pdf', half), [])).toBeNull()
  })

  it('caps how many files can ride on one message', () => {
    const full = Array.from({ length: MAX_FILES }, () => attachment(10))
    expect(validateFile(file('extra.pdf', 10), full)).toContain(`${MAX_FILES} files`)
  })
})

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
  })
})
