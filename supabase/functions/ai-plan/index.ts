/**
 * Smart Plan coaching notes — Supabase Edge Function.
 *
 * The schedule itself is computed deterministically on the client (capacity
 * arithmetic and deadline ordering are not things to hand an LLM). This
 * function only writes the guidance *around* that plan, grounded in the blocks
 * it is given, so it can never invent a deadline or move a block.
 *
 * Deploy:  `supabase functions deploy ai-plan`
 * Secrets: `supabase secrets set GEMINI_API_KEY=...`
 */
import { requirePaidCaller } from '../_shared/auth.ts'
import { corsPreflight, jsonResponse } from '../_shared/cors.ts'
import { GeminiError, generate, isGeminiConfigured } from '../_shared/gemini.ts'

interface PlanBlock {
  title: string
  minutes: number
  reason: string
}

interface PlanDay {
  date: string
  minutes: number
  heavy: boolean
  blocks: PlanBlock[]
}

interface PlanPayload {
  horizonDays?: number
  dailyCapacityMinutes?: number
  /** 0 (calm) – 1 (exam panic). */
  stressLevel?: number
  unscheduledMinutes?: number
  days?: PlanDay[]
}

const SYSTEM = `You are the StudentOS study coach writing notes on a study plan that has ALREADY been generated for a university student.

Ground rules:
- The schedule is fixed. Do NOT propose a different one, restate it day by day, or invent deadlines, dates, modules or assignments that are not in the plan.
- Only reference work that appears in the plan you are given.
- Write 3 to 5 short notes. Each is one or two sentences, specific and actionable.
- Reference concrete numbers from the plan (hours, day counts, the heaviest day) so the advice is clearly about THIS plan.
- Cover, where relevant: the biggest risk in the plan, how to protect energy on heavy days, what to do first, and what to drop or renegotiate if the week slips.
- Warm and direct. No preamble, no headings, no markdown bullets — the app renders them as a list.
- If the plan schedules nothing, say so plainly and suggest what to do with the free time.

Return ONLY a JSON object of the form {"notes": ["...", "..."]}.`

function formatPlan(plan: PlanPayload): string {
  const days = Array.isArray(plan.days) ? plan.days.slice(0, 21) : []
  const totalMinutes = days.reduce((sum, day) => sum + (Number(day.minutes) || 0), 0)
  const heavyDays = days.filter((day) => day.heavy).length

  const lines = days.map((day) => {
    const blocks = (day.blocks ?? [])
      .slice(0, 8)
      .map((block) => `${block.title} (${block.minutes}m — ${block.reason})`)
      .join('; ')
    return `- ${day.date}: ${day.minutes}m${day.heavy ? ' [heavy]' : ''}${blocks ? ` — ${blocks}` : ' — nothing scheduled'}`
  })

  const stress = Number(plan.stressLevel ?? 0.5)
  return [
    `Horizon: ${plan.horizonDays ?? days.length} days`,
    `Daily capacity: ${plan.dailyCapacityMinutes ?? 0} minutes`,
    `Stress level: ${stress < 0.34 ? 'calm' : stress < 0.67 ? 'steady' : 'crunch time'}`,
    `Total scheduled: ${totalMinutes} minutes across ${days.filter((d) => d.minutes > 0).length} active day(s)`,
    `Heavy days: ${heavyDays}`,
    `Work that did not fit: ${plan.unscheduledMinutes ?? 0} minutes`,
    '',
    'Plan:',
    ...lines,
  ].join('\n')
}

/** Pull the notes array out of Gemini's JSON, tolerating a stray code fence. */
function parseNotes(raw: string): string[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const parsed = JSON.parse(cleaned) as { notes?: unknown }
  if (!Array.isArray(parsed.notes)) throw new Error('missing notes array')
  return parsed.notes
    .filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
    .map((note) => note.trim())
    .slice(0, 6)
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

  let plan: PlanPayload
  try {
    plan = (await req.json()) as PlanPayload
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  if (!Array.isArray(plan.days) || plan.days.length === 0) {
    return jsonResponse({ error: 'No plan provided' }, 400)
  }

  try {
    const text = await generate({
      system: SYSTEM,
      messages: [{ role: 'user', content: formatPlan(plan) }],
      maxOutputTokens: 700,
      temperature: 0.6,
      responseMimeType: 'application/json',
    })
    return jsonResponse({ notes: parseNotes(text) })
  } catch (error) {
    if (error instanceof GeminiError) return jsonResponse({ error: error.message }, error.status)
    // A malformed JSON completion lands here; the client keeps its own
    // rule-based recommendations, so this degrades rather than breaks.
    console.error('[ai-plan] unexpected failure', error)
    return jsonResponse({ error: 'Could not generate coaching notes.' }, 502)
  }
})
