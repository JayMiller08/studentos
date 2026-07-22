import {
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
  NotebookPen,
  PiggyBank,
  Settings,
  Shield,
  Sparkles,
  Timer,
  Trophy,
  Repeat,
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
      { to: '/app/smart-plan', label: 'Smart Plan', icon: Sparkles },
      { to: '/app/coach', label: 'AI Coach', icon: Bot },
      { to: '/app/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Life',
    items: [
      { to: '/app/habits', label: 'Habits', icon: Repeat },
      { to: '/app/budget', label: 'Budget', icon: PiggyBank },
      { to: '/app/notes', label: 'Notes', icon: NotebookPen },
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
  { to: '/app/focus', label: 'Focus', icon: Timer },
  { to: '/app/settings', label: 'More', icon: Settings },
]
