/**
 * Grade a quiz attempt — Supabase Edge Function.
 *
 * This is the only place in StudentOS that can write a score or grant quiz XP.
 * `quiz_attempts`, `quiz_answers` and `xp_ledger` have no insert policy at all
 * (migration 00014), so RLS denies every other writer, including the student's
 * own authenticated client. That is what makes XP mean something: it cannot be
 * POSTed, only earned.
 *
 * Available on every plan. Generating a quiz with AI is the Pro feature; being
 * marked is not.
 *
 * A graded quiz also counts toward the daily streak, through `touch_streak`
 * (migration 00016), which advances it on the student's own calendar.
 *
 * Deploy: `supabase functions deploy quiz-grade`
 */
import { requireCaller, serviceRoleClient } from '../_shared/auth.ts'
import { corsPreflight, jsonResponse } from '../_shared/cors.ts'

/** Mirrors QUIZ_XP in src/services/gamification-service.ts. */
const XP_PER_CORRECT = 8
const XP_QUIZ_COMPLETED = 15
const XP_BOSS_DEFEATED = 120
/** A boss is only "defeated" at this accuracy; below it, it is just an attempt. */
const BOSS_PASS_RATIO = 0.8

interface SubmittedAnswer {
  questionId: string
  /** Omitted or null when the question was skipped. */
  chosenIndex?: number | null
}

interface GradePayload {
  quizId?: string
  answers?: SubmittedAnswer[]
  durationSeconds?: number
}

interface QuestionRow {
  id: string
  correct_index: number
  explanation: string | null
}

/** A row from touch_streak(). */
interface StreakRow {
  streak: number
  best_streak: number
  freezes: number
  /** yyyy-MM-dd, the student's local day. */
  active_on: string
  used_freeze: boolean
  earned_freeze: boolean
  changed: boolean
}

