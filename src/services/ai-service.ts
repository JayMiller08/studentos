import { env } from '@/lib/env'
import { requestGuard } from '@/lib/request-guard'
import { supabase } from '@/lib/supabase'
import { byUser, table } from '@/services/db'
import type { AIConversation, AIMessage } from '@/types/models'

export type CoachMode = AIConversation['mode']

export const COACH_MODES: Array<{ id: CoachMode; label: string; hint: string }> = [
  { id: 'coach', label: 'Study coach', hint: 'Plans, techniques and accountability' },
  { id: 'quiz', label: 'Quiz me', hint: 'Paste notes → get questions' },
  { id: 'flashcards', label: 'Flashcards', hint: 'Paste notes → get card pairs' },
  { id: 'summary', label: 'Summarize', hint: 'Condense long material' },
  { id: 'essay', label: 'Essay feedback', hint: 'Structure and clarity review' },
  { id: 'code', label: 'Code help', hint: 'Debugging and concepts' },
]

const conversations = () => table<AIConversation>('ai_conversations')
const messages = () => table<AIMessage>('ai_messages')

/** One turn of the conversation, optionally carrying files for that message. */
export interface CoachTurn {
  role: 'user' | 'assistant'
  content: string
  /** Base64 files sent with this turn; never persisted to `ai_messages`. */
  files?: Array<{ name: string; mimeType: string; data: string }>
}

