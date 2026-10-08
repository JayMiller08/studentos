import { clozeQuestion, sentences } from '@/services/cloze'
import { PLANS } from '@/lib/plans'
import { supabase } from '@/lib/supabase'
import { callFunction } from '@/services/ai-service'
import { byUser, table } from '@/services/db'
import { awardXpLocally, QUIZ_XP, touchStreakLocally } from '@/services/gamification-service'
import type {
  AiUsage,
  GradedAnswer,
  Note,
  Profile,
  Quiz,
  QuizAttempt,
  QuizDifficulty,
  QuizGeneration,
  QuizKind,
  QuizQuestion,
  QuizResult,
  StudyResource,
} from '@/types/models'

/**
 * Quizzes: the only XP in StudentOS that is earned rather than reported.
 *
 * Two things live behind an Edge Function and cannot move to the client:
 * generating a quiz (the Gemini key is server-side) and grading one (the answer
 * key is server-side, and `quiz_attempts` has no insert policy). Demo mode has
 * neither function, so it has its own honest local versions below — they prove
 * the loop works without pretending to be secure, because a local sandbox with
 * no backend has nothing to secure against.
 */

const quizzes = () => table<Quiz>('quizzes')
const attempts = () => table<QuizAttempt>('quiz_attempts')
/**
 * Read through the view, never the table.
 *
 * In demo mode there is no view and no RLS, so this falls back to the local
 * table and the answers are technically reachable — as is every other byte in
 * localStorage. Nothing is gained by hiding them from a student's own device.
 */
const questions = () =>
  supabase
    ? table<QuizQuestion>('quiz_questions_public')
    : table<QuizQuestion>('quiz_questions')

/** How many questions one page or note of demo material can sustain. */
const DEMO_QUESTION_CAP = 8
const DEMO_OPTIONS = 4

/** The question counts a student can ask for — quiz-generate clamps to the same. */
export const QUIZ_LENGTHS = [5, 10, 15, 20] as const
export const DEFAULT_QUIZ_LENGTH = 10

/** Midnight UTC on the 1st: when the database's monthly allowance resets. */
export function allowanceMonthStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

// ── Pure helpers ────────────────────────────────────────────────────────────

export function scoreOf(attempt: Pick<QuizAttempt, 'score' | 'total'>): number {
  if (attempt.total <= 0) return 0
  return Math.round((attempt.score / attempt.total) * 100)
}

export function gradeLetter(percent: number): string {
  if (percent >= 80) return 'A'
  if (percent >= 70) return 'B'
  if (percent >= 60) return 'C'
  if (percent >= 50) return 'D'
  return 'F'
}

/** True when this attempt clears the bar a boss quiz sets. */
export function defeatedBoss(kind: QuizKind, score: number, total: number): boolean {
  return kind === 'boss' && total > 0 && score / total >= QUIZ_XP.bossPassRatio
}

/**
 * The quiz a student has least recently attempted — what to revise next.
 * Never-attempted quizzes come first, then oldest attempt.
 */
export function nextDueQuiz(list: Quiz[], attemptList: QuizAttempt[]): Quiz | null {
  if (list.length === 0) return null
  const lastAttempt = new Map<string, string>()
  for (const attempt of attemptList) {
    const previous = lastAttempt.get(attempt.quiz_id)
    if (!previous || attempt.submitted_at > previous) {
      lastAttempt.set(attempt.quiz_id, attempt.submitted_at)
    }
  }
  return [...list].sort((a, b) => {
    const left = lastAttempt.get(a.id) ?? ''
    const right = lastAttempt.get(b.id) ?? ''
    if (left === right) return a.created_at.localeCompare(b.created_at)
    return left.localeCompare(right)
  })[0]!
}

