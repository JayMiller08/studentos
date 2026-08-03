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

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Files sent with this turn (PDF, image or text) — user turns only. */
  files?: InlineFile[]
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

  const response = await fetch(`${API_BASE}/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': GEMINI_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      // Canonical camelCase throughout. The proto-JSON parser also accepts
      // snake_case, but mixing the two is how an `inline_data` block quietly
      // goes missing — and a dropped attachment looks exactly like the model
      // ignoring the file.
      systemInstruction: { parts: [{ text: options.system }] },
      // Gemini names the assistant turn "model"; everything else is "user".
      contents: messages.map((message) => {
        const text = String(message.content ?? '').slice(0, 8000)
        const files =
          // Attachments ride alongside the text of the same turn. Only user
          // turns carry them; a model turn with inline data is rejected.
          message.role === 'user'
            ? (message.files ?? []).map((file) => ({
                inlineData: { mimeType: file.mimeType, data: file.data },
              }))
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
      },
    }),
  })

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