/** The client's StreakAdvance (src/lib/streak.ts), so it can announce a freeze. */
function streakAdvance(row: StreakRow | undefined) {
  if (!row?.changed) return null
  return {
    patch: {
      current_streak: row.streak,
      longest_streak: row.best_streak,
      last_active_date: row.active_on,
      streak_freezes: row.freezes,
    },
    usedFreeze: row.used_freeze,
    earnedFreeze: row.earned_freeze,
  }
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const { caller, response } = await requireCaller(req)
  if (!caller) return response

  let payload: GradePayload
  try {
    payload = (await req.json()) as GradePayload
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const quizId = typeof payload.quizId === 'string' ? payload.quizId : ''
  const submitted = Array.isArray(payload.answers) ? payload.answers : []
  if (!quizId) return jsonResponse({ error: 'No quiz specified' }, 400)

  const db = serviceRoleClient()

  // Ownership is checked here, not by RLS: this client bypasses RLS entirely,
  // so the caller's id from the verified JWT is the only thing that may decide
  // which quiz is readable.
  const { data: quiz, error: quizError } = await db
    .from('quizzes')
    .select('id, user_id, kind')
    .eq('id', quizId)
    .maybeSingle()

  if (quizError) {
    console.error('[quiz-grade] quiz lookup failed', quizError)
    return jsonResponse({ error: 'Could not load that quiz.' }, 502)
  }
  if (!quiz || quiz.user_id !== caller.userId) {
    // Same answer for "missing" and "someone else's", so this cannot be used to
    // discover which quiz ids exist.
    return jsonResponse({ error: 'Quiz not found' }, 404)
  }

  const { data: questions, error: questionsError } = await db
    .from('quiz_questions')
    .select('id, correct_index, explanation')
    .eq('quiz_id', quizId)
    .order('ordinal', { ascending: true })

  if (questionsError || !questions || questions.length === 0) {
    console.error('[quiz-grade] question load failed', questionsError)
    return jsonResponse({ error: 'That quiz has no questions.' }, 422)
  }

  const rows = questions as QuestionRow[]
  const chosenByQuestion = new Map<string, number | null>()
  for (const answer of submitted) {
    if (typeof answer?.questionId !== 'string') continue
    const chosen = answer.chosenIndex
    chosenByQuestion.set(
      answer.questionId,
      typeof chosen === 'number' && Number.isInteger(chosen) && chosen >= 0 ? chosen : null,
    )
  }

  // Grade against every question in the quiz, not against what was submitted —
  // otherwise omitting the questions you got wrong would score 100%.
  const graded = rows.map((question) => {
    const chosen = chosenByQuestion.get(question.id) ?? null
    return {
      questionId: question.id,
      chosenIndex: chosen,
      correctIndex: question.correct_index,
      correct: chosen !== null && chosen === question.correct_index,
      explanation: question.explanation,
    }
  })

  const total = graded.length
  const score = graded.filter((answer) => answer.correct).length
  const isBoss = quiz.kind === 'boss'
  const defeatedBoss = isBoss && total > 0 && score / total >= BOSS_PASS_RATIO

  const earned =
    score * XP_PER_CORRECT + XP_QUIZ_COMPLETED + (defeatedBoss ? XP_BOSS_DEFEATED : 0)

  const duration = Number(payload.durationSeconds)
  const durationSeconds =
    Number.isFinite(duration) && duration > 0 ? Math.min(Math.round(duration), 86_400) : 0

  // Award first, then record what was actually awarded on the attempt.
  // `award_xp` is idempotent on (user, event, quiz): the first pass pays, later
  // ones return 0 and the attempt is stored with xp_awarded = 0. Re-revising a
  // quiz stays free to do and impossible to farm.
  const { data: awardRows, error: awardError } = await db.rpc('award_xp', {
    p_user_id: caller.userId,
    p_event: 'quiz_completed',
    p_source_id: quizId,
    p_amount: earned,
  })

  if (awardError) {
    console.error('[quiz-grade] award_xp failed', awardError)
    return jsonResponse({ error: 'Could not record your score.' }, 502)
  }

  const award = (Array.isArray(awardRows) ? awardRows[0] : awardRows) as
    | { awarded: number; total_xp: number; new_level: number }
    | undefined
  const xpAwarded = award?.awarded ?? 0

  const { data: attempt, error: attemptError } = await db
    .from('quiz_attempts')
    .insert({
      user_id: caller.userId,
      quiz_id: quizId,
      score,
      total,
      duration_seconds: durationSeconds,
      xp_awarded: xpAwarded,
    })
    .select('id')
    .single()

  if (attemptError || !attempt) {
    console.error('[quiz-grade] attempt insert failed', attemptError)
    return jsonResponse({ error: 'Could not record your score.' }, 502)
  }

  const { error: answersError } = await db.from('quiz_answers').insert(
    graded.map((answer) => ({
      attempt_id: attempt.id,
      question_id: answer.questionId,
      chosen_index: answer.chosenIndex,
      correct: answer.correct,
    })),
  )
  // The attempt and its score are already saved; a failed per-answer write
  // costs the review breakdown, not the result, so it is logged and not raised.
  if (answersError) console.error('[quiz-grade] answer insert failed', answersError)

  // Answering a quiz is studying, so it keeps the streak. Done after the score
  // is safe, and never fatal for the same reason as above: a streak that did
  // not move is a smaller loss than a grade that did not record.
  const { data: streakRows, error: streakError } = await db.rpc('touch_streak', {
    p_user_id: caller.userId,
  })
  if (streakError) console.error('[quiz-grade] touch_streak failed', streakError)
  const streak = streakError
    ? null
    : streakAdvance((Array.isArray(streakRows) ? streakRows[0] : streakRows) as StreakRow | undefined)

  return jsonResponse({
    attemptId: attempt.id,
    score,
    total,
    xpAwarded,
    totalXp: award?.total_xp ?? null,
    level: award?.new_level ?? null,
    defeatedBoss,
    // Only now, after grading, does the client learn the answer key.
    answers: graded,
    streak,
  })
})
