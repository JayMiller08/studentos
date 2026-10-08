/**
 * Write a quiz from a student's own material — Supabase Edge Function.
 *
 * The material is one of: a file from their study library (a lecture PDF or
 * photos of notes), one of their notes, or text. The quiz is tailored to it:
 * every question is answerable from that material, cites the page it comes
 * from, and can be aimed at chosen topics, a length and a difficulty.
 *
 * The work takes tens of seconds, so this answers at once with the id of a
 * `quiz_generations` row and finishes in the background (see background.ts);
 * the student watches the row move through reading → writing → checking →
 * done. Writing is two AI calls: one writes the questions, a second answers
 * them blind from the same material and only the questions where both agree
 * are kept (quiz-writer.ts).
 *
 * The questions are inserted here, with the service role. The answer key
 * never touches the browser: the runner reads `quiz_questions_public`, which
 * projects `correct_index` away, and no client may write a question (00016).
 *
 * Every plan may generate, within a monthly allowance kept by the database
 * (`begin_quiz_generation`, migration 00018): Free 3, Pro 40, Elite 150.
 *
 * Deploy:  `supabase functions deploy quiz-generate`
 * Secrets: `supabase secrets set GEMINI_API_KEY=...`
 */
import { requireCaller, serviceRoleClient } from '../_shared/auth.ts'
import { inBackground } from '../_shared/background.ts'
import { corsPreflight, jsonResponse } from '../_shared/cors.ts'
import { GeminiError, isGeminiConfigured } from '../_shared/gemini.ts'
import { loadResource, MaterialError, RESOURCE_COLUMNS, type ResourceRow } from '../_shared/material.ts'
import {
  checkQuestions,
  type Difficulty,
  explanationWithPage,
  LIMITS,
  type Material,
  type QuizKind,
  type QuizRequest,
  writeQuestions,
} from '../_shared/quiz-writer.ts'

/** A note's worth of text; beyond this the model skims. */
const MAX_TEXT_CHARS = 60_000
const MIN_TEXT_CHARS = 120

interface GeneratePayload {
  resourceId?: unknown
  noteId?: unknown
  /** Raw text, for callers without a note. */
  text?: unknown
  title?: unknown
  moduleId?: unknown
  count?: unknown
  difficulty?: unknown
  kind?: unknown
  /** Topic names from the resource's outline. */
  topics?: unknown
}

type ServiceClient = ReturnType<typeof serviceRoleClient>

interface NoteRow {
  id: string
  title: string
  content_md: string
  module_id: string | null
}

interface Job {
  id: string
  userId: string
  title: string
  moduleId: string | null
  resource: ResourceRow | null
  note: NoteRow | null
  text: string | null
  request: QuizRequest
}

/** A note as plain material: Markdown kept, stored-image references dropped. */
function noteText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function readRequest(payload: GeneratePayload, resource: ResourceRow | null): QuizRequest {
  const requested = Number(payload.count)
  const count = Number.isFinite(requested)
    ? Math.min(LIMITS.maxCount, Math.max(LIMITS.minCount, Math.round(requested)))
    : LIMITS.defaultCount
  const difficulty: Difficulty =
    payload.difficulty === 'easy' || payload.difficulty === 'exam' ? payload.difficulty : 'mixed'
  const kind: QuizKind = payload.kind === 'boss' ? 'boss' : 'practice'

  // Topics are matched against the file's own outline, so what reaches the
  // prompt is text the server wrote, not whatever the request carried.
  const wanted = new Set(
    (Array.isArray(payload.topics) ? payload.topics : [])
      .filter((topic): topic is string => typeof topic === 'string')
      .map((topic) => topic.trim().toLowerCase()),
  )
  const topics = (resource?.outline ?? [])
    .filter((topic) => typeof topic.name === 'string' && wanted.has(topic.name.trim().toLowerCase()))
    .slice(0, LIMITS.maxTopics)
    .map((topic) => ({ name: topic.name!, ...(topic.pages ? { pages: topic.pages } : {}) }))

  return { count, difficulty, kind, topics, avoid: [] }
}

/** A module id from the request, kept only if it is one of the caller's modules. */
async function ownModule(db: ServiceClient, userId: string, candidate: unknown): Promise<string | null> {
  if (typeof candidate !== 'string' || !candidate) return null
  const { data } = await db.from('modules').select('id').eq('id', candidate).eq('user_id', userId).maybeSingle()
  return data ? candidate : null
}

/** Questions already asked from this material, so a second quiz is a new one. */
async function askedBefore(db: ServiceClient, job: Job): Promise<string[]> {
  const column = job.resource ? 'resource_id' : job.note ? 'note_id' : null
  const sourceId = job.resource?.id ?? job.note?.id
  if (!column || !sourceId) return []
  const { data: quizzes } = await db
    .from('quizzes')
    .select('id')
    .eq('user_id', job.userId)
    .eq(column, sourceId)
    .limit(10)
  const ids = (quizzes ?? []).map((quiz: { id: string }) => quiz.id)
  if (ids.length === 0) return []
  const { data: questions } = await db.from('quiz_questions').select('prompt').in('quiz_id', ids).limit(LIMITS.maxAvoid)
  return (questions ?? []).map((question: { prompt: string }) => question.prompt)
}

