import { addDays, setHours, setMinutes, subDays } from 'date-fns'
import { localDb } from '@/lib/local-db'
import { randomCode } from '@/lib/squads'
import { toDateKey } from '@/lib/utils'
import { ACTIVITY_RULES, QUIZ_XP } from '@/services/gamification-service'
import { localOutline } from '@/services/resource-service'

const SEED_FLAG = 'studentos.demo.seeded'
/**
 * The quiz engine shipped after the first seed did, and that one is
 * all-or-nothing: anyone who had already opened demo mode carries
 * `studentos.demo.seeded` and would never see a quiz. A second flag back-fills
 * them without wiping the work they already have.
 */
const QUIZ_SEED_FLAG = 'studentos.demo.seeded.quiz'
/**
 * Past attempts, added once the dashboard started showing quiz scores: a demo
 * with quizzes but no history shows "—" exactly where the product's headline
 * number should be. Separate flag, same back-fill reasoning as above.
 */
const QUIZ_HISTORY_FLAG = 'studentos.demo.seeded.quiz-history'
/** The badges the showcase profile has plausibly earned (see seedBadges). */
const BADGES_FLAG = 'studentos.demo.seeded.badges'
/** The demo's history, recorded in the local XP ledger (see seedLedger). */
const LEDGER_FLAG = 'studentos.demo.seeded.ledger'
/** A lecture already in the study library (see seedLibrary). */
const LIBRARY_FLAG = 'studentos.demo.seeded.library'
/** A squad with three made-up squad mates (see seedSquad). */
const SQUAD_FLAG = 'studentos.demo.seeded.squad'

function at(date: Date, hours: number, minutes = 0): string {
  return setMinutes(setHours(date, hours), minutes).toISOString()
}

/**
 * Seeds a believable student workload the first time demo mode is entered,
 * so every screen demonstrates its real behavior instead of empty states.
 * Idempotent — guarded by a flag in localStorage.
 */
export function ensureDemoSeed(userId: string): void {
  seedCore(userId)
  seedQuizzes(userId)
  seedQuizHistory(userId)
  seedBadges(userId)
  seedLedger(userId)
  seedLibrary(userId)
  seedSquad(userId)
}

