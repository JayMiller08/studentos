/**
 * A student's study file, made ready for the AI.
 *
 * Shared by `resource-outline` (read a file's topics) and `quiz-generate`
 * (write questions from it). Both run with the service role, which can read
 * any student's files — so everything here starts from the caller's id, taken
 * from a verified JWT, and refuses a resource that is not theirs.
 */
import { deleteFile, type GeminiFile, uploadFile } from './gemini.ts'

export const RESOURCE_BUCKET = 'study-resources'

/** The bucket's own limit (migration 00018), checked again on the bytes. */
export const MAX_RESOURCE_BYTES = 20 * 1024 * 1024

/** The columns of `study_resources` the functions read. */
export const RESOURCE_COLUMNS = 'id, user_id, module_id, title, kind, storage_paths, status, page_count, outline, updated_at'

export interface ResourceRow {
  id: string
  user_id: string
  module_id: string | null
  title: string
  kind: 'pdf' | 'photos'
  storage_paths: string[]
  status: 'uploaded' | 'reading' | 'ready' | 'failed'
  page_count: number | null
  outline: Array<{ name?: string; pages?: string; summary?: string }> | null
  updated_at: string
}

/** A problem with the material itself, worded for the student. */
export class MaterialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MaterialError'
  }
}

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)))

/**
 * What a file really is, from its first bytes — never from its name, its
 * declared type or the row that describes it. A "PDF" that is an HTML page is
 * refused here rather than sent to the model.
 */
export function sniffMime(bytes: Uint8Array): string | null {
  // Some PDF writers put a little junk before the header; the spec allows 1 KB.
  if (ascii(bytes, 0, 1024).includes('%PDF-')) return 'application/pdf'
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp'
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12)
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) return 'image/heic'
    if (['mif1', 'msf1', 'heif'].includes(brand)) return 'image/heif'
  }
  return null
}

/**
 * Pages in a PDF, counted from its page objects. Null when they are not
 * visible — a PDF 1.5+ file can compress them into object streams — in which
 * case the model's own count is used instead.
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  let text = ''
  // Latin-1, so every byte becomes one character and offsets survive.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  const pages = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0
  if (pages > 0) return pages
  const counts = [...text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((match) => Number(match[1]))
  const total = counts.length > 0 ? Math.max(...counts) : 0
  return total > 0 ? total : null
}

export interface FileMaterial {
  kind: 'pdf' | 'photos'
  files: GeminiFile[]
  /** PDF pages, or the number of photos. */
  pageCount: number | null
  /** Delete the copies handed to the AI. Safe to call more than once. */
  release(): Promise<void>
}

/** The service-role client's storage surface, as far as this module uses it. */
interface StorageClient {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>
    }
  }
}

/**
 * Download a resource's files, check each one is what the resource says it
 * is, and upload them to Gemini for the requests that follow.
 */
export async function loadResource(db: StorageClient, userId: string, resource: ResourceRow): Promise<FileMaterial> {
  // The table's own check constraint pins every path to the owner's folder;
  // this is the second lock on the same door, because this client can open
  // every folder in the bucket.
  if (resource.user_id !== userId || resource.storage_paths.some((path) => path.split('/')[0] !== userId)) {
    throw new MaterialError('That file could not be found.')
  }

  const uploaded: GeminiFile[] = []
  let released = false
  const release = async () => {
    if (released) return
    released = true
    await Promise.all(uploaded.map((file) => deleteFile(file.name)))
  }

  try {
    let pageCount: number | null = resource.kind === 'photos' ? resource.storage_paths.length : null
    for (const [index, path] of resource.storage_paths.entries()) {
      const { data, error } = await db.storage.from(RESOURCE_BUCKET).download(path)
      if (error || !data) throw new MaterialError('That file could not be found. Try uploading it again.')
      const buffer = await data.arrayBuffer()
      if (buffer.byteLength === 0) throw new MaterialError('That file is empty.')
      if (buffer.byteLength > MAX_RESOURCE_BYTES) {
        throw new MaterialError('That file is too large to read. Files can be up to 20 MB.')
      }

      const bytes = new Uint8Array(buffer)
      const mimeType = sniffMime(bytes)
      const fits = resource.kind === 'pdf' ? mimeType === 'application/pdf' : Boolean(mimeType?.startsWith('image/'))
      if (!mimeType || !fits) {
        throw new MaterialError(
          resource.kind === 'pdf'
            ? "That file isn't a PDF we can read. Try saving it as a PDF again."
            : "One of those photos couldn't be read. Try JPEG or PNG.",
        )
      }
      if (resource.kind === 'pdf') pageCount = countPdfPages(bytes)

      const label = resource.kind === 'photos' ? `${resource.title} (photo ${index + 1})` : resource.title
      uploaded.push(await uploadFile(buffer, mimeType, label))
    }
    return { kind: resource.kind, files: uploaded, pageCount, release }
  } catch (error) {
    await release()
    throw error
  }
}
