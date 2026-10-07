import { supabase } from '@/lib/supabase'
import { callFunction } from '@/services/ai-service'
import { byUser, table } from '@/services/db'
import { NoteImageError, prepareImage } from '@/services/note-images-service'
import type { OutlineTopic, StudyResource, StudyResourceKind } from '@/types/models'

/**
 * The study library: files a student quizzes from.
 *
 * With Supabase, files go to the private `study-resources` bucket (migration
 * 00018), the row describing them is the student's, and what reading them
 * finds — the outline, the page count, the status — is written by the
 * `resource-outline` function alone.
 *
 * Demo mode has no storage and no AI. A PDF's text is read in the browser
 * (lib/pdf-text.ts) and kept on the local row, page by page, so demo quizzes
 * are still built from the file itself; photos need the AI and are declined.
 */

export const RESOURCE_BUCKET = 'study-resources'
/** The bucket's own limit, so storage never refuses a surprise. */
export const RESOURCE_MAX_BYTES = 20 * 1024 * 1024
export const RESOURCE_MAX_PHOTOS = 10
/** Files the AI may read per student per day (`begin_outline`, 00018). */
export const DAILY_FILE_READINGS = 20

/** What the bucket accepts. */
export const RESOURCE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'] as const

/** For a file input's `accept`. HEIC by extension too: browsers often leave its type blank. */
export const RESOURCE_ACCEPT = '.pdf,application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif'

export const RESOURCE_MESSAGES = {
  nothing: 'Choose a PDF, or photos of your notes.',
  mixed: 'Add one PDF, or photos of your notes — not both at once.',
  onePdf: 'Add one PDF at a time.',
  tooManyPhotos: `Up to ${RESOURCE_MAX_PHOTOS} photos make one file. Split longer notes into two.`,
  unsupported: "That file type can't be quizzed yet. Save Word or PowerPoint files as PDF first.",
  tooLarge: 'That file is too large. Files can be up to 20 MB.',
  uploadFailed: "The file couldn't be uploaded. Check your connection and try again.",
  photosNeedAi: "Photos need the AI to read them, which demo mode doesn't have. Try a PDF or a note.",
  noText:
    'That PDF has no text layer to read — it may be scanned. The full app reads scans with AI; demo mode cannot.',
  unreadable: "That PDF couldn't be opened. Try saving it again.",
} as const

/** A problem with a file, worded for the student. */
export class ResourceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResourceError'
  }
}

const HEIC_TYPES = new Set(['image/heic', 'image/heif'])

/** The type a file really carries, filling in HEIC where the browser left it blank. */
export function fileType(file: Pick<File, 'type' | 'name'>): string {
  if (file.type) return file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (name.endsWith('.heic')) return 'image/heic'
  if (name.endsWith('.heif')) return 'image/heif'
  if (name.endsWith('.pdf')) return 'application/pdf'
  return ''
}

/** One PDF, or 1–10 photos — anything else is refused before an upload starts. */
export function classifyFiles(files: Array<Pick<File, 'type' | 'name' | 'size'>>): StudyResourceKind {
  if (files.length === 0) throw new ResourceError(RESOURCE_MESSAGES.nothing)
  const types = files.map(fileType)
  const pdfs = types.filter((type) => type === 'application/pdf').length
  const photos = types.filter((type) => type.startsWith('image/') && (RESOURCE_TYPES as readonly string[]).includes(type)).length
  if (pdfs > 0 && photos > 0) throw new ResourceError(RESOURCE_MESSAGES.mixed)
  if (pdfs + photos !== files.length) throw new ResourceError(RESOURCE_MESSAGES.unsupported)
  if (pdfs > 1) throw new ResourceError(RESOURCE_MESSAGES.onePdf)
  if (photos > RESOURCE_MAX_PHOTOS) throw new ResourceError(RESOURCE_MESSAGES.tooManyPhotos)
  // HEIC goes up as it is (few browsers can re-encode it); everything else is
  // shrunk first, so only those two are held to the bucket's limit here.
  const kind: StudyResourceKind = pdfs === 1 ? 'pdf' : 'photos'
  for (const [index, file] of files.entries()) {
    const sentAsIs = kind === 'pdf' || HEIC_TYPES.has(types[index]!)
    if (sentAsIs && file.size > RESOURCE_MAX_BYTES) throw new ResourceError(RESOURCE_MESSAGES.tooLarge)
  }
  return kind
}

/** "lecture_05-eigenvalues.pdf" -> "Lecture 05 eigenvalues". */
export function titleFromFile(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!base) return 'Untitled file'
  return (base[0]!.toUpperCase() + base.slice(1)).slice(0, 160)
}

const EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

/** A file as it will be stored: PDFs and HEIC as they are, other photos shrunk. */
async function prepare(file: File): Promise<{ blob: Blob; type: string }> {
  const type = fileType(file)
  if (type === 'application/pdf' || HEIC_TYPES.has(type)) return { blob: file, type }
  try {
    const blob = await prepareImage(file)
    return { blob, type: blob.type }
  } catch (error) {
    if (error instanceof NoteImageError) throw new ResourceError(error.message)
    throw error
  }
}

