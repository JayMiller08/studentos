import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  NotebookPen,
  Settings,
  Shield,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Repeat,
  Users,
} from 'lucide-react'
import type { Role } from '@/types/models'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Exact-match highlighting (for the index route). */
  end?: boolean
  /** When set, the item only shows for this role. */
  requiresRole?: Role
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
    label: 'Intelligence',
    items: [
      { to: '/app/quiz', label: 'Quizzes', icon: BrainCircuit },
      { to: '/app/smart-plan', label: 'Smart Plan', icon: Sparkles },
      { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Life',
    items: [
      { to: '/app/habits', label: 'Habits', icon: Repeat },
      { to: '/app/notes', label: 'Notes', icon: NotebookPen },
      { to: '/app/quests', label: 'Quests', icon: Target },
      // Not on the phone's bottom bar, which is full: reached from the
      // dashboard tile and from this menu, which the header opens on a phone.
      { to: '/app/squad', label: 'Squad', icon: Users },
      { to: '/app/achievements', label: 'Achievements', icon: Trophy },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/app/billing', label: 'Billing', icon: CreditCard },
      { to: '/app/settings', label: 'Settings', icon: Settings },
      { to: '/app/admin', label: 'Admin', icon: Shield, requiresRole: 'admin' },
    ],
  },
]

/** Filter nav sections by the current user's role, dropping empty sections. */
export function navSectionsForRole(role: Role | undefined): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.requiresRole || item.requiresRole === role),
  })).filter((section) => section.items.length > 0)
}

/** Items pinned to the mobile bottom navigation (max 5 for thumb reach). */
export const MOBILE_NAV_ITEMS: NavItem[] = [
  { to: '/app', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/app/planner', label: 'Planner', icon: ListTodo },
  { to: '/app/assignments', label: 'Work', icon: BookOpen },
  // Focus used to hold this slot. It is reachable in one tap from the
  // dashboard's priority card and from every assignment; a quiz has no other
  // entry point, and the whole revamp rests on students taking them.
  { to: '/app/quiz', label: 'Quizzes', icon: BrainCircuit },
  { to: '/app/settings', label: 'More', icon: Settings },
]