function seedCore(userId: string): void {
  if (localStorage.getItem(SEED_FLAG)) return
  localStorage.setItem(SEED_FLAG, '1')

  const now = new Date()

  const cs = localDb.insert('modules', {
    user_id: userId, semester_id: null, course_id: null,
    code: 'CSC2001', name: 'Data Structures & Algorithms', color: '#2563eb',
    credits: 12, instructor: 'Dr. Naidoo', archived: false,
  })
  const math = localDb.insert('modules', {
    user_id: userId, semester_id: null, course_id: null,
    code: 'MAM1020', name: 'Linear Algebra', color: '#16a34a',
    credits: 8, instructor: 'Prof. van Wyk', archived: false,
  })
  const stats = localDb.insert('modules', {
    user_id: userId, semester_id: null, course_id: null,
    code: 'STA1006', name: 'Statistics', color: '#d97706',
    credits: 8, instructor: 'Dr. Dlamini', archived: false,
  })

  localDb.insert('assignments', {
    user_id: userId, module_id: cs.id,
    title: 'Graph algorithms practical', description: 'Implement Dijkstra and A* with tests.',
    due_at: at(addDays(now, 2), 17), priority: 'high', weight: 15,
    estimated_minutes: 300, difficulty: 4, status: 'in_progress', progress: 45,
    grade: null, submission_url: null, notes: null,
  })
  localDb.insert('assignments', {
    user_id: userId, module_id: math.id,
    title: 'Eigenvalues problem set', description: 'Chapters 5–6, questions 1–14.',
    due_at: at(addDays(now, 6), 12), priority: 'medium', weight: 10,
    estimated_minutes: 180, difficulty: 3, status: 'not_started', progress: 0,
    grade: null, submission_url: null, notes: null,
  })
  localDb.insert('assignments', {
    user_id: userId, module_id: stats.id,
    title: 'Regression analysis report', description: 'Analyze the housing dataset; 8 pages max.',
    due_at: at(subDays(now, 14), 16), priority: 'medium', weight: 20,
    estimated_minutes: 420, difficulty: 3, status: 'graded', progress: 100,
    grade: 78, submission_url: null, notes: 'Feedback: strong methodology section.',
  })

  // Class timetable (recurring weekly events)
  localDb.insert('calendar_events', {
    user_id: userId, title: 'DSA Lecture', description: null, event_type: 'class',
    starts_at: at(now, 9), ends_at: at(now, 10), all_day: false,
    location: 'CS Building 2A', color: '#2563eb', module_id: cs.id, assignment_id: null,
    recurrence: { freq: 'weekly', interval: 1, weekdays: [1, 3] },
  })
  localDb.insert('calendar_events', {
    user_id: userId, title: 'Linear Algebra Tutorial', description: null, event_type: 'class',
    starts_at: at(now, 14), ends_at: at(now, 15, 30), all_day: false,
    location: 'Maths Block M12', color: '#16a34a', module_id: math.id, assignment_id: null,
    recurrence: { freq: 'weekly', interval: 1, weekdays: [2, 4] },
  })
  localDb.insert('calendar_events', {
    user_id: userId, title: 'Statistics midterm', description: 'Covers weeks 1–6.',
    event_type: 'exam',
    starts_at: at(addDays(now, 9), 9), ends_at: at(addDays(now, 9), 11), all_day: false,
    location: 'Great Hall', color: '#dc2626', module_id: stats.id, assignment_id: null,
    recurrence: null,
  })

  const today = toDateKey(now)
  localDb.insert('tasks', {
    user_id: userId, title: 'Review Dijkstra lecture notes', notes: null,
    scheduled_on: today, start_minutes: 9 * 60 + 30, duration_minutes: 60,
    priority: 'high', status: 'todo', estimated_minutes: 60, completed_at: null,
    assignment_id: null, module_id: cs.id, recurrence: null, recurring_parent_id: null, sort_order: 0,
  })
  localDb.insert('tasks', {
    user_id: userId, title: 'Start eigenvalues problem set', notes: 'Questions 1–5 today.',
    scheduled_on: today, start_minutes: 15 * 60, duration_minutes: 90,
    priority: 'medium', status: 'todo', estimated_minutes: 90, completed_at: null,
    assignment_id: null, module_id: math.id, recurrence: null, recurring_parent_id: null, sort_order: 1,
  })
  localDb.insert('tasks', {
    user_id: userId, title: 'Weekly review & plan next week', notes: null,
    scheduled_on: toDateKey(addDays(now, (7 - now.getDay()) % 7)), start_minutes: 18 * 60,
    duration_minutes: 30, priority: 'low', status: 'todo', estimated_minutes: 30, completed_at: null,
    assignment_id: null, module_id: null,
    recurrence: { freq: 'weekly', interval: 1, weekdays: [0] },
    recurring_parent_id: null, sort_order: 2,
  })

  // A week of study history so stats and streaks demonstrate correctly.
  const sessionPlan = [
    { daysAgo: 0, minutes: 25, distractions: 1 },
    { daysAgo: 1, minutes: 75, distractions: 2 },
    { daysAgo: 2, minutes: 50, distractions: 0 },
    { daysAgo: 3, minutes: 100, distractions: 3 },
    { daysAgo: 5, minutes: 50, distractions: 1 },
    { daysAgo: 6, minutes: 25, distractions: 0 },
  ]
  for (const entry of sessionPlan) {
    localDb.insert('study_sessions', {
      user_id: userId,
      started_at: at(subDays(now, entry.daysAgo), 16),
      ended_at: at(subDays(now, entry.daysAgo), 17),
      minutes: entry.minutes, source: 'pomodoro', module_id: cs.id,
      assignment_id: null, distractions: entry.distractions, notes: null,
    })
  }

  // Habits with a fortnight of history.
  const habits = [
    { name: 'Morning review', emoji: '📖', color: '#2563eb', hitRate: 0.8 },
    { name: 'Gym / exercise', emoji: '💪', color: '#16a34a', hitRate: 0.5 },
    { name: 'Sleep by 23:00', emoji: '😴', color: '#4f46e5', hitRate: 0.65 },
  ]
  habits.forEach((habit, index) => {
    const row = localDb.insert('habits', {
      user_id: userId, name: habit.name, emoji: habit.emoji, color: habit.color,
      cadence: 'daily', target_count: 1, reminder_time: null, archived: false, sort_order: index,
    })
    for (let daysAgo = 1; daysAgo <= 14; daysAgo += 1) {
      // Deterministic pseudo-random pattern so the heatmap looks organic.
      if (((daysAgo * 7 + index * 3) % 10) / 10 < habit.hitRate) {
        localDb.insert('habit_logs', {
          user_id: userId, habit_id: row.id,
          log_date: toDateKey(subDays(now, daysAgo)), count: 1,
        })
      }
    }
  })

  // Notes
  const folder = localDb.insert('note_folders', { user_id: userId, name: 'Semester 1', sort_order: 0 })
  localDb.insert('notes', {
    user_id: userId, folder_id: folder.id, title: 'Dijkstra vs A*',
    content_md:
      '# Dijkstra vs A*\n\n- **Dijkstra** explores uniformly by path cost `g(n)`.\n- **A\\*** adds a heuristic: `f(n) = g(n) + h(n)`.\n- Admissible heuristic ⇒ optimal path.\n\n> Exam tip: know when A* degenerates into Dijkstra (h = 0).',
    tags: ['algorithms', 'exam'], pinned: true, module_id: cs.id,
  })
  localDb.insert('notes', {
    user_id: userId, folder_id: folder.id, title: 'Eigenvalue cheat sheet',
    content_md:
      '# Eigenvalues\n\n1. Solve `det(A − λI) = 0`\n2. For each λ, solve `(A − λI)v = 0`\n\n**Shortcuts**\n- Trace = sum of eigenvalues\n- Determinant = product of eigenvalues',
    tags: ['maths'], pinned: false, module_id: math.id,
  })

  // A simulated Pro subscription so the billing page shows an active plan.
  const periodEnd = addDays(now, 24)
  localDb.insert('subscriptions', {
    user_id: userId, plan: 'pro', status: 'active', provider: 'manual',
    provider_customer_id: null, provider_subscription_id: 'mock_demo',
    current_period_end: periodEnd.toISOString(), cancel_at_period_end: false,
  })

  // Admin-dashboard sample data (demo user is an admin).
  localDb.insert('feature_flags', { key: 'ai_quiz', enabled: true, description: 'AI-generated quizzes from notes' })
  localDb.insert('feature_flags', { key: 'leaderboards', enabled: false, description: 'Opt-in leaderboards (privacy-reviewed rollout)' })
  localDb.insert('feature_flags', { key: 'career_tools', enabled: false, description: 'Student Elite career dashboard' })
  localDb.insert('feature_flags', { key: 'push_reminders', enabled: true, description: 'Web push notification delivery' })
  localDb.insert('announcements', {
    title: 'Welcome to StudentOS 🎉', level: 'info',
    body: 'Exam season is coming — try the Smart Plan to schedule your revision.',
    published_at: now.toISOString(), expires_at: null,
  })
  localDb.insert('support_tickets', {
    user_id: userId, subject: 'Can I sync with Google Calendar?',
    body: 'Would love two-way sync with my Google Calendar so classes show up in both.',
    status: 'open', admin_notes: null,
  })
}

