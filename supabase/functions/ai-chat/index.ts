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
- NEVER invent deadlines, dates, grades, assignments, tasks, events or notes. Only reference items listed in the "Student context" block; if a section says "none", say you don't have that rather than guessing.
- The "Student context" block is BACKGROUND, not the subject of the conversation. Draw on it when the student asks about their workload, schedule, priorities or what to work on. Never summarise, list or describe it when they asked about something else.
- Answer the question the student actually asked. If they ask about a document, a concept or a topic, answer about THAT — do not pivot to their assignments and deadlines.
- Note excerpts in the context are previews, not full notes. Never quiz or summarise from an excerpt alone — ask the student to attach the note or file.
- Be concise, warm and practical. Prefer numbered steps and short paragraphs.
- Encourage evidence-based techniques: active recall, spaced repetition, focused blocks.
- If asked to do the student's graded work for them, help them learn it instead.
- Reply in GitHub-flavored Markdown. Do not wrap the whole reply in a code fence.`

/** ~12MB of base64, i.e. the client's 8MB raw cap plus encoding overhead. */
const MAX_ATTACHMENT_CHARS = 12 * 1024 * 1024

const MODE_PROMPTS: Record<string, string> = {
  coach: `${BASE_RULES}\nRole: personal study coach. Help plan, prioritize and stay accountable — and answer whatever they actually ask, including questions about material or files they share.`,
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
  // Roomy enough for the assignments/tasks/calendar/notes snapshot the client
  // builds, which is itself capped per section.
  const studyContext =
    typeof payload.studyContext === 'string' ? payload.studyContext.slice(0, 16000) : ''

  // Defence in depth: the client caps attachments too, but that check runs in
  // a browser the student controls.
  const attachedBytes = history.reduce(
    (sum, message) =>
      sum + (message.files ?? []).reduce((inner, file) => inner + (file.data?.length ?? 0), 0),
    0,
  )
  if (attachedBytes > MAX_ATTACHMENT_CHARS) {
    return jsonResponse({ error: 'Those attachments are too large. Send fewer or smaller files.' }, 413)
  }

  // Attachments are the subject of the turn that carries them. Said plainly
  // and *before* the context block, because otherwise a large, emphatic
  // workload snapshot wins and the model summarises the dashboard instead of
  // the document the student just handed it.
  const attachedNames = history.flatMap((message) => (message.files ?? []).map((f) => f.name))
  const attachmentDirective =
    attachedNames.length > 0
      ? `\n\n=== ATTACHED FILES ===\nThe student has attached ${attachedNames.length} file(s): ${attachedNames.join(', ')}.
These files are the subject of their request. Read them and answer from their contents.
- Work ONLY from the attached files unless the student explicitly asks how they relate to their schedule.
- Do NOT summarise or restate the "Student context" block below in your answer.
- If a file is unreadable or empty, say so plainly instead of answering from anything else.`
      : ''

  const system = `${MODE_PROMPTS[mode] ?? MODE_PROMPTS.coach}${attachmentDirective}\n\n=== STUDENT CONTEXT (background only) ===\n${studyContext || '(none provided)'}`

  try {
    const reply = await generate({ system, messages: history, maxOutputTokens: 1500 })
    return jsonResponse({ reply })
  } catch (error) {
    if (error instanceof GeminiError) return jsonResponse({ error: error.message }, error.status)
    console.error('[ai-chat] unexpected failure', error)
    return jsonResponse({ error: 'The AI service is temporarily unavailable.' }, 502)
  }
})
