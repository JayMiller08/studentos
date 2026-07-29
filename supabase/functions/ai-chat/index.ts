/**
 * AI Study Coach — Supabase Edge Function.
 *
 * Verifies the caller's JWT, enforces plan entitlements (Pro/Elite), and
 * forwards the conversation to Gemini with a mode-specific system prompt.
 * The API key stays server-side.
 *
 * Deploy:  `supabase functions deploy ai-chat`
 * Secrets: `supabase secrets set GEMINI_API_KEY=...`
 */
import { requirePaidCaller } from '../_shared/auth.ts'
import { corsPreflight, jsonResponse } from '../_shared/cors.ts'
import { type ChatMessage, GeminiError, generate, isGeminiConfigured } from '../_shared/gemini.ts'

const BASE_RULES = `You are the StudentOS study coach for university students.
Ground rules:
- NEVER invent deadlines, dates, grades or assignments. Only reference items listed in the "Student context" block; if it is empty, say you don't have their schedule.
- Be concise, warm and practical. Prefer numbered steps and short paragraphs.
- Encourage evidence-based techniques: active recall, spaced repetition, focused blocks.
- If asked to do the student's graded work for them, help them learn it instead.
- Reply in GitHub-flavored Markdown. Do not wrap the whole reply in a code fence.`

const MODE_PROMPTS: Record<string, string> = {
  coach: `${BASE_RULES}\nRole: personal study coach. Help plan, prioritize and stay accountable.`,
  quiz: `${BASE_RULES}\nRole: quiz master. Turn the student's material into 5-8 exam-style questions of mixed difficulty. Put all answers at the end.`,
  flashcards: `${BASE_RULES}\nRole: flashcard builder. Produce concise Front/Back pairs (max 12) from the material. Fronts are questions or terms, backs are minimal answers.`,
  summary: `${BASE_RULES}\nRole: summarizer. Produce a tight summary: 3-sentence overview, then bullet key points, then key terms with one-line definitions.`,
  essay: `${BASE_RULES}\nRole: writing tutor. Review structure, argument and clarity. Quote specific sentences when critiquing. Do not rewrite whole essays; show one improved example paragraph at most.`,
  code: `${BASE_RULES}\nRole: programming tutor. Explain concepts and debug with the student. Prefer guiding questions and minimal corrected snippets over full solutions.`,
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!isGeminiConfigured) {
    return jsonResponse({ error: 'AI is not configured on this deployment' }, 503)
  }

  const { caller, response } = await requirePaidCaller(req)
  if (!caller) return response

  let payload: { mode?: string; messages?: ChatMessage[]; studyContext?: string }
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const mode = typeof payload.mode === 'string' ? payload.mode : 'coach'
  const history = Array.isArray(payload.messages) ? payload.messages.slice(-20) : []
  if (history.length === 0) return jsonResponse({ error: 'No messages provided' }, 400)
  const studyContext =
    typeof payload.studyContext === 'string' ? payload.studyContext.slice(0, 4000) : ''

  const system = `${MODE_PROMPTS[mode] ?? MODE_PROMPTS.coach}\n\nStudent context:\n${studyContext || '(none provided)'}`

  try {
    const reply = await generate({ system, messages: history, maxOutputTokens: 1500 })
    return jsonResponse({ reply })
  } catch (error) {
    if (error instanceof GeminiError) return jsonResponse({ error: error.message }, error.status)
    console.error('[ai-chat] unexpected failure', error)
    return jsonResponse({ error: 'The AI service is temporarily unavailable.' }, 502)
  }
})