interface SeedQuestion {
  prompt: string
  options: string[]
  correct_index: number
  explanation: string
}

interface SeedQuiz {
  title: string
  kind: 'practice' | 'boss'
  questions: SeedQuestion[]
}

/** Quizzes over the same material the seeded notes cover. */
const DEMO_QUIZZES: SeedQuiz[] = [
  {
    title: 'Dijkstra vs A*',
    kind: 'practice',
    questions: [
      {
        prompt: 'What does A* add to Dijkstra’s algorithm?',
        options: [
          'A heuristic estimate of the remaining cost',
          'A second priority queue',
          'Edge weights that may be negative',
          'A depth limit on the search',
        ],
        correct_index: 0,
        explanation: 'A* scores nodes by f(n) = g(n) + h(n), where h(n) estimates the cost still to go.',
      },
      {
        prompt: 'When does A* behave exactly like Dijkstra?',
        options: [
          'When the graph is a tree',
          'When the heuristic is zero everywhere',
          'When all edges have equal weight',
          'When the goal is unreachable',
        ],
        correct_index: 1,
        explanation: 'With h(n) = 0, f(n) collapses to g(n) — which is precisely Dijkstra.',
      },
      {
        prompt: 'What must a heuristic be for A* to guarantee an optimal path?',
        options: ['Consistent only', 'Admissible', 'Strictly positive', 'Recomputed each step'],
        correct_index: 1,
        explanation: 'An admissible heuristic never overestimates the true remaining cost, which is what keeps A* optimal.',
      },
      {
        prompt: 'Dijkstra expands nodes in order of what?',
        options: [
          'Estimated total cost to the goal',
          'Insertion order',
          'Cost of the path taken so far',
          'Number of edges traversed',
        ],
        correct_index: 2,
        explanation: 'Dijkstra always expands the unvisited node with the smallest g(n) — the cost already accumulated.',
      },
    ],
  },
  {
    title: 'Eigenvalues — boss quiz',
    kind: 'boss',
    questions: [
      {
        prompt: 'Which equation gives the eigenvalues of a matrix A?',
        options: ['det(A − λI) = 0', 'AᵀA = I', 'trace(A) = 0', 'Av = 0'],
        correct_index: 0,
        explanation: 'The characteristic equation det(A − λI) = 0 has the eigenvalues as its roots.',
      },
      {
        prompt: 'The trace of a matrix equals what, in terms of its eigenvalues?',
        options: ['Their product', 'Their sum', 'Their largest value', 'Their count'],
        correct_index: 1,
        explanation: 'Trace = sum of eigenvalues; determinant = product of them.',
      },
      {
        prompt: 'Having found λ, how do you find its eigenvector?',
        options: [
          'Solve (A − λI)v = 0',
          'Invert A and multiply by λ',
          'Take the λ-th column of A',
          'Normalise every row of A',
        ],
        correct_index: 0,
        explanation: 'Each eigenvector spans the null space of (A − λI).',
      },
      {
        prompt: 'The determinant of a matrix equals what, in terms of its eigenvalues?',
        options: ['Their sum', 'Their mean', 'Their product', 'Their difference'],
        correct_index: 2,
        explanation: 'Determinant = product of the eigenvalues, counted with multiplicity.',
      },
      {
        prompt: 'A 3×3 matrix has eigenvalues 2, 3 and 5. What is its trace?',
        options: ['10', '30', '15', '6'],
        correct_index: 0,
        explanation: 'Trace is the sum: 2 + 3 + 5 = 10. (30 is the determinant.)',
      },
    ],
  },
]

