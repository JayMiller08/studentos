/**
 * Files a student can hand to the AI coach.
 *
 * Everything here is what Gemini accepts as `inline_data`: PDFs, images and
 * plain text. Attachments are sent with a single message and are NOT stored —
 * `ai_messages` keeps a filename marker instead, so a semester of lecture
 * slides never ends up as base64 in Postgres.
 */

export interface Attachment {
  name: string
  mimeType: string
  /** Raw byte length, before base64 expansion. */
  size: number
  /** Base64 payload with no `data:` prefix. */
  data: string
}

/** Per-file cap. Base64 adds ~33%, so this stays well inside request limits. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/** Total across one message. */
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024
export const MAX_FILES = 4

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  txt: 'text/plain',
  md: 'text/plain',
  csv: 'text/plain',
}

const ACCEPTED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION))

/** `accept` attribute for the file input. */
export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,.txt,.md,.csv'

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
}

/**
 * Resolve the MIME type to send. Browsers report an empty or odd type for
 * `.md` and sometimes `.heic`, so the extension is the tiebreaker — and text
 * subtypes are normalised to text/plain, which is what Gemini accepts.
 */
export function resolveMimeType(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const byExtension = MIME_BY_EXTENSION[extension]
  if (byExtension) return byExtension
  if (ACCEPTED_MIME_TYPES.has(file.type)) return file.type
  if (file.type.startsWith('text/')) return 'text/plain'
  return null
}

/**
 * Why this file cannot be attached, or null when it is fine. Returns a
 * sentence to show the student rather than a code.
 */
export function validateFile(file: File, existing: Attachment[] = []): string | null {
  if (existing.length >= MAX_FILES) {
    return `You can attach up to ${MAX_FILES} files at a time.`
  }
  if (!resolveMimeType(file)) {
    return `${file.name} isn't a supported file. Attach a PDF, image, or text file.`
  }
  if (file.size === 0) {
    return `${file.name} is empty.`
  }
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_FILE_BYTES)} per file.`
  }
  const total = existing.reduce((sum, attachment) => sum + attachment.size, 0) + file.size
  if (total > MAX_TOTAL_BYTES) {
    return `That would push the attachments past ${formatBytes(MAX_TOTAL_BYTES)} in one message.`
  }
  return null
}

/** Read a validated file into a base64 attachment. */
export async function toAttachment(file: File): Promise<Attachment> {
  const mimeType = resolveMimeType(file)
  if (!mimeType) throw new Error(`${file.name} isn't a supported file type.`)

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })

  // readAsDataURL yields "data:<mime>;base64,<payload>".
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return { name: file.name, mimeType, size: file.size, data: base64 }
}
