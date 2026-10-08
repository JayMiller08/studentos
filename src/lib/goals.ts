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
  // 'money' was removed with Budget: offering a goal the product can no longer
  // help with would be a promise it cannot keep. A profile that already stored
  // it is harmless — both pickers render from this list, so it simply stops
  // showing, and the next save drops it.
] as const

export const MAX_GOALS = 3