/**
 * Seeded separately from everything above so returning demo users get it too.
 * No attempts are seeded on purpose: the library should show "Not tried", and
 * the first real attempt should be the one that pays XP.
 */
function seedQuizzes(userId: string): void {
  if (localStorage.getItem(QUIZ_SEED_FLAG)) return
  localStorage.setItem(QUIZ_SEED_FLAG, '1')

  // Attach to a module if the core seed made one; a back-filled user has them
  // already, and a brand-new one was just given them a moment ago.
  const modules = localDb.list<{
    id: string
    code: string
    created_at: string
    updated_at: string
  }>('modules', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })

  for (const seed of DEMO_QUIZZES) {
    const moduleId =
      modules.find((module) => (seed.kind === 'boss' ? module.code === 'MAM102' : module.code === 'CSC2001'))
        ?.id ?? null
    const quiz = localDb.insert<{ id: string; created_at: string; updated_at: string }>('quizzes', {
      user_id: userId,
      module_id: moduleId,
      title: seed.title,
      source: 'ai',
      kind: seed.kind,
      question_count: seed.questions.length,
    })
    seed.questions.forEach((question, index) => {
      localDb.insert('quiz_questions', {
        quiz_id: quiz.id,
        ordinal: index,
        prompt: question.prompt,
        options: question.options,
        correct_index: question.correct_index,
        explanation: question.explanation,
      })
    })
  }
}