export const aiService = {
  async listConversations(userId: string): Promise<AIConversation[]> {
    return conversations().list({
      filters: byUser(userId),
      orderBy: { column: 'updated_at', ascending: false },
    })
  },

  async createConversation(userId: string, mode: CoachMode): Promise<AIConversation> {
    return conversations().insert({
      user_id: userId,
      title: 'New conversation',
      mode,
    })
  },

  async renameConversation(id: string, title: string): Promise<void> {
    await conversations().update(id, { title })
  },

  /** Switching mode mid-thread retargets the conversation, so it reopens there. */
  async setConversationMode(id: string, mode: CoachMode): Promise<void> {
    await conversations().update(id, { mode })
  },

  async removeConversation(id: string): Promise<void> {
    await conversations().remove(id)
  },

  async listMessages(userId: string, conversationId: string): Promise<AIMessage[]> {
    return messages().list({
      filters: byUser(userId, [{ column: 'conversation_id', op: 'eq', value: conversationId }]),
      orderBy: { column: 'created_at', ascending: true },
    })
  },

  async appendMessage(
    userId: string,
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AIMessage> {
    return messages().insert({
      user_id: userId,
      conversation_id: conversationId,
      role,
      content,
    })
  },

  /**
   * Get the assistant reply. With Supabase configured this calls the
   * `ai-chat` Edge Function (which holds the Gemini key server-side and
   * enforces plan limits). In local demo mode a deterministic, rule-based
   * coach answers so the feature still works offline.
   */
  async getReply(input: {
    mode: CoachMode
    history: CoachTurn[]
    studyContext: string
  }): Promise<string> {
    if (supabase) {
      const body = await callFunction<{ reply: string }>('ai-chat', {
        mode: input.mode,
        messages: input.history.slice(-20),
        studyContext: input.studyContext,
      })
      return body.reply
    }

    const lastUser = [...input.history].reverse().find((message) => message.role === 'user')
    if (lastUser?.files?.length) {
      return `The offline coach can't read attachments — it has no model behind it. Connect Supabase and set a Gemini key to send files.${OFFLINE_NOTE}`
    }
    return offlineCoach(input.mode, lastUser?.content ?? '', input.studyContext)
  },

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
async function callFunction<T>(name: string, payload: unknown): Promise<T> {
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

// ── Offline (rule-based) coach ─────────────────────────────────────────────

const OFFLINE_NOTE =
  '\n\n---\n*Offline coach (rule-based). Connect Supabase + a Gemini key to unlock the full AI experience.*'

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(' ').length >= 5)
}

function clozeQuestion(sentence: string): { question: string; answer: string } | null {
  const words = sentence.split(' ')
  const candidates = words
    .map((word, index) => ({ word: word.replace(/[^\p{L}\p{N}-]/gu, ''), index }))
    .filter(({ word }) => word.length >= 6)
    .sort((a, b) => b.word.length - a.word.length)
  // Blanking the opening word leaves a stem like "_____ the process by which…",
  // which reads as broken grammar rather than a question. Prefer a word further
  // in, and only fall back to the first if it is the sole candidate.
  const target = candidates.find(({ index }) => index > 0) ?? candidates[0]
  if (!target) return null
  const blanked = words
    .map((word, index) => (index === target.index ? '_____' : word))
    .join(' ')
  return { question: blanked, answer: target.word }
}

function offlineCoach(mode: CoachMode, message: string, studyContext: string): string {
  // Quiz, flashcards, summary and essay transform material the student
  // supplied. They must NEVER fall back to the workload snapshot: padding a
  // short message with it produced questions like "Today is _____ 4 August"
  // — quizzing the student on their own timetable. Only `coach` reads context.
  const material = message

  switch (mode) {
    case 'quiz': {
      const pool = sentences(material)
      const questions = pool
        .map(clozeQuestion)
        .filter((q): q is NonNullable<typeof q> => q !== null)
        .slice(0, 5)
      if (questions.length === 0) {
        return `Paste a chunk of your notes (a few sentences at least) and I'll turn them into fill-in-the-blank questions.${OFFLINE_NOTE}`
      }
      const list = questions
        .map((q, i) => `**Q${i + 1}.** ${q.question}`)
        .join('\n\n')
      const answers = questions.map((q, i) => `${i + 1}. ${q.answer}`).join('\n')
      // Markdown only. Replies render through react-markdown without raw-HTML
      // support (enabling it would let model output inject markup), so a
      // <details> block leaked its tags as literal text AND showed the answers
      // straight away — the opposite of a self-test.
      return `Here's a quick self-test from your material:\n\n${list}\n\n---\n\n**Answers** — cover this part until you've attempted all ${questions.length}:\n\n${answers}${OFFLINE_NOTE}`
    }

    case 'flashcards': {
      const lines = message
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const pairs = lines
        .map((line) => {
          const split = line.split(/[:—–-]\s+/)
          return split.length >= 2 ? { front: split[0]!, back: split.slice(1).join(' ') } : null
        })
        .filter((pair): pair is NonNullable<typeof pair> => pair !== null)
        .slice(0, 10)
      if (pairs.length === 0) {
        const fromSentences = sentences(material)
          .map(clozeQuestion)
          .filter((q): q is NonNullable<typeof q> => q !== null)
          .slice(0, 6)
        if (fromSentences.length === 0) {
          return `Paste notes as "term: definition" lines (or a paragraph) and I'll build flashcards.${OFFLINE_NOTE}`
        }
        return `Flashcards from your notes:\n\n${fromSentences
          .map((q, i) => `**Card ${i + 1}**\nFront: ${q.question}\nBack: ${q.answer}`)
          .join('\n\n')}${OFFLINE_NOTE}`
      }
      return `Flashcards from your notes:\n\n${pairs
        .map((pair, i) => `**Card ${i + 1}**\nFront: ${pair.front}\nBack: ${pair.back}`)
        .join('\n\n')}${OFFLINE_NOTE}`
    }

    case 'summary': {
      const paragraphs = message.split(/\n{2,}/).filter((p) => p.trim().length > 40)
      if (paragraphs.length === 0) {
        return `Paste the material you want condensed and I'll pull out the key sentences.${OFFLINE_NOTE}`
      }
      const keyPoints = paragraphs
        .map((paragraph) => sentences(paragraph)[0])
        .filter((sentence): sentence is string => Boolean(sentence))
        .slice(0, 8)
      return `**Key points**\n\n${keyPoints.map((point) => `- ${point}`).join('\n')}${OFFLINE_NOTE}`
    }

    case 'essay': {
      const wordCount = message.split(/\s+/).filter(Boolean).length
      if (wordCount < 50) {
        return `Paste your draft (or a section of it) and I'll review the structure.${OFFLINE_NOTE}`
      }
      const paragraphCount = message.split(/\n{2,}/).filter((p) => p.trim()).length
      return [
        `**Draft stats:** ${wordCount} words · ${paragraphCount} paragraph${paragraphCount === 1 ? '' : 's'}.`,
        '',
        '**Structure checklist — verify each one against your draft:**',
        '- Does your first paragraph state a clear, arguable thesis in one sentence?',
        '- Does each paragraph open with a claim that supports the thesis (not a fact dump)?',
        '- Is every quote or statistic followed by *your* interpretation?',
        '- Do transitions show logic (however / therefore / building on this) rather than sequence (also / another point)?',
        '- Does the conclusion answer "so what?" instead of repeating the intro?',
        '',
        'Fix the weakest item above first — structural edits beat sentence polish.',
      ].join('\n') + OFFLINE_NOTE
    }

    case 'code': {
      return [
        "Let's debug systematically:",
        '',
        '1. **Reproduce** — pin down the exact input that fails.',
        '2. **Read the error aloud** — the answer is usually in the first line + last stack frame you own.',
        '3. **Isolate** — comment out half the logic; does it still fail? Binary-search the cause.',
        '4. **Inspect state** — print/log the actual values right before the failure; never trust assumptions.',
        '5. **Explain it to a duck** — restate what each line *should* do; the bug is where your explanation stumbles.',
        '',
        'Paste the failing snippet and the exact error message, and work through steps 2–4 against it.',
      ].join('\n') + OFFLINE_NOTE
    }

    case 'coach':
    default: {
      const contextBlock = studyContext
        ? `\n\n**Your current priorities (from your real deadlines):**\n${studyContext}`
        : ''
      return [
        "Here's how to attack this effectively:",
        '',
        '1. **Start with the highest-priority item** on your dashboard — it already accounts for deadlines, weight and effort.',
        '2. **Use 25-minute focus blocks** (Focus Center) — commit to just one block to beat procrastination.',
        '3. **Active recall > re-reading**: close the notes and write what you remember, then check.',
        '4. **Space it out**: two 1-hour sessions on different days beat one 2-hour cram.',
        contextBlock,
      ].join('\n') + OFFLINE_NOTE
    }
  }
}
