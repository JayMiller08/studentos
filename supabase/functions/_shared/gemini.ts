/**
 * Google Gemini client for StudentOS Edge Functions.
 *
 * The API key lives only in function env — never in the browser. Every AI
 * feature goes through `generate()` so prompts, safety handling and error
 * shapes stay consistent, and swapping model or provider is a one-file change.
 *
 * Secrets: `supabase secrets set GEMINI_API_KEY=...`
 */

/**
 * Read through `globalThis` rather than the bare `Deno` global. Identical at
 * runtime, but it keeps this module importable — and therefore testable — from
 * the app's Node toolchain without declaring a fake `Deno` that app code could
 * then reference by mistake.
 */
const denoEnv = (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno
  ?.env

const GEMINI_API_KEY = denoEnv?.get('GEMINI_API_KEY')
/** Flash is fast and cheap enough for per-message use; override per deployment. */
const GEMINI_MODEL = denoEnv?.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const FILES_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta/files'

/** Long enough for a 20 MB PDF to be read; short of the platform's wall clock. */
const DEFAULT_TIMEOUT_MS = 100_000

/**
 * How many tokens the model may spend reasoning before it starts writing.
 *
 * This is deducted from `maxOutputTokens`, so an uncapped ("dynamic") budget
 * lets a long document eat the answer. 2048 leaves the bulk of the ceiling for
 * prose while keeping enough reasoning for quizzes and summaries.
 *
 * Deliberately a positive number, not 0: 2.5 Flash accepts 0 to disable
 * thinking entirely, but 2.5 Pro rejects it (its minimum is 128), and the
 * model is deployment-configurable. Override with GEMINI_THINKING_BUDGET.
 */
const DEFAULT_THINKING_BUDGET = 2048

function readThinkingBudget(): number {
  const raw = denoEnv?.get('GEMINI_THINKING_BUDGET')?.trim()
  if (!raw) return DEFAULT_THINKING_BUDGET
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_THINKING_BUDGET
}

const THINKING_BUDGET = readThinkingBudget()

export const isGeminiConfigured = Boolean(GEMINI_API_KEY)

export interface InlineFile {
  name: string
  mimeType: string
  /** Base64, no `data:` prefix. */
  data: string
}

/** A file already uploaded through the Files API (see uploadFile). */
export interface GeminiFile {
  /** `files/abc123` — what deleteFile takes. */
  name: string
  uri: string
  mimeType: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Files sent with this turn (PDF, image or text) — user turns only. */
  files?: InlineFile[]
  /** Files uploaded beforehand, referenced by URI — user turns only. */
  fileRefs?: GeminiFile[]
}

/** Carries an HTTP status so callers can pass a sensible code to the client. */
export class GeminiError extends Error {
  readonly status: number

  constructor(message: string, status = 502) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> }
  finishReason?: string
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

export interface GenerateOptions {
  /** Steering instructions; sent as Gemini's system_instruction. */
  system: string
  messages: ChatMessage[]
  maxOutputTokens?: number
  temperature?: number
  /** Set to 'application/json' to make Gemini emit parseable JSON. */
  responseMimeType?: string
  /**
   * Tokens the model may spend reasoning before it writes. Capped because this
   * comes OUT of `maxOutputTokens` — see THINKING_BUDGET.
   */
  thinkingBudget?: number
  /**
   * The shape the JSON must take (Gemini's OpenAPI-style Schema). The reply is
   * still validated by the caller: a schema makes malformed output rare, not
   * impossible, and the caller is the one storing it.
   */
  responseSchema?: unknown
  /**
   * Characters of each message's text that are sent. 8000 suits a chat turn;
   * a caller sending a whole note as the material says so explicitly.
   */
  maxMessageChars?: number
  /** Give up after this long rather than outlive the Edge Function. */
  timeoutMs?: number
}

/**
 * Upload a file through the Files API, for use in several requests.
 *
 * Inline data would send the same bytes again with every request, and a quiz
 * that is written and then checked reads its PDF twice. Files expire on
 * Google's side after 48 hours regardless; callers delete them when done.
 */
export async function uploadFile(bytes: ArrayBuffer, mimeType: string, displayName: string): Promise<GeminiFile> {
  if (!GEMINI_API_KEY) throw new GeminiError('AI is not configured on this deployment.', 503)

  const started = await fetch(UPLOAD_BASE, {
    method: 'POST',
    headers: {
      'x-goog-api-key': GEMINI_API_KEY,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ file: { displayName: displayName.slice(0, 120) } }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  const uploadUrl = started.headers.get('x-goog-upload-url')
  if (!started.ok || !uploadUrl) {
    console.error('[gemini] upload start failed', started.status, await started.text().catch(() => ''))
    throw uploadError(started.status)
  }

  const finished = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: bytes,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  })
  if (!finished.ok) {
    console.error('[gemini] upload failed', finished.status, await finished.text().catch(() => ''))
    throw uploadError(finished.status)
  }

  const body = (await finished.json()) as {
    file?: { name?: string; uri?: string; mimeType?: string; state?: string }
  }
  const file = body.file
  if (!file?.name || !file.uri) throw uploadError(502)

  // Documents and images are normally usable at once; one still being
  // processed is waited for briefly, rather than sent and refused.
  let state = file.state ?? 'ACTIVE'
  for (let attempt = 0; state === 'PROCESSING' && attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const polled = await fetch(`${FILES_BASE}/${file.name}`, { headers: { 'x-goog-api-key': GEMINI_API_KEY } })
    state = polled.ok ? (((await polled.json()) as { state?: string }).state ?? 'ACTIVE') : 'FAILED'
  }
  if (state !== 'ACTIVE') {
    void deleteFile(file.name)
    throw new GeminiError('The AI service could not read that file.', 422)
  }

  return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? mimeType }
}