/**
 * Two earlier passes at the practice quiz — 75%, then 100% — so the dashboard
 * has a real average and a real trend to show. The boss quiz is left untried
 * on purpose: it is the one that still pays XP, and the dashboard points to it.
 *
 * Skipped for anyone who already has attempts; their own history wins.
 */
function seedQuizHistory(userId: string): void {
  if (localStorage.getItem(QUIZ_HISTORY_FLAG)) return
  localStorage.setItem(QUIZ_HISTORY_FLAG, '1')

  const existing = localDb.list<{ id: string; created_at: string; updated_at: string }>('quiz_attempts', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })
  if (existing.length > 0) return

  const practice = localDb
    .list<{ id: string; title: string; kind: string; created_at: string; updated_at: string }>('quizzes', {
      filters: [{ column: 'user_id', op: 'eq', value: userId }],
    })
    .find((quiz) => quiz.kind === 'practice')
  if (!practice) return

  const now = new Date()
  const history = [
    // First pass: 3 of 4, and it paid. The re-take scored higher but paid nothing.
    { daysAgo: 3, score: 3, xp: 3 * QUIZ_XP.correct + QUIZ_XP.completed },
    { daysAgo: 1, score: 4, xp: 0 },
  ]
  for (const entry of history) {
    const at = addDays(now, -entry.daysAgo).toISOString()
    localDb.insert('quiz_attempts', {
      user_id: userId,
      quiz_id: practice.id,
      score: entry.score,
      total: 4,
      duration_seconds: 240,
      xp_awarded: entry.xp,
      submitted_at: at,
    })
  }
}

/**
 * The badges a level-5 student on a 12-day streak would already hold.
 *
 * Without these the dashboard said "0 of 12 — your first is one assignment
 * away" beside a level-5 profile with a 12-day streak and a full term of
 * assignments: a showcase that contradicts itself. Each one below is true of
 * the seeded data; none is handed out for something the demo has not done.
 */
function seedBadges(userId: string): void {
  if (localStorage.getItem(BADGES_FLAG)) return
  localStorage.setItem(BADGES_FLAG, '1')

  const existing = localDb.list<{ id: string; created_at: string; updated_at: string }>('achievements', {
    filters: [{ column: 'user_id', op: 'eq', value: userId }],
  })
  if (existing.length > 0) return

  const now = new Date()
  const earned: Array<[badgeId: string, daysAgo: number]> = [
    ['first-assignment', 34], // the seeded modules have assignments
    ['first-pomodoro', 30], // and focus sessions
    ['first-submission', 14], // one assignment is graded
    ['streak-7', 5], // the profile is on a 12-day streak
    ['level-5', 2], // and at level 5
  ]
  for (const [badgeId, daysAgo] of earned) {
    localDb.insert('achievements', {
      user_id: userId,
      badge_id: badgeId,
      unlocked_at: addDays(now, -daysAgo).toISOString(),
    })
  }
}

/**
 * The XP ledger's history, as migration 00016 would have recorded it.
 *
 * Demo mode now pays through a local ledger, exactly as the server does, and
 * weekly quests count from it. Without this the ledger starts empty, so:
 *
 *   - a quiz attempted before it existed — the seeded history, or a returning
 *     demo user's own attempts — would pay its first-pass XP again on the next
 *     re-take, because the ledger is what remembers it already paid;
 *   - this week's quests would show nothing for the week of study the seed
 *     describes, and re-ticking a seeded habit day would pay a second time.
 *
 * So the demo's own rows are recorded, dated to when they happened, at what
 * record_activity pays for them. A row the ledger already holds is left alone.
 */
