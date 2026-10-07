// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_LECTURE_PAGES } from '@/lib/demo-seed'
import { localDb } from '@/lib/local-db'
import { pagesOf, quizService } from '@/services/quiz-service'
import { localOutline } from '@/services/resource-service'

/**
 * Demo-mode generation: no AI, but the same contract as quiz-generate — a
 * quiz written from the file (or note) the student picked, aimed at the
 * topics they picked, each question citing where it came from, inside the
 * plan's monthly allowance. (vitest.config.ts blanks the Supabase env.)
 */

const USER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
type Row = { id: string; created_at: string; updated_at: string; [key: string]: unknown }

let resourceId: string
let outline: ReturnType<typeof localOutline>

beforeEach(() => {
  localStorage.clear()
  localDb.insert('profiles', { id: USER, plan: 'free', xp: 0, level: 1 })
  outline = localOutline(DEMO_LECTURE_PAGES)
  resourceId = localDb.insert<Row>('study_resources', {
    user_id: USER,
    module_id: null,
    title: 'Lecture 5 — Eigenvalues',
    kind: 'pdf',
    storage_paths: [`${USER}/lecture.pdf`],
    status: 'ready',
    page_count: DEMO_LECTURE_PAGES.length,
    outline,
    local_pages: DEMO_LECTURE_PAGES,
  }).id
})

const explanations = (quizId: string) =>
  localDb
    .list<Row>('quiz_questions', { filters: [{ column: 'quiz_id', op: 'eq', value: quizId }] })
    .map((row) => String(row.explanation))

const finished = (jobId: string) => localDb.get<Row>('quiz_generations', jobId)!

describe('pagesOf', () => {
  it.each([
    ['3–7', [3, 4, 5, 6, 7]],
    ['3-5', [3, 4, 5]],
    ['4', [4]],
    ['', []],
    ['7–3', []],
    [null, []],
  ])('reads %s as %j', (range, pages) => {
    expect(pagesOf(range)).toEqual(pages)
  })
})

describe('demo generation from a file', () => {
  it('writes a quiz from the whole file, each question citing its page', async () => {
    const jobId = await quizService.generate({ userId: USER, source: { type: 'resource', id: resourceId } })
    const job = finished(jobId)
    expect(job).toMatchObject({ status: 'done', resource_id: resourceId })
    const quiz = localDb.get<Row>('quizzes', String(job.quiz_id))!
    expect(quiz).toMatchObject({ title: 'Lecture 5 — Eigenvalues', resource_id: resourceId, kind: 'practice' })
    const cited = explanations(quiz.id).map((text) => Number(text.match(/^From page (\d+)/)?.[1]))
    expect(cited.every((page) => page >= 1 && page <= DEMO_LECTURE_PAGES.length)).toBe(true)
    // Round-robin: more than one page is covered, not just the first.
    expect(new Set(cited).size).toBeGreaterThan(1)
  })

  it('keeps to the topics the student picked', async () => {
    const topic = outline[3]!
    const allowed = pagesOf(topic.pages)
    const jobId = await quizService.generate({
      userId: USER,
      source: { type: 'resource', id: resourceId },
      topics: [topic.name],
      count: 5,
    })
    const cited = explanations(String(finished(jobId).quiz_id)).map((text) => Number(text.match(/^From page (\d+)/)?.[1]))
    expect(cited.length).toBeGreaterThan(0)
    expect(cited.every((page) => allowed.includes(page))).toBe(true)
  })

  it('makes a boss quiz when asked, and no more questions than asked', async () => {
    const jobId = await quizService.generate({ userId: USER, source: { type: 'resource', id: resourceId }, kind: 'boss', count: 5 })
    const quiz = localDb.get<Row>('quizzes', String(finished(jobId).quiz_id))!
    expect(quiz.kind).toBe('boss')
    expect(Number(quiz.question_count)).toBeLessThanOrEqual(5)
  })

  it("refuses someone else's file", async () => {
    const theirs = localDb.insert<Row>('study_resources', { user_id: OTHER, title: 'Theirs', outline: [], local_pages: DEMO_LECTURE_PAGES }).id
    await expect(quizService.generate({ userId: USER, source: { type: 'resource', id: theirs } })).rejects.toThrow(/could not be found/)
  })
})

describe('demo generation from a note', () => {
  it('cites the note', async () => {
    const note = localDb.insert<Row>('notes', { user_id: USER, title: 'Eigen notes', content_md: DEMO_LECTURE_PAGES.join('\n\n'), module_id: null })
    const jobId = await quizService.generate({ userId: USER, source: { type: 'note', id: note.id } })
    const job = finished(jobId)
    expect(job).toMatchObject({ status: 'done', note_id: note.id })
    expect(explanations(String(job.quiz_id)).every((text) => text.startsWith('From your note'))).toBe(true)
  })

  it('says when a note is too short', async () => {
    const note = localDb.insert<Row>('notes', { user_id: USER, title: 'Tiny', content_md: 'Too short.', module_id: null })
    await expect(quizService.generate({ userId: USER, source: { type: 'note', id: note.id } })).rejects.toThrow(/too short/)
  })
})

describe('the allowance, in demo mode too', () => {
  it('stops a Free account at three a month, and counts them', async () => {
    for (let i = 0; i < 3; i += 1) {
      await quizService.generate({ userId: USER, source: { type: 'resource', id: resourceId } })
    }
    expect(await quizService.usedThisMonth(USER)).toBe(3)
    await expect(quizService.generate({ userId: USER, source: { type: 'resource', id: resourceId } })).rejects.toThrow(
      /used your 3 AI quizzes/,
    )
  })

  it("doesn't count last month's", async () => {
    for (let i = 0; i < 3; i += 1) {
      localDb.insert('ai_usage', { user_id: USER, kind: 'quiz', charged: true, created_at: '2020-01-15T10:00:00.000Z' })
    }
    expect(await quizService.usedThisMonth(USER)).toBe(0)
  })

  it("doesn't count a quiz that failed and was refunded", async () => {
    localDb.insert('ai_usage', { user_id: USER, kind: 'quiz', charged: false })
    expect(await quizService.usedThisMonth(USER)).toBe(0)
  })
})