/** XP an attempt would pay, for the result screen's breakdown. */
export function xpBreakdown(score: number, total: number, kind: QuizKind) {
  const correct = score * QUIZ_XP.correct
  const boss = defeatedBoss(kind, score, total) ? QUIZ_XP.boss : 0
  return { correct, completed: QUIZ_XP.completed, boss, total: correct + QUIZ_XP.completed + boss }
}

// ── Demo-mode generation and grading ────────────────────────────────────────

/** A question built on-device, before it is stored. */
interface LocalDraft {
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
}

/**
 * Build multiple-choice questions from text, on-device.
 *
 * Distractors are other long words pulled from the same text, so they at least
 * belong to the subject; this is cloze practice, not the AI's work. Used in
 * demo mode, page by page for a file, so each question can cite its page.
 */
function localQuestions(text: string, page: number | null = null): LocalDraft[] {
  const pool = sentences(text)
  const drafts = pool
    .map((sentence) => ({ sentence, cloze: clozeQuestion(sentence) }))
    .filter((entry): entry is { sentence: string; cloze: { question: string; answer: string } } =>
      entry.cloze !== null,
    )
    .slice(0, DEMO_QUESTION_CAP)

  const vocabulary = [...new Set(drafts.map((draft) => draft.cloze.answer))]

  return drafts.flatMap((draft) => {
    const answer = draft.cloze.answer
    const distractors = vocabulary.filter((word) => word !== answer).slice(0, DEMO_OPTIONS - 1)
    // A question with nothing to choose between is not a question.
    if (distractors.length === 0) return []
    const options = [answer, ...distractors]
    // Deterministic shuffle: the correct answer must not always be first, but
    // a quiz that reorders itself between renders is worse than a predictable
    // one. Keyed off the answer so it is stable for a given note.
    const offset = answer.length % options.length
    const rotated = [...options.slice(offset), ...options.slice(0, offset)]
    const where = page === null ? 'From your note' : `From page ${page}`
    return [
      {
        prompt: draft.cloze.question,
        options: rotated,
        correctIndex: rotated.indexOf(answer),
        explanation: `${where}: "${draft.sentence.slice(0, 160)}"`,
      },
    ]
  })
}

