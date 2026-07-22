/**
 * AI Study Coach — Supabase Edge Function.
 *
 * Holds the Anthropic key server-side, verifies the caller's JWT, enforces
 * plan entitlements (Pro/Elite), and forwards the conversation with a
 * mode-specific system prompt. Deploy: `supabase functions deploy ai-chat`.
 * Secrets: `supabase secrets set ANTHROPIC_API_KEY=...`
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsPreflight, jsonResponse } from '../_shared/cors.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const BASE_RULES = `You are the StudentOS study coach for university students.
Ground rules:
- NEVER invent deadlines, dates, grades or assignments. Only reference items listed in the "Student context" block; if it is empty, say you don't have their schedule.
- Be concise, warm and practical. Prefer numbered steps and short paragraphs.
- Encourage evidence-based techniques: active recall, spaced repetition, focused blocks.
- If asked to do the student's graded work for them, help them learn it instead.`

const MODE_PROMPTS: Record<string, string> = {
  coach: `${BASE_RULES}\nRole: personal study coach. Help plan, prioritize and stay accountable.`,
  quiz: `${BASE_RULES}\nRole: quiz master. Turn the student's material into 5-8 exam-style questions of mixed difficulty. Put all answers at the end.`,
  flashcards: `${BASE_RULES}\nRole: flashcard builder. Produce concise Front/Back pairs (max 12) from the material. Fronts are questions or terms, backs are minimal answers.`,
  summary: `${BASE_RULES}\nRole: summarizer. Produce a tight summary: 3-sentence overview, then bullet key points, then key terms with one-line definitions.`,
  essay: `${BASE_RULES}\nRole: writing tutor. Review structure, argument and clarity. Quote specific sentences when critiquing. Do not rewrite whole essays; show one improved example paragraph at most.`,
  code: `${BASE_RULES}\nRole: programming tutor. Explain concepts and debug with the student. Prefer guiding questions and minimal corrected snippets over full solutions.`,
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!ANTHROPIC_API_KEY) return jsonResponse({ error: 'AI is not configured on this deployment' }, 503)

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  // Entitlement check — the AI coach is a paid feature.
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()
  if (!profile || profile.plan === 'free') {
    return jsonResponse({ error: 'The AI coach requires Student Pro.' }, 403)
  }

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

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1500,
      system,
      messages: history.map((message) => ({
        role: message.role,
        content: String(message.content).slice(0, 8000),
      })),
    }),
  })

  if (!anthropicResponse.ok) {
    const detail = await anthropicResponse.text()
    console.error('[ai-chat] anthropic error', anthropicResponse.status, detail)
    return jsonResponse({ error: 'The AI service is temporarily unavailable.' }, 502)
  }

  const completion = (await anthropicResponse.json()) as {
    content: Array<{ type: string; text?: string }>
  }
  const reply = completion.content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')

  return jsonResponse({ reply })
})