async function run(db: ServiceClient, job: Job): Promise<void> {
  const update = (patch: Record<string, unknown>) => db.from('quiz_generations').update(patch).eq('id', job.id)
  let release = async () => {}

  try {
    await update({ status: 'reading' })
    let material: Material
    if (job.resource) {
      const loaded = await loadResource(db, job.userId, job.resource)
      release = loaded.release
      material = {
        kind: loaded.kind,
        text: null,
        files: loaded.files,
        pageCount: loaded.pageCount ?? job.resource.page_count,
      }
    } else {
      material = { kind: 'text', text: job.text ?? '', files: [], pageCount: null }
    }
    job.request.avoid = await askedBefore(db, job)

    await update({ status: 'writing' })
    const written = await writeQuestions(material, job.request)
    if (written.notStudyMaterial) {
      throw new MaterialError("That doesn't look like study material. Try lecture slides, notes or a textbook page.")
    }
    if (written.questions.length === 0) {
      throw new MaterialError("There wasn't enough in that material to quiz you on. Try a fuller file or note.")
    }

    await update({ status: 'checking' })
    const questions = (await checkQuestions(material, written.questions)).slice(0, job.request.count)
    if (questions.length < LIMITS.minKept) {
      throw new MaterialError('Too few questions passed our accuracy check. Try more of the file, or fewer topics.')
    }

    // `user_id` from the verified JWT, never the payload: this client bypasses RLS.
    const { data: quiz, error: quizError } = await db
      .from('quizzes')
      .insert({
        user_id: job.userId,
        module_id: job.moduleId,
        title: job.title,
        source: 'ai',
        kind: job.request.kind,
        question_count: questions.length,
        resource_id: job.resource?.id ?? null,
        note_id: job.note?.id ?? null,
      })
      .select('id')
      .single()
    if (quizError || !quiz) {
      console.error('[quiz-generate] quiz insert failed', quizError)
      throw new Error('quiz insert failed')
    }

    const { error: questionError } = await db.from('quiz_questions').insert(
      questions.map((question, index) => ({
        quiz_id: quiz.id,
        ordinal: index,
        prompt: question.prompt,
        options: question.options,
        correct_index: question.correctIndex,
        explanation: explanationWithPage(question, material.kind),
      })),
    )
    if (questionError) {
      console.error('[quiz-generate] question insert failed', questionError)
      // Don't strand an empty quiz in the student's library.
      await db.from('quizzes').delete().eq('id', quiz.id)
      throw new Error('question insert failed')
    }

    await update({ status: 'done', quiz_id: quiz.id, error: null })
  } catch (error) {
    console.error('[quiz-generate] job failed', job.id, error)
    await update({
      status: 'failed',
      error:
        error instanceof MaterialError || error instanceof GeminiError
          ? error.message
          : 'Something went wrong writing that quiz. Try again.',
    })
    // A quiz that never arrived does not count against the month.
    await db.from('ai_usage').update({ charged: false }).eq('source_id', job.id).eq('kind', 'quiz')
  } finally {
    await release()
  }
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!isGeminiConfigured) {
    return jsonResponse({ error: 'AI is not configured on this deployment' }, 503)
  }

  const { caller, response } = await requireCaller(req)
  if (!caller) return response

  let payload: GeneratePayload
  try {
    payload = (await req.json()) as GeneratePayload
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const db = serviceRoleClient()
  let resource: ResourceRow | null = null
  let note: NoteRow | null = null
  let text: string | null = null

  // The material, looked up as the caller's own — this client can read every
  // student's files and notes, so the caller's id is the only thing that may
  // decide which are readable. "Missing" and "someone else's" look the same.
  if (typeof payload.resourceId === 'string') {
    const { data } = await db
      .from('study_resources')
      .select(RESOURCE_COLUMNS)
      .eq('id', payload.resourceId)
      .eq('user_id', caller.userId)
      .maybeSingle()
    if (!data) return jsonResponse({ error: 'That file could not be found.' }, 404)
    resource = data as ResourceRow
    if (resource.status === 'failed') {
      return jsonResponse({ error: "That file couldn't be read, so it can't be quizzed. Try uploading it again." }, 422)
    }
  } else if (typeof payload.noteId === 'string') {
    const { data } = await db
      .from('notes')
      .select('id, title, content_md, module_id')
      .eq('id', payload.noteId)
      .eq('user_id', caller.userId)
      .maybeSingle()
    if (!data) return jsonResponse({ error: 'That note could not be found.' }, 404)
    note = data as NoteRow
    text = noteText(note.content_md ?? '')
  } else {
    text = String(payload.text ?? '').trim()
  }

  if (text !== null) {
    text = text.slice(0, MAX_TEXT_CHARS)
    if (text.length < MIN_TEXT_CHARS) {
      return jsonResponse(
        { error: 'That note is too short to make a quiz from. Add a few more paragraphs first.' },
        422,
      )
    }
  }

  const request = readRequest(payload, resource)
  const title =
    (typeof payload.title === 'string' ? payload.title.trim().slice(0, 120) : '') ||
    resource?.title ||
    note?.title ||
    'Quiz from your notes'
  const moduleId = await ownModule(db, caller.userId, payload.moduleId ?? resource?.module_id ?? note?.module_id)

  // Charge for it and open the job — refused, in the student's words, once the
  // month's allowance is spent.
  const { data: jobId, error: startError } = await db.rpc('begin_quiz_generation', {
    p_user_id: caller.userId,
    p_resource_id: resource?.id ?? null,
    p_note_id: note?.id ?? null,
    p_title: title,
    p_options: {
      count: request.count,
      difficulty: request.difficulty,
      kind: request.kind,
      topics: request.topics.map((topic) => topic.name),
    },
  })
  if (startError || typeof jobId !== 'string') {
    if (startError?.code === 'AI001') return jsonResponse({ error: startError.message }, 429)
    console.error('[quiz-generate] could not start', startError)
    return jsonResponse({ error: 'Could not start writing that quiz.' }, 502)
  }

  await inBackground(() =>
    run(db, { id: jobId, userId: caller.userId, title, moduleId, resource, note, text, request }),
  )
  return jsonResponse({ generationId: jobId }, 202)
})
