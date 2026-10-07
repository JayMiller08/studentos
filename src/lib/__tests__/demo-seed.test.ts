// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_LECTURE_PAGES, ensureDemoSeed } from '@/lib/demo-seed'
import { localDb } from '@/lib/local-db'
import { BADGES, QUIZ_XP } from '@/services/gamification-service'

/**
 * The demo is the first impression, and its seed now runs on every sign-in
 * as four independently flagged blocks. These hold the two promises that
 * makes: running it again never duplicates anything, and it never overwrites
 * what a student has already done in the demo.
 */

const USER = '00000000-0000-4000-8000-000000000001'
const mine = { filters: [{ column: 'user_id', op: 'eq' as const, value: USER }] }

type Row = { id: string; created_at: string; updated_at: string; [key: string]: unknown }
const rows = (table: string, options = mine) => localDb.list<Row>(table, options)

beforeEach(() => {
  localStorage.clear()
})

describe('a fresh demo account', () => {
  it('gets a practice quiz and an untried boss quiz, with their questions', () => {
    ensureDemoSeed(USER)
    const quizzes = rows('quizzes')
    expect(quizzes.map((quiz) => quiz.kind).sort()).toEqual(['boss', 'practice'])
    for (const quiz of quizzes) {
      const questions = localDb.list<Row>('quiz_questions', {
        filters: [{ column: 'quiz_id', op: 'eq', value: quiz.id }],
      })
      expect(questions.length).toBe(quiz.question_count)
    }
  })

  it('has two passes at the practice quiz — the first paid, the re-take did not', () => {
    ensureDemoSeed(USER)
    const practice = rows('quizzes').find((quiz) => quiz.kind === 'practice')!
    const boss = rows('quizzes').find((quiz) => quiz.kind === 'boss')!
    const attempts = rows('quiz_attempts').sort((a, b) =>
      String(a.submitted_at).localeCompare(String(b.submitted_at)),
    )
    expect(attempts).toHaveLength(2)
    expect(attempts.every((attempt) => attempt.quiz_id === practice.id)).toBe(true)
    // The boss stays untried: it is the quiz that still pays, and the
    // dashboard points to it.
    expect(attempts.some((attempt) => attempt.quiz_id === boss.id)).toBe(false)
    // Paid by the real rule, so the demo never teaches a wrong number.
    expect(attempts[0]).toMatchObject({ score: 3, total: 4, xp_awarded: 3 * QUIZ_XP.correct + QUIZ_XP.completed })
    expect(attempts[1]).toMatchObject({ score: 4, total: 4, xp_awarded: 0 })
  })

  it('holds five badges, every one of them real', () => {
    ensureDemoSeed(USER)
    const badges = rows('achievements')
    const catalogue = new Set(BADGES.map((badge) => badge.id))
    expect(badges).toHaveLength(5)
    for (const badge of badges) expect(catalogue.has(String(badge.badge_id))).toBe(true)
    expect(new Set(badges.map((badge) => badge.badge_id)).size).toBe(5)
  })

  it('records the paid pass in the XP ledger, dated to when it happened', () => {
    ensureDemoSeed(USER)
    const practice = rows('quizzes').find((quiz) => quiz.kind === 'practice')!
    const firstPass = rows('quiz_attempts').sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)))[0]!
    expect(rows('xp_ledger').filter((row) => row.event === 'quiz_completed')).toEqual([
      expect.objectContaining({
        event: 'quiz_completed',
        source_id: practice.id,
        amount: 3 * QUIZ_XP.correct + QUIZ_XP.completed,
        created_at: firstPass.submitted_at,
      }),
    ])
  })

  it('so re-taking the practice quiz pays nothing, as it would on the server', async () => {
    ensureDemoSeed(USER)
    localDb.insert('profiles', { id: USER, xp: 2480, level: 5 })
    const practice = rows('quizzes').find((quiz) => quiz.kind === 'practice')!
    const { awardXpLocally } = await import('@/services/gamification-service')
    expect((await awardXpLocally(USER, 'quiz_completed', practice.id, 47)).awarded).toBe(0)
  })
})

