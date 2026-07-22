import { type ClassValue, clsx } from 'clsx'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 'yyyy-MM-dd' key for a date (local time). Used for habit logs, planner days, etc. */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function todayKey(): string {
  return toDateKey(new Date())
}

/** Format minutes as a compact human duration, e.g. 150 -> "2h 30m". */
export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Human label for how far away a due date is: "Due today", "3 days left", "2 days overdue". */
export function formatDueDistance(dueDateIso: string, now = new Date()): string {
  const days = differenceInCalendarDays(parseISO(dueDateIso), now)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days > 1) return `${days} days left`
  if (days === -1) return '1 day overdue'
  return `${Math.abs(days)} days overdue`
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Percentage (0–100) helper that never divides by zero. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0
  return clamp(Math.round((part / whole) * 100), 0, 100)
}

/** Stable sleep for optimistic UI timing in demo mode. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