function seedLedger(userId: string): void {
  if (localStorage.getItem(LEDGER_FLAG)) return
  localStorage.setItem(LEDGER_FLAG, '1')

  type Row = { id: string; created_at: string; updated_at: string; [key: string]: unknown }
  const mine = [{ column: 'user_id', op: 'eq' as const, value: userId }]
  const list = (tableName: string) => localDb.list<Row>(tableName, { filters: mine })

  const recorded = new Set(list('xp_ledger').map((row) => `${String(row.event)}|${String(row.source_id)}`))
  const record = (event: string, sourceId: string, amount: number, at: string) => {
    const key = `${event}|${sourceId}`
    if (recorded.has(key)) return
    recorded.add(key)
    localDb.insert('xp_ledger', { user_id: userId, event, source_id: sourceId, amount, created_at: at })
  }

  // Quizzes: one row per attempted quiz, dated to its first attempt, carrying
  // what that pass paid — the key quiz-grade pays under.
  const firstPass = new Map<string, { amount: number; at: string }>()
  const attempts = localDb.list<Row>('quiz_attempts', { filters: mine, orderBy: { column: 'submitted_at' } })
  for (const attempt of attempts) {
    const quizId = String(attempt.quiz_id)
    const paid = Number(attempt.xp_awarded) || 0
    const pass = firstPass.get(quizId)
    // Oldest first, so the first one seen is the pass that paid.
    if (!pass) firstPass.set(quizId, { amount: paid, at: String(attempt.submitted_at) })
    else pass.amount = Math.max(pass.amount, paid)
  }
  for (const [quizId, pass] of firstPass) record('quiz_completed', quizId, pass.amount, pass.at)

  // Everything else, keyed and priced as record_activity keys and prices it.
  const finishedFocus = new Set(
    list('pomodoro_sessions')
      .filter((row) => row.kind === 'focus' && row.completed === true)
      .map((row) => String(row.study_session_id)),
  )
  for (const session of list('study_sessions')) {
    if (!(Number(session.minutes) > 0)) continue
    const at = String(session.started_at ?? session.created_at)
    if (finishedFocus.has(session.id)) {
      record('pomodoro_completed', session.id, ACTIVITY_RULES.pomodoro_completed.amount, at)
    } else {
      record('study_session', session.id, ACTIVITY_RULES.study_session.amount, at)
    }
  }
  for (const task of list('tasks')) {
    if (task.status === 'done' && typeof task.completed_at === 'string') {
      record('task_completed', task.id, ACTIVITY_RULES.task_completed.amount, task.completed_at)
    }
  }
  for (const log of list('habit_logs')) {
    const day = String(log.log_date)
    // A check-in has a day, not a time; mid-morning keeps it inside that day.
    record('habit_completed', `${String(log.habit_id)}:${day}`, ACTIVITY_RULES.habit_completed.amount, new Date(`${day}T09:00:00`).toISOString())
  }
  for (const note of list('notes')) {
    record('note_created', note.id, ACTIVITY_RULES.note_created.amount, note.created_at)
  }
  for (const assignment of list('assignments')) {
    record('assignment_created', assignment.id, ACTIVITY_RULES.assignment_created.amount, assignment.created_at)
    if (assignment.status === 'submitted' || assignment.status === 'graded') {
      record('assignment_submitted', assignment.id, ACTIVITY_RULES.assignment_submitted.amount, assignment.updated_at)
    }
  }
}

/**
 * The pages of a lecture, as demo mode would have read them from its PDF.
 * Written for the demo; any resemblance to a real course handout is the subject
 * matter's fault.
 */