/** The pages a topic covers, from its "3–7" range. Empty when unreadable. */
export function pagesOf(range: string | null | undefined): number[] {
  const match = (range ?? '').match(/(\d+)\s*(?:[–-]\s*(\d+))?/)
  if (!match) return []
  const first = Number(match[1])
  const last = Number(match[2] ?? match[1])
  if (!(first > 0) || last < first || last - first > 500) return []
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

/** Grade locally, for demo mode. Reads the answer key straight out of localStorage. */
async function gradeLocally(
  userId: string,
  quiz: Quiz,
  chosen: Map<string, number | null>,
): Promise<QuizResult> {
  const rows = await table<QuizQuestion & { correct_index: number; explanation: string | null }>(
    'quiz_questions',
  ).list({ filters: [{ column: 'quiz_id', op: 'eq', value: quiz.id }], orderBy: { column: 'ordinal' } })

  const answers: GradedAnswer[] = rows.map((row) => {
    const pick = chosen.get(row.id) ?? null
    return {
      questionId: row.id,
      chosenIndex: pick,
      correctIndex: row.correct_index,
      correct: pick !== null && pick === row.correct_index,
      explanation: row.explanation,
    }
  })

  const total = answers.length
  const score = answers.filter((answer) => answer.correct).length

  // Through the local ledger, keyed on the quiz exactly as quiz-grade keys it:
  // the first pass pays, re-takes for revision pay nothing. The figures come
  // back either way — the result screen shows the student's level, and "—" on
  // a re-take reads as though they had lost it.
  const award = await awardXpLocally(userId, 'quiz_completed', quiz.id, xpBreakdown(score, total, quiz.kind).total)

  const attempt = await attempts().insert({
    user_id: userId,
    quiz_id: quiz.id,
    score,
    total,
    duration_seconds: 0,
    xp_awarded: award.awarded,
    submitted_at: new Date().toISOString(),
  })

  return {
    attemptId: attempt.id,
    score,
    total,
    xpAwarded: award.awarded,
    totalXp: award.totalXp,
    level: award.level,
    defeatedBoss: defeatedBoss(quiz.kind, score, total),
    answers,
    // Answering a quiz is studying, so it keeps the streak, as on the server.
    streak: await touchStreakLocally(userId),
  }
}

// ── Service ─────────────────────────────────────────────────────────────────

/** What a quiz is written from. */
export type QuizMaterial = { type: 'resource'; id: string } | { type: 'note'; id: string }

export interface GenerateQuizInput {
  userId: string
  source: QuizMaterial
  title?: string
  moduleId?: string | null
  count?: number
  difficulty?: QuizDifficulty
  /** Topic names from the file's outline; none means the whole file. */
  topics?: string[]
  kind?: QuizKind
}

/**
 * quiz-generate's twin, for demo mode: the same allowance, a job row that is
 * finished before it is returned, and questions built on-device from the
 * file's pages (or the note) the student chose.
 */
async function generateLocally(input: GenerateQuizInput): Promise<string> {
  const profile = await table<Profile>('profiles').get(input.userId)
  const allowance = PLANS[profile?.plan ?? 'free'].limits.aiQuizzesPerMonth
  if ((await quizService.usedThisMonth(input.userId)) >= allowance) {
    throw new Error(`You have used your ${allowance} AI quizzes for this month.`)
  }

  let drafts: LocalDraft[] = []
  let title = input.title?.trim() || ''
  let moduleId = input.moduleId ?? null
  let resourceId: string | null = null
  let noteId: string | null = null

  if (input.source.type === 'note') {
    const note = await table<Note>('notes').get(input.source.id)
    if (!note || note.user_id !== input.userId) throw new Error('That note could not be found.')
    noteId = note.id
    title ||= note.title || 'Quiz from your notes'
    moduleId ??= note.module_id
    drafts = localQuestions(note.content_md.replace(/!\[[^\]]*\]\([^)]*\)/g, ''))
  } else {
    const resource = (await table<StudyResource>('study_resources').get(input.source.id)) as
      | (StudyResource & { local_pages?: string[] })
      | null
    if (!resource || resource.user_id !== input.userId) throw new Error('That file could not be found.')
    resourceId = resource.id
    title ||= resource.title
    moduleId ??= resource.module_id
    const pages = resource.local_pages ?? []
    const chosen = new Set(
      (input.topics ?? []).flatMap((name) => pagesOf(resource.outline.find((topic) => topic.name === name)?.pages)),
    )
    const pageNumbers = pages.map((_, index) => index + 1).filter((page) => chosen.size === 0 || chosen.has(page))
    // Round-robin across the pages, so a long file is covered, not front-loaded.
    const perPage = pageNumbers.map((page) => localQuestions(pages[page - 1] ?? '', page))
    for (let round = 0; perPage.some((list) => list.length > round); round += 1) {
      for (const list of perPage) if (list[round]) drafts.push(list[round]!)
    }
  }

  const count = Math.min(20, Math.max(5, input.count ?? DEFAULT_QUIZ_LENGTH))
  drafts = drafts.slice(0, count)
  if (drafts.length === 0) {
    throw new Error(
      input.source.type === 'note'
        ? 'That note is too short to make a quiz from. Add a few more sentences first.'
        : "There wasn't enough text on those pages to make a quiz from.",
    )
  }

  const quiz = await quizzes().insert({
    user_id: input.userId,
    module_id: moduleId,
    title,
    source: 'note',
    kind: input.kind ?? 'practice',
    question_count: drafts.length,
    resource_id: resourceId,
    note_id: noteId,
  })
  await table<QuizQuestion>('quiz_questions').insertMany(
    drafts.map((draft, index) => ({
      quiz_id: quiz.id,
      ordinal: index,
      prompt: draft.prompt,
      options: draft.options,
      correct_index: draft.correctIndex,
      explanation: draft.explanation,
    })),
  )

  const job = await table<QuizGeneration>('quiz_generations').insert({
    user_id: input.userId,
    resource_id: resourceId,
    note_id: noteId,
    title,
    status: 'done',
    options: { count, difficulty: input.difficulty ?? 'mixed', kind: input.kind ?? 'practice', topics: input.topics ?? [] },
    quiz_id: quiz.id,
    error: null,
  })
  await table<AiUsage>('ai_usage').insert({ user_id: input.userId, kind: 'quiz', source_id: job.id, charged: true })
  return job.id
}

