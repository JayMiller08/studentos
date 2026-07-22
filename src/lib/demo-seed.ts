import { addDays, setHours, setMinutes, subDays } from 'date-fns'
import { localDb } from '@/lib/local-db'
import { toDateKey } from '@/lib/utils'

const SEED_FLAG = 'studentos.demo.seeded'

function at(date: Date, hours: number, minutes = 0): string {
  return setMinutes(setHours(date, hours), minutes).toISOString()
}

/**
 * Seeds a believable student workload the first time demo mode is entered,
 * so every screen demonstrates its real behavior instead of empty states.
 * Idempotent — guarded by a flag in localStorage.
 */
export function ensureDemoSeed(userId: string): void {
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

  // Budget for the current month.
  const monthKey = `${today.slice(0, 7)}-01`
  localDb.insert('budgets', {
    user_id: userId, month: monthKey, currency: 'USD',
    planned_income: 850, spending_limit: 700,
  })
  const spend = [
    { type: 'income', amount: 850, category: 'other', note: 'Allowance + part-time job', daysAgo: 20 },
    { type: 'expense', amount: 320, category: 'housing', note: 'Res fees portion', daysAgo: 18 },
    { type: 'expense', amount: 86.5, category: 'food', note: 'Groceries', daysAgo: 6 },
    { type: 'expense', amount: 45, category: 'transport', note: 'Bus card top-up', daysAgo: 5 },
    { type: 'expense', amount: 60, category: 'books', note: 'Second-hand textbook', daysAgo: 3 },
    { type: 'expense', amount: 25, category: 'entertainment', note: 'Movie night', daysAgo: 1 },
  ] as const
  for (const item of spend) {
    localDb.insert('transactions', {
      user_id: userId, budget_month: monthKey, type: item.type, amount: item.amount,
      category: item.category, note: item.note, occurred_on: toDateKey(subDays(now, item.daysAgo)),
    })
  }
  localDb.insert('goals', {
    user_id: userId, name: 'New laptop fund', target_amount: 1200, saved_amount: 340,
    deadline: toDateKey(addDays(now, 120)), achieved_at: null,
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
}
