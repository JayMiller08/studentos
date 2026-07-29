/**
 * Google Gemini client for StudentOS Edge Functions.
 *
 * The API key lives only in function env — never in the browser. Every AI
 * feature goes through `generate()` so prompts, safety handling and error
 * shapes stay consistent, and swapping model or provider is a one-file change.
 *
 * Secrets: `supabase secrets set GEMINI_API_KEY=...`
 */

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
/** Flash is fast and cheap enough for per-message use; override per deployment. */
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const isGeminiConfigured = Boolean(GEMINI_API_KEY)

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
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
      system_instruction: { parts: [{ text: options.system }] },
      // Gemini names the assistant turn "model"; everything else is "user".
      contents: messages.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(message.content).slice(0, 8000) }],
      })),
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens ?? 1500,
        temperature: options.temperature ?? 0.7,
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
  }

  return text
}