export const DEMO_LECTURE_PAGES = [
  'Eigenvalues and eigenvectors. For a square matrix A, a non-zero vector v is an eigenvector when multiplying by A only scales it: Av equals lambda times v. The scalar lambda is the eigenvalue belonging to that eigenvector. Geometrically, the matrix stretches, shrinks or reverses an eigenvector without turning it off its line.',
  'The characteristic equation. Rearranging Av = lambda v gives (A minus lambda I) v = 0. A non-zero solution exists only when the matrix A minus lambda I is singular, which means its determinant is zero. Setting det(A minus lambda I) equal to zero gives the characteristic polynomial, and its roots are exactly the eigenvalues of A.',
  'Trace and determinant. The sum of the eigenvalues of a matrix always equals its trace, the sum of the entries on the main diagonal. The product of the eigenvalues equals the determinant. These two facts are a quick check on any eigenvalue calculation done by hand.',
  'Diagonalisation. A matrix with n linearly independent eigenvectors can be written as A = P D P inverse. The columns of P are the eigenvectors, and D is a diagonal matrix holding the matching eigenvalues. Powers then become easy: A to the k equals P D to the k P inverse, and only the diagonal entries are raised to the power.',
  'Symmetric matrices. A real symmetric matrix always has real eigenvalues. Eigenvectors belonging to distinct eigenvalues of a symmetric matrix are orthogonal, so the eigenvectors can be chosen to form an orthonormal basis. This is the spectral theorem, and it is why symmetric matrices are the easiest to diagonalise.',
]

/**
 * One lecture in the study library, already read, so the demo's "My files"
 * shows what a student's library looks like and can be quizzed at once —
 * topic by topic, each question citing its page. Filed under the core seed's
 * Linear Algebra module when that exists.
 */
function seedLibrary(userId: string): void {
  if (localStorage.getItem(LIBRARY_FLAG)) return
  localStorage.setItem(LIBRARY_FLAG, '1')

  const mine = [{ column: 'user_id', op: 'eq' as const, value: userId }]
  if (localDb.list('study_resources', { filters: mine }).length > 0) return

  const maths = localDb
    .list<{ id: string; code: string; created_at: string; updated_at: string }>('modules', { filters: mine })
    .find((module) => module.code === 'MAM1020')

  localDb.insert('study_resources', {
    user_id: userId,
    module_id: maths?.id ?? null,
    title: 'Lecture 5 — Eigenvalues',
    kind: 'pdf',
    storage_paths: [`${userId}/demo-lecture-5.pdf`],
    size_bytes: 1_843_200,
    status: 'ready',
    page_count: DEMO_LECTURE_PAGES.length,
    outline: localOutline(DEMO_LECTURE_PAGES),
    summary: 'Eigenvalues and eigenvectors, the characteristic equation, and diagonalisation.',
    error: null,
    local_pages: DEMO_LECTURE_PAGES,
  })
}

/**
 * A squad, so the demo shows the table rather than an invitation to start one.
 * The demo student owns it (so every control shows) and sits third of four:
 * close enough to the top to want to climb. The other three are made up, and
 * carry their week on their rows because they have no ledger of their own;
 * squad-service reads those numbers in demo mode only.
 */
function seedSquad(userId: string): void {
  if (localStorage.getItem(SQUAD_FLAG)) return
  localStorage.setItem(SQUAD_FLAG, '1')

  const mine = [{ column: 'user_id', op: 'eq' as const, value: userId }]
  if (localDb.list('squad_members', { filters: mine }).length > 0) return

  const now = new Date()
  const squad = localDb.insert<{ id: string; created_at: string; updated_at: string }>('squads', {
    name: 'Graph Theory Crew',
    join_code: randomCode(),
    created_by: userId,
  })
  const member = (fields: Record<string, unknown>, daysAgo: number) =>
    localDb.insert('squad_members', { squad_id: squad.id, joined_at: addDays(now, -daysAgo).toISOString(), ...fields })

  member({ user_id: userId, handle: 'night_owl', role: 'owner' }, 20)
  member({ user_id: 'demo-peer-thandi', handle: 'thandi_m', role: 'member', demo_weekly_xp: 240, demo_streak: 9, demo_quests: 2 }, 18)
  member({ user_id: 'demo-peer-lebo', handle: 'lebo_k', role: 'member', demo_weekly_xp: 185, demo_streak: 4, demo_quests: 1 }, 15)
  member({ user_id: 'demo-peer-sipho', handle: 'sipho22', role: 'member', demo_weekly_xp: 60, demo_streak: 0, demo_quests: 0 }, 6)
}