/** Split a file's pages into up to eight runs, each named by its first heading-like line. */
export function localOutline(pages: string[]): OutlineTopic[] {
  const filled = pages.map((text, index) => ({ text, page: index + 1 })).filter((page) => page.text.trim())
  if (filled.length === 0) return []
  const sections = Math.min(8, filled.length)
  const size = Math.ceil(filled.length / sections)
  const topics: OutlineTopic[] = []
  for (let start = 0; start < filled.length; start += size) {
    const run = filled.slice(start, start + size)
    const first = run[0]!
    const last = run[run.length - 1]!
    const heading = (first.text.split(/(?<=[.!?:])\s+|\s{2,}/)[0] ?? '').trim().replace(/[.:;,!?]+$/, '')
    const range = first.page === last.page ? `${first.page}` : `${first.page}–${last.page}`
    topics.push({
      name: heading && heading.length <= 70 ? heading : `Pages ${range}`,
      pages: range,
      summary: null,
    })
  }
  return topics
}

const resources = () => table<StudyResource>('study_resources')

export const resourceService = {
  list(userId: string): Promise<StudyResource[]> {
    return resources().list({ filters: byUser(userId), orderBy: { column: 'created_at', ascending: false } })
  },

  /**
   * Add files to the library as one resource. Uploads everything first and
   * describes it afterwards, removing the uploads if the description is
   * refused (a full Free library, say), so nothing is left orphaned.
   */
  async upload(
    userId: string,
    input: { files: File[]; title?: string; moduleId?: string | null },
  ): Promise<StudyResource> {
    const kind = classifyFiles(input.files)
    const title = (input.title ?? '').trim().slice(0, 160) || titleFromFile(input.files[0]!.name)

    if (!supabase) return uploadLocally(userId, kind, input.files, title, input.moduleId ?? null)

    const prepared = await Promise.all(input.files.map(prepare))
    const paths: string[] = []
    try {
      for (const file of prepared) {
        const path = `${userId}/${crypto.randomUUID()}.${EXTENSION[file.type] ?? 'bin'}`
        const { error } = await supabase.storage.from(RESOURCE_BUCKET).upload(path, file.blob, {
          contentType: file.type,
          upsert: false,
        })
        if (error) throw new ResourceError(RESOURCE_MESSAGES.uploadFailed)
        paths.push(path)
      }
      return await resources().insert({
        user_id: userId,
        module_id: input.moduleId ?? null,
        title,
        kind,
        storage_paths: paths,
        size_bytes: prepared.reduce((sum, file) => sum + file.blob.size, 0),
      })
    } catch (error) {
      if (paths.length > 0) await supabase.storage.from(RESOURCE_BUCKET).remove(paths)
      throw error
    }
  },

  /** Ask the server to read a file's outline. Demo files are read on upload. */
  async read(resourceId: string): Promise<void> {
    if (!supabase) return
    await callFunction<{ status: string }>('resource-outline', { resourceId })
  },

  rename(id: string, patch: { title?: string; module_id?: string | null }): Promise<StudyResource> {
    return resources().update(id, patch)
  },

  /** Delete the files and the row. Quizzes made from it are kept. */
  async remove(resource: StudyResource): Promise<void> {
    if (supabase) {
      const { error } = await supabase.storage.from(RESOURCE_BUCKET).remove(resource.storage_paths)
      // A file that is already gone must not keep its row alive.
      if (error) console.warn('[resources] could not remove files', error)
    }
    await resources().remove(resource.id)
  },
}

/** Demo upload: read the PDF's text now, and keep it on the local row. */
async function uploadLocally(
  userId: string,
  kind: StudyResourceKind,
  files: File[],
  title: string,
  moduleId: string | null,
): Promise<StudyResource> {
  if (kind === 'photos') throw new ResourceError(RESOURCE_MESSAGES.photosNeedAi)
  const file = files[0]!
  let pages: string[]
  try {
    const { pdfPages } = await import('@/lib/pdf-text')
    pages = await pdfPages(await file.arrayBuffer())
  } catch (error) {
    console.warn('[resources] demo PDF read failed', error)
    throw new ResourceError(RESOURCE_MESSAGES.unreadable)
  }
  if (pages.join(' ').trim().length < 200) throw new ResourceError(RESOURCE_MESSAGES.noText)

  return resources().insert({
    user_id: userId,
    module_id: moduleId,
    title,
    kind,
    storage_paths: [`${userId}/${crypto.randomUUID()}.pdf`],
    size_bytes: file.size,
    status: 'ready',
    page_count: pages.length,
    outline: localOutline(pages),
    summary: null,
    error: null,
    // Demo only: the text the local quiz builder reads. Never a database column.
    local_pages: pages,
  })
}