export const quizService = {
  list(userId: string): Promise<Quiz[]> {
    return quizzes().list({
      filters: byUser(userId),
      orderBy: { column: 'created_at', ascending: false },
    })
  },

  get(id: string): Promise<Quiz | null> {
    return quizzes().get(id)
  },

  questions(quizId: string): Promise<QuizQuestion[]> {
    return questions().list({
      filters: [{ column: 'quiz_id', op: 'eq', value: quizId }],
      orderBy: { column: 'ordinal' },
    })
  },

  attempts(userId: string, quizId?: string): Promise<QuizAttempt[]> {
    return attempts().list({
      filters: byUser(userId, quizId ? [{ column: 'quiz_id', op: 'eq', value: quizId }] : []),
      orderBy: { column: 'submitted_at', ascending: false },
    })
  },

  remove(id: string): Promise<void> {
    return quizzes().remove(id)
  },

  /**
   * Start writing a quiz from a file or a note. Resolves to the id of the
   * generation job, which the caller follows to its quiz.
   *
   * With a backend this is the `quiz-generate` function, which writes and
   * checks the questions in the background and inserts them server-side, so
   * the answers never reach the browser. Without one, demo mode builds the
   * quiz on-device and the job is already done.
   */
  async generate(input: GenerateQuizInput): Promise<string> {
    if (!supabase) return generateLocally(input)
    const body = await callFunction<{ generationId: string }>('quiz-generate', {
      ...(input.source.type === 'resource' ? { resourceId: input.source.id } : { noteId: input.source.id }),
      title: input.title,
      moduleId: input.moduleId ?? null,
      count: input.count,
      difficulty: input.difficulty ?? 'mixed',
      topics: input.topics ?? [],
      kind: input.kind ?? 'practice',
    })
    return body.generationId
  },

  /** Recent generation jobs, newest first: what is being written, and what failed. */
  generations(userId: string): Promise<QuizGeneration[]> {
    return table<QuizGeneration>('quiz_generations').list({
      filters: byUser(userId),
      orderBy: { column: 'created_at', ascending: false },
      limit: 10,
    })
  },

  /** AI quizzes charged this month, against the plan's allowance. */
  async usedThisMonth(userId: string): Promise<number> {
    const rows = await table<AiUsage>('ai_usage').list({
      filters: byUser(userId, [
        { column: 'kind', op: 'eq', value: 'quiz' },
        { column: 'created_at', op: 'gte', value: allowanceMonthStart() },
      ]),
    })
    return rows.filter((row) => row.charged).length
  },

  /**
   * Submit an attempt and get it marked.
   *
   * `chosen` maps question id to the selected option index; a question the
   * student skipped is simply absent. The server grades every question in the
   * quiz regardless, so omitting the hard ones cannot raise the score.
   */
  async grade(
    userId: string,
    quiz: Quiz,
    chosen: Map<string, number | null>,
    durationSeconds: number,
  ): Promise<QuizResult> {
    if (!supabase) return gradeLocally(userId, quiz, chosen)

    return callFunction<QuizResult>('quiz-grade', {
      quizId: quiz.id,
      durationSeconds: Math.round(durationSeconds),
      answers: [...chosen.entries()].map(([questionId, chosenIndex]) => ({
        questionId,
        chosenIndex,
      })),
    })
  },
}