describe('running the seed again', () => {
  it('duplicates nothing', () => {
    ensureDemoSeed(USER)
    ensureDemoSeed(USER)
    ensureDemoSeed(USER)
    expect(rows('quizzes')).toHaveLength(2)
    expect(rows('quiz_attempts')).toHaveLength(2)
    expect(rows('achievements')).toHaveLength(5)
    const keys = rows('xp_ledger').map((row) => `${row.event}|${row.source_id}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect(rows('study_resources')).toHaveLength(1)
  })

  it('back-fills an account seeded before quizzes and badges existed', () => {
    // An older demo account: the core block ran long ago, nothing else did.
    localStorage.setItem('studentos.demo.seeded', '1')
    ensureDemoSeed(USER)
    expect(rows('quizzes')).toHaveLength(2)
    expect(rows('quiz_attempts')).toHaveLength(2)
    expect(rows('achievements')).toHaveLength(5)
  })
})

describe('the study library', () => {
  it('holds one lecture, already read, filed under Linear Algebra', () => {
    ensureDemoSeed(USER)
    const [lecture, ...rest] = rows('study_resources')
    expect(rest).toHaveLength(0)
    const maths = rows('modules').find((module) => module.code === 'MAM1020')!
    expect(lecture).toMatchObject({
      title: 'Lecture 5 — Eigenvalues',
      kind: 'pdf',
      status: 'ready',
      page_count: DEMO_LECTURE_PAGES.length,
      module_id: maths.id,
    })
    // Readable by the demo quiz builder, page by page.
    expect(lecture!.local_pages).toEqual(DEMO_LECTURE_PAGES)
    expect((lecture!.outline as unknown[]).length).toBeGreaterThan(0)
    expect(String((lecture!.storage_paths as string[])[0])).toMatch(new RegExp(`^${USER}/`))
  })

  it("adds nothing to a library the student already started", () => {
    for (const flag of ['seeded', 'seeded.quiz', 'seeded.quiz-history', 'seeded.badges', 'seeded.ledger']) {
      localStorage.setItem(`studentos.demo.${flag}`, '1')
    }
    localDb.insert('study_resources', { user_id: USER, title: 'Mine', kind: 'pdf', storage_paths: [`${USER}/m.pdf`] })
    ensureDemoSeed(USER)
    expect(rows('study_resources').map((row) => row.title)).toEqual(['Mine'])
  })
})

describe('the squad', () => {
  const everyone = { filters: [] }

  it('puts the student in charge of a squad of four, with a code that works', async () => {
    ensureDemoSeed(USER)
    const [squad, ...others] = rows('squads', everyone)
    expect(others).toHaveLength(0)
    expect(String(squad!.join_code)).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
    const members = rows('squad_members', everyone)
    expect(members).toHaveLength(4)
    expect(members.filter((member) => member.role === 'owner').map((member) => member.user_id)).toEqual([USER])
    // A handle, not a name: the seed knows no name, and would not use one.
    expect(members.find((member) => member.user_id === USER)!.handle).toBe('night_owl')

    const { squadService } = await import('@/services/squad-service')
    expect(await squadService.mine(USER)).toMatchObject({ name: 'Graph Theory Crew', role: 'owner', memberCount: 4 })
    const board = await squadService.board(USER)
    expect(board.map((row) => row.handle)).toContain('night_owl')
    expect(board.filter((row) => row.isMe)).toHaveLength(1)
  })

  it('seeds it once, and not at all for a student already in a squad', () => {
    ensureDemoSeed(USER)
    ensureDemoSeed(USER)
    expect(rows('squads', everyone)).toHaveLength(1)

    localStorage.clear()
    localDb.insert('squad_members', { squad_id: 'theirs', user_id: USER, handle: 'mine_already', role: 'owner' })
    ensureDemoSeed(USER)
    expect(rows('squads', everyone)).toHaveLength(0)
  })
})

describe('the ledger back-fill', () => {
  it("records the seed's week of study as record_activity would have", () => {
    ensureDemoSeed(USER)
    const ledger = rows('xp_ledger')
    const count = (event: string) => ledger.filter((row) => row.event === event).length
    // Every seeded study session, at 0 XP: none of them was a finished pomodoro.
    expect(count('study_session')).toBe(rows('study_sessions').length)
    expect(ledger.filter((row) => row.event === 'study_session').every((row) => row.amount === 0)).toBe(true)
    expect(count('habit_completed')).toBe(rows('habit_logs').length)
    expect(count('note_created')).toBe(rows('notes').length)
    expect(count('assignment_created')).toBe(rows('assignments').length)
    // The graded assignment was submitted.
    expect(count('assignment_submitted')).toBe(1)
  })

  it('keys habit check-ins on the habit and the day, and dates them to that day', () => {
    ensureDemoSeed(USER)
    const log = rows('habit_logs')[0]!
    const row = rows('xp_ledger').find((entry) => entry.source_id === `${log.habit_id}:${log.log_date}`)!
    expect(row).toMatchObject({ event: 'habit_completed', amount: 5 })
    expect(new Date(String(row.created_at)).toDateString()).toBe(new Date(`${log.log_date}T12:00:00`).toDateString())
  })

  it('records a finished pomodoro as one, and a stopped one as study time', () => {
    for (const flag of ['seeded', 'seeded.quiz', 'seeded.quiz-history', 'seeded.badges']) {
      localStorage.setItem(`studentos.demo.${flag}`, '1')
    }
    const done = localDb.insert<Row>('study_sessions', { user_id: USER, minutes: 25, started_at: '2026-10-06T08:00:00.000Z' })
    localDb.insert('pomodoro_sessions', { user_id: USER, study_session_id: done.id, kind: 'focus', completed: true })
    const stopped = localDb.insert<Row>('study_sessions', { user_id: USER, minutes: 9, started_at: '2026-10-06T10:00:00.000Z' })
    localDb.insert('pomodoro_sessions', { user_id: USER, study_session_id: stopped.id, kind: 'focus', completed: false })
    ensureDemoSeed(USER)
    expect(rows('xp_ledger').map(({ event, source_id, amount }) => ({ event, source_id, amount }))).toEqual(
      expect.arrayContaining([
        { event: 'pomodoro_completed', source_id: done.id, amount: 5 },
        { event: 'study_session', source_id: stopped.id, amount: 0 },
      ]),
    )
  })

  it("covers a returning account's own attempts, once per quiz, at its best payout", () => {
    // Everything but the ledger ran before it existed.
    for (const flag of ['seeded', 'seeded.quiz', 'seeded.quiz-history', 'seeded.badges']) {
      localStorage.setItem(`studentos.demo.${flag}`, '1')
    }
    localDb.insert('quiz_attempts', { user_id: USER, quiz_id: 'q1', xp_awarded: 0, submitted_at: '2026-10-01T09:00:00.000Z' })
    localDb.insert('quiz_attempts', { user_id: USER, quiz_id: 'q1', xp_awarded: 31, submitted_at: '2026-09-30T09:00:00.000Z' })
    localDb.insert('quiz_attempts', { user_id: USER, quiz_id: 'q2', xp_awarded: 0, submitted_at: '2026-10-02T09:00:00.000Z' })
    ensureDemoSeed(USER)
    const ledger = rows('xp_ledger').sort((a, b) => String(a.source_id).localeCompare(String(b.source_id)))
    expect(ledger.map(({ source_id, amount, created_at }) => ({ source_id, amount, created_at }))).toEqual([
      { source_id: 'q1', amount: 31, created_at: '2026-09-30T09:00:00.000Z' },
      { source_id: 'q2', amount: 0, created_at: '2026-10-02T09:00:00.000Z' },
    ])
  })

  it('leaves a quiz the ledger already knows alone', () => {
    for (const flag of ['seeded', 'seeded.quiz', 'seeded.quiz-history', 'seeded.badges']) {
      localStorage.setItem(`studentos.demo.${flag}`, '1')
    }
    localDb.insert('quiz_attempts', { user_id: USER, quiz_id: 'q1', xp_awarded: 31, submitted_at: '2026-09-30T09:00:00.000Z' })
    localDb.insert('xp_ledger', { user_id: USER, event: 'quiz_completed', source_id: 'q1', amount: 31 })
    ensureDemoSeed(USER)
    expect(rows('xp_ledger')).toHaveLength(1)
  })
})

describe("a student's own demo history wins", () => {
  it('adds no seeded attempts when the student already has some', () => {
    localDb.insert('quiz_attempts', { user_id: USER, quiz_id: 'their-own', score: 1, total: 1, xp_awarded: 23 })
    ensureDemoSeed(USER)
    expect(rows('quiz_attempts').map((attempt) => attempt.quiz_id)).toEqual(['their-own'])
  })

  it('adds no seeded badges when the student already earned one', () => {
    localDb.insert('achievements', { user_id: USER, badge_id: 'note-taker', unlocked_at: new Date().toISOString() })
    ensureDemoSeed(USER)
    expect(rows('achievements').map((achievement) => achievement.badge_id)).toEqual(['note-taker'])
  })
})
