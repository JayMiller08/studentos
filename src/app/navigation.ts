import {
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  Settings,
  Timer,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Exact-match highlighting (for the index route). */
  end?: boolean
}

export interface NavSection {
  label: string | null
  items: NavItem[]
}

/**
 * Single source of truth for app navigation. Sections grow as features ship;
 * both the desktop sidebar and the mobile bottom bar derive from this file.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    label: 'Study',
    items: [
      { to: '/app/planner', label: 'Planner', icon: ListTodo },
      { to: '/app/assignments', label: 'Assignments', icon: BookOpen },
      { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/app/focus', label: 'Focus', icon: Timer },
    ],
  },
  {
    label: 'Account',
    items: [{ to: '/app/settings', label: 'Settings', icon: Settings }],
  },
]

/** Items pinned to the mobile bottom navigation (max 5 for thumb reach). */
export const MOBILE_NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/app/planner', label: 'Planner', icon: ListTodo },
  { to: '/app/assignments', label: 'Work', icon: BookOpen },
  { to: '/app/focus', label: 'Focus', icon: Timer },
  { to: '/app/settings', label: 'More', icon: Settings },
]
