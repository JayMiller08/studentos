/**
 * Central query-key registry. Every TanStack Query key in the app is built
 * here so invalidation is consistent and typo-proof.
 */
export const queryKeys = {
  modules: (userId: string) => ['modules', userId] as const,
  assignments: (userId: string) => ['assignments', userId] as const,
  assignment: (userId: string, id: string) => ['assignments', userId, id] as const,
  tasks: (userId: string) => ['tasks', userId] as const,
  tasksForRange: (userId: string, from: string, to: string) =>
    ['tasks', userId, 'range', from, to] as const,
  calendarEvents: (userId: string, from: string, to: string) =>
    ['calendar-events', userId, from, to] as const,
  allCalendarEvents: (userId: string) => ['calendar-events', userId] as const,
  studySessions: (userId: string) => ['study-sessions', userId] as const,
  pomodoroSessions: (userId: string) => ['pomodoro-sessions', userId] as const,
  habits: (userId: string) => ['habits', userId] as const,
  habitLogs: (userId: string, from: string, to: string) =>
    ['habit-logs', userId, from, to] as const,
  allHabitLogs: (userId: string) => ['habit-logs', userId] as const,
  noteFolders: (userId: string) => ['note-folders', userId] as const,
  notes: (userId: string) => ['notes', userId] as const,
  note: (userId: string, id: string) => ['notes', userId, id] as const,
  noteVersions: (userId: string, noteId: string) => ['note-versions', userId, noteId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  achievements: (userId: string) => ['achievements', userId] as const,
  badges: () => ['badges'] as const,
  subscription: (userId: string) => ['subscription', userId] as const,
  studyPlans: (userId: string) => ['study-plans', userId] as const,
  quizzes: (userId: string) => ['quizzes', userId] as const,
  quiz: (userId: string, id: string) => ['quizzes', userId, id] as const,
  quizQuestions: (userId: string, quizId: string) =>
    ['quiz-questions', userId, quizId] as const,
  // Scoped keys nest under the unscoped one, so invalidating
  // ['quiz-attempts', userId] after a grade also refreshes a single quiz's
  // history — TanStack matches key prefixes.
  quizAttempts: (userId: string, quizId?: string) =>
    quizId ? (['quiz-attempts', userId, quizId] as const) : (['quiz-attempts', userId] as const),
  studyResources: (userId: string) => ['study-resources', userId] as const,
  quizGenerations: (userId: string) => ['quiz-generations', userId] as const,
  aiQuizUsage: (userId: string) => ['ai-usage', userId, 'quiz'] as const,
  // Everything that pays XP can move a quest, so invalidating ['quests', userId]
  // refreshes the board and the claim history together.
  quests: (userId: string) => ['quests', userId] as const,
  questBoard: (userId: string) => ['quests', userId, 'board'] as const,
  questHistory: (userId: string) => ['quests', userId, 'history'] as const,
  // Invalidating ['squad', userId] refreshes the squad and its table together.
  squad: (userId: string) => ['squad', userId] as const,
  mySquad: (userId: string) => ['squad', userId, 'mine'] as const,
  squadBoard: (userId: string) => ['squad', userId, 'board'] as const,
  adminUsers: () => ['admin', 'users'] as const,
  adminFlags: () => ['admin', 'feature-flags'] as const,
  adminAnnouncements: () => ['admin', 'announcements'] as const,
  adminTickets: () => ['admin', 'tickets'] as const,
} as const
