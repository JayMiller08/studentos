/**
 * Student goals offered during onboarding and editable later in Settings.
 * Shared in one place so the two pickers never drift out of sync.
 */
export const GOAL_OPTIONS = [
  { id: 'grades', emoji: '🎯', label: 'Improve my grades' },
  { id: 'productivity', emoji: '⏱️', label: 'Increase productivity' },
  { id: 'focus', emoji: '🧠', label: 'Stay focused' },
  { id: 'balance', emoji: '🧘', label: 'Achieve life balance' },
  { id: 'career', emoji: '🏔️', label: 'Have a successful career' },
  { id: 'money', emoji: '💰', label: 'Manage my money' },
] as const

export const MAX_GOALS = 3
