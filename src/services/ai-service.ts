import { env } from '@/lib/env'
import { requestGuard } from '@/lib/request-guard'
import { supabase } from '@/lib/supabase'

/**
 * The app's AI calls.
 *
 * Only Smart Plan remains: the AI Coach chat was removed in the gamification
 * revamp, because a transcript proves nothing about what a student learned.
 * Quiz generation (`quiz-service.ts`) is the AI surface that replaced it.
 */
export const aiService = {
  /**
   * Coaching notes for an already-computed study plan.
   *
   * The schedule stays deterministic — this only narrates it. Returns null
   * when AI is unavailable (demo mode, no key, a failed call), and the planner
   * keeps its own rule-based recommendations, so a plan is never blocked on
   * the network.
   */
  async getPlanNotes(plan: StudyPlanRequest): Promise<string[] | null> {
    if (!supabase) return null
    try {
      const body = await callFunction<{ notes?: string[] }>('ai-plan', plan)
      const notes = (body.notes ?? []).filter((note) => note.trim().length > 0)
      return notes.length > 0 ? notes : null
    } catch (error) {
      console.warn('[ai-plan] falling back to rule-based recommendations', error)
      return null
    }
  },
}

export interface StudyPlanRequest {
  horizonDays: number
  dailyCapacityMinutes: number
  stressLevel: number
  unscheduledMinutes: number
  days: Array<{
    date: string
    minutes: number
    heavy: boolean
    blocks: Array<{ title: string; minutes: number; reason: string }>
  }>
}

/**
 * POST to an Edge Function with the caller's JWT, surfacing its error text.
 * Guarded like every other network call: AI requests are the most expensive
 * thing the app can ask for, so a client on a dead link must not keep firing
 * them at the backend.
 */
export async function callFunction<T>(name: string, payload: unknown): Promise<T> {
  const { data: sessionData } = await supabase!.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('You need to be signed in to use AI features.')

  return requestGuard.run(async () => {
    const response = await fetch(`${env.supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? `AI request failed (${response.status})`)
    }
    return (await response.json()) as T
  })
}
