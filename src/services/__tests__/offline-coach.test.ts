import { describe, expect, it, vi } from 'vitest'

/**
 * The offline coach is what demo mode answers with — the shop window for
 * anyone trying StudentOS before connecting Supabase. These lock in the
 * behaviour of each mode; without a Gemini key this is the only AI a visitor
 * ever sees.
 *
 * `supabase` is forced to null so the offline branch is exercised regardless
 * of the developer's .env. Without this the suite passes in demo mode and
 * fails the moment real credentials are present, which makes it worthless as
 * a check.
 */
vi.mock('@/lib/supabase', () => ({ supabase: null }))

const { aiService, COACH_MODES } = await import('@/services/ai-service')
type CoachMode = Parameters<typeof aiService.getReply>[0]['mode']

const NOTES = `Photosynthesis converts light energy into chemical energy stored in glucose.
Chlorophyll absorbs light inside the thylakoid membrane of the chloroplast.
The Calvin cycle fixes carbon dioxide into sugar within the stroma.`

/** A realistic workload snapshot, as buildStudyContext would produce. */
const CONTEXT = `Today is Tuesday, 4 August 2026.

ACTIVE ASSIGNMENTS:
- "Graph algorithms practical" [CSC2001] — due in 2d, 45% done, worth 15% of the grade, ~3h left`

function reply(mode: CoachMode, message: string, context = CONTEXT) {
  return aiService.getReply({ mode, history: [{ role: 'user', content: message }], studyContext: context })
}

describe('every advertised mode answers', () => {
  it('has a prompt path for each mode the UI offers', async () => {
    // A mode chip with no handler would silently fall through to coach advice.
    for (const mode of COACH_MODES) {
      const text = await reply(mode.id, NOTES)
      expect(text.length, `${mode.id} produced nothing`).toBeGreaterThan(40)
    }
  })

  it('gives each mode a distinct answer rather than one generic reply', async () => {
    const answers = await Promise.all(
      (['quiz', 'flashcards', 'summary', 'coach'] as CoachMode[]).map((m) => reply(m, NOTES)),
    )
    expect(new Set(answers).size).toBe(answers.length)
  })
})

describe('content modes never quiz the student on their own dashboard', () => {
  // Regression: a short message used to be padded with the workload snapshot,
  // producing questions like "Today is _____ 4 August".
  const contentModes: CoachMode[] = ['quiz', 'flashcards', 'summary', 'essay']

  it.each(contentModes)('%s ignores the study context entirely', async (mode) => {
    const short = 'Mitosis splits one cell into two identical daughter cells.'
    const text = await reply(mode, short)
    expect(text).not.toContain('Graph algorithms practical')
    expect(text).not.toContain('CSC2001')
    expect(text).not.toMatch(/Today is/)
  })

  it('asks for material instead of inventing it from context', async () => {
    const text = await reply('quiz', 'quiz me')
    expect(text).toMatch(/paste/i)
    expect(text).not.toContain('CSC2001')
  })
})

describe('quiz', () => {
  it('produces fill-in-the-blank questions with an answer key', async () => {
    const text = await reply('quiz', NOTES)
    expect(text).toContain('_____')
    expect(text).toMatch(/\*\*Q1\.\*\*/)
    expect(text).toContain('Answers')
  })

  it('emits markdown only, never raw HTML', async () => {
    // Replies render through react-markdown without raw-HTML support, so a
    // <details> block leaked its tags as text and revealed the answers.
    const text = await reply('quiz', NOTES)
    expect(text).not.toContain('<details>')
    expect(text).not.toMatch(/<\/?[a-z]+>/i)
  })

  it('does not blank the opening word, which breaks the sentence', async () => {
    const text = await reply('quiz', NOTES)
    const questions = text.split('\n').filter((line) => line.includes('_____'))
    expect(questions.length).toBeGreaterThan(0)
    for (const question of questions) {
      expect(question, `stem starts with a blank: ${question}`).not.toMatch(/\*\*Q\d\.\*\* _____/)
    }
  })
})

describe('flashcards', () => {
  it('turns "term: definition" lines into front/back pairs', async () => {
    const text = await reply('flashcards', 'Mitosis: division producing two identical cells.\nMeiosis: division producing four gametes.')
    expect(text).toContain('Front: Mitosis')
    expect(text).toContain('Back:')
  })

  it('falls back to prose when there are no term/definition lines', async () => {
    const text = await reply('flashcards', NOTES)
    expect(text).toMatch(/Card 1/)
  })
})

describe('summary', () => {
  it('pulls key points out of longer material', async () => {
    const text = await reply('summary', `${NOTES}\n\nCellular respiration releases the energy stored in glucose through glycolysis and the electron transport chain within the mitochondria.`)
    expect(text).toContain('Key points')
    expect(text).toMatch(/^- /m)
  })

  it('asks for material when given none', async () => {
    expect(await reply('summary', 'summarise')).toMatch(/paste/i)
  })
})

describe('essay', () => {
  it('reports draft stats and a structural checklist', async () => {
    const draft = 'The industrial revolution reshaped European society in profound ways. '.repeat(10)
    const text = await reply('essay', draft)
    expect(text).toMatch(/\d+ words/)
    expect(text).toMatch(/thesis/i)
  })

  it('asks for a longer draft when given a fragment', async () => {
    expect(await reply('essay', 'check my essay')).toMatch(/paste/i)
  })
})

describe('coach', () => {
  it('is the one mode that draws on the workload snapshot', async () => {
    const text = await reply('coach', 'What should I work on?')
    expect(text).toContain('Graph algorithms practical')
  })

  it('still answers when there is no context yet', async () => {
    const text = await reply('coach', 'What should I work on?', '')
    expect(text.length).toBeGreaterThan(40)
    expect(text).not.toContain('undefined')
  })
})

describe('the offline label', () => {
  it('tells the student this is not the real model', async () => {
    // Otherwise a demo visitor judges the product by the rule-based fallback.
    for (const mode of COACH_MODES) {
      expect(await reply(mode.id, NOTES)).toMatch(/Offline coach/)
    }
  })
})
