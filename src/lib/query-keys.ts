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
  budgets: (userId: string) => ['budgets', userId] as const,
  transactions: (userId: string, month: string) => ['transactions', userId, month] as const,
  allTransactions: (userId: string) => ['transactions', userId] as const,
  savingsGoals: (userId: string) => ['savings-goals', userId] as const,
  noteFolders: (userId: string) => ['note-folders', userId] as const,
  notes: (userId: string) => ['notes', userId] as const,
  note: (userId: string, id: string) => ['notes', userId, id] as const,
  noteVersions: (userId: string, noteId: string) => ['note-versions', userId, noteId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  achievements: (userId: string) => ['achievements', userId] as const,
  badges: () => ['badges'] as const,
  subscription: (userId: string) => ['subscription', userId] as const,
  aiConversations: (userId: string) => ['ai-conversations', userId] as const,
  aiMessages: (userId: string, conversationId: string) =>
    ['ai-messages', userId, conversationId] as const,
  adminUsers: () => ['admin', 'users'] as const,
  adminFlags: () => ['admin', 'feature-flags'] as const,
  adminAnnouncements: () => ['admin', 'announcements'] as const,
  adminTickets: () => ['admin', 'tickets'] as const,
} as const