function uploadError(status: number): GeminiError {
  const retryable = status === 429 || status >= 500
  return new GeminiError(
    retryable ? 'The AI service is busy right now. Try again in a moment.' : 'The AI service could not take that file.',
    retryable ? 503 : 502,
  )
}

/** Delete an uploaded file. Best effort: it expires on its own within 48 hours. */
export async function deleteFile(name: string): Promise<void> {
  if (!GEMINI_API_KEY) return
  try {
    await fetch(`${FILES_BASE}/${name}`, { method: 'DELETE', headers: { 'x-goog-api-key': GEMINI_API_KEY } })
  } catch (error) {
    console.warn('[gemini] could not delete an uploaded file', name, error)
  }
}

/**
 * Call Gemini and return the concatenated text. Throws GeminiError with a
 * user-safe message — the raw provider response is logged, never returned,
 * so provider wording and internals stay out of the product.
 */
export async function generate(options: GenerateOptions): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new GeminiError('AI is not configured on this deployment.', 503)
  }

  // Gemini rejects a conversation that opens on a model turn. A thread can
  // start that way if an earlier reply was saved without its prompt, so drop
  // leading assistant turns rather than letting the provider 400.
  const firstUser = options.messages.findIndex((message) => message.role === 'user')
  const messages = firstUser <= 0 ? options.messages : options.messages.slice(firstUser)
  if (messages.length === 0) {
    throw new GeminiError('There is nothing to send to the AI service.', 400)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: {
        'x-goog-api-key': GEMINI_API_KEY,
        'content-type': 'application/json',
      },
      body: requestBody(options, messages),
    })
  } catch (error) {
    // A timeout or a dropped connection, before Gemini answered at all.
    console.error('[gemini] request did not complete', error)
    throw new GeminiError('The AI service took too long to answer. Try again.', 503)
  }

  return readCompletion(response, options)
}

function requestBody(options: GenerateOptions, messages: ChatMessage[]): string {
  return JSON.stringify({
    // Canonical camelCase throughout. The proto-JSON parser also accepts
    // snake_case, but mixing the two is how an `inline_data` block quietly
    // goes missing — and a dropped attachment looks exactly like the model
    // ignoring the file.
    systemInstruction: { parts: [{ text: options.system }] },
    // Gemini names the assistant turn "model"; everything else is "user".
    contents: messages.map((message) => {
      const text = String(message.content ?? '').slice(0, options.maxMessageChars ?? 8000)
      const files =
        // Attachments ride alongside the text of the same turn. Only user
        // turns carry them; a model turn with file data is rejected.
        message.role === 'user'
          ? [
              ...(message.files ?? []).map((file) => ({
                inlineData: { mimeType: file.mimeType, data: file.data },
              })),
              ...(message.fileRefs ?? []).map((file) => ({
                fileData: { mimeType: file.mimeType, fileUri: file.uri },
              })),
            ]
          : []
      return {
        role: message.role === 'assistant' ? 'model' : 'user',
        // An empty text part is not just noise — it can make Gemini treat
        // the turn as contentless and answer the system prompt instead. Send
        // one only when there is something to send.
        parts: text.trim() ? [{ text }, ...files] : files.length > 0 ? files : [{ text }],
      }
    }),
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      // Gemini 2.5 reasons before it writes, and those thinking tokens are
      // billed against maxOutputTokens. Left on "dynamic" the model can spend
      // most of the budget thinking about a long document and then get cut
      // off mid-answer — which reads as "the reply is longer but still
      // incomplete" no matter how high the ceiling goes. Capping reasoning is
      // the fix; raising the ceiling alone only buys a little more each time.
      thinkingConfig: { thinkingBudget: options.thinkingBudget ?? THINKING_BUDGET },
      ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {}),
      ...(options.responseSchema ? { responseSchema: options.responseSchema } : {}),
    },
  })
}

async function readCompletion(response: Response, options: GenerateOptions): Promise<string> {
  if (!response.ok) {
    const detail = await response.text()
    console.error('[gemini] request failed', response.status, detail)
    // 429/5xx are transient; anything else is very likely our key or payload.
    const retryable = response.status === 429 || response.status >= 500
    throw new GeminiError(
      retryable
        ? 'The AI service is busy right now. Try again in a moment.'
        : 'The AI service rejected this request.',
      retryable ? 503 : 502,
    )
  }

  const body = (await response.json()) as GeminiResponse

  if (body.promptFeedback?.blockReason) {
    console.warn('[gemini] prompt blocked', body.promptFeedback.blockReason)
    throw new GeminiError(
      'That request was blocked by the AI safety filters. Try rephrasing it.',
      422,
    )
  }

  const candidate = body.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim()

  if (!text) {
    // SAFETY/RECITATION produce an empty candidate rather than an HTTP error.
    console.warn('[gemini] empty completion', candidate?.finishReason, body.error?.message)
    throw new GeminiError(
      candidate?.finishReason === 'SAFETY'
        ? 'That request was blocked by the AI safety filters. Try rephrasing it.'
        : 'The AI service returned an empty response. Try again.',
      candidate?.finishReason === 'SAFETY' ? 422 : 502,
    )
  }

  if (candidate?.finishReason === 'MAX_TOKENS') {
    console.warn('[gemini] response truncated at maxOutputTokens')
    // Say so rather than handing back a sentence that stops mid-word. Skipped
    // for JSON responses, where appending prose would break the parse.
    if (!options.responseMimeType) {
      return `${text}\n\n---\n*That answer hit the length limit. Ask me to continue and I'll pick up where I left off.*`
    }
  }

  return text
}
