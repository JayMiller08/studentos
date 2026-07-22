import { addDays, differenceInCalendarDays, isBefore, parseISO } from 'date-fns'
import { toDateKey, todayKey } from '@/lib/utils'
import { byUser, table } from '@/services/db'
import { calendarService } from '@/services/calendar-service'
import { isActiveAssignment, isOverdue } from '@/services/assignments-service'
import type {
  AppNotification,
  Assignment,
  CalendarEvent,
  NotificationKind,
  NotificationPrefs,
} from '@/types/models'

const notifications = () => table<AppNotification>('notifications')

export interface ReminderContext {
  assignments: Assignment[]
  events: CalendarEvent[]
  prefs: NotificationPrefs
}

interface ReminderCandidate {
  kind: NotificationKind
  title: string
  body: string
  action_url: string
}

/**
 * Client-side reminder synthesis. Runs on app load and dedupes per calendar
 * day, so users get at most one nudge per item per day. In production the
 * same rules also run server-side (supabase/functions/send-reminders) on a
 * cron so reminders arrive even when the app is closed.
 */
function buildCandidates(context: ReminderContext, now: Date): ReminderCandidate[] {
  const candidates: ReminderCandidate[] = []

  if (context.prefs.assignments) {
    for (const assignment of context.assignments) {
      if (!isActiveAssignment(assignment)) continue
      const due = parseISO(assignment.due_at)
      const days = differenceInCalendarDays(due, now)
      if (isOverdue(assignment, now)) {
        candidates.push({
          kind: 'assignment_due',
          title: `Overdue: ${assignment.title}`,
          body: 'This assignment is past its deadline — rescue it today.',
          action_url: `/app/assignments#${assignment.id}`,
        })
      } else if (days >= 0 && days <= 2) {
        candidates.push({
          kind: 'assignment_due',
          title: days === 0 ? `Due today: ${assignment.title}` : `Due soon: ${assignment.title}`,
          body: days === 0 ? 'Deadline is today.' : `Deadline in ${days} day${days === 1 ? '' : 's'}.`,
          action_url: `/app/assignments#${assignment.id}`,
        })
      }
    }
  }

  if (context.prefs.exams) {
    const horizon = addDays(now, 7)
    const exams = calendarService
      .expandForRange(context.events, now, horizon)
      .filter((occurrence) => occurrence.event_type === 'exam')
    for (const exam of exams) {
      if (isBefore(exam.starts_at, now)) continue
      const days = differenceInCalendarDays(exam.starts_at, now)
      candidates.push({
        kind: 'exam',
        title: days === 0 ? `Exam today: ${exam.title}` : `Exam in ${days} day${days === 1 ? '' : 's'}: ${exam.title}`,
        body: exam.location ? `Location: ${exam.location}` : 'Check your notes and plan revision blocks.',
        action_url: `/app/calendar#${exam.sourceId}`,
      })
    }
  }

  return candidates
}

export const notificationsService = {
  async list(userId: string): Promise<AppNotification[]> {
    return notifications().list({
      filters: byUser(userId),
      orderBy: { column: 'created_at', ascending: false },
      limit: 50,
    })
  },

  async markRead(id: string): Promise<void> {
    await notifications().update(id, { read_at: new Date().toISOString() })
  },

  async markAllRead(userId: string): Promise<void> {
    const unread = await notifications().list({
      filters: byUser(userId, [{ column: 'read_at', op: 'is', value: null }]),
    })
    await Promise.all(unread.map((n) => notifications().update(n.id, { read_at: new Date().toISOString() })))
  },

  async remove(id: string): Promise<void> {
    await notifications().remove(id)
  },

  async push(userId: string, input: Omit<ReminderCandidate, 'body'> & { body?: string | null }): Promise<AppNotification> {
    return notifications().insert({
      user_id: userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      action_url: input.action_url,
      read_at: null,
      scheduled_for: null,
      sent_at: new Date().toISOString(),
    })
  },

  /** Generate today's due reminders (idempotent per day). Returns new rows. */
  async generateReminders(userId: string, context: ReminderContext): Promise<AppNotification[]> {
    const now = new Date()
    const existing = await notificationsService.list(userId)
    // Compare in *local* time — created_at is a UTC ISO string.
    const existingKeys = new Set(
      existing
        .filter((n) => toDateKey(parseISO(n.created_at)) === todayKey())
        .map((n) => `${n.kind}:${n.action_url ?? ''}:${n.title}`),
    )

    const fresh: AppNotification[] = []
    for (const candidate of buildCandidates(context, now)) {
      const key = `${candidate.kind}:${candidate.action_url}:${candidate.title}`
      if (existingKeys.has(key)) continue
      existingKeys.add(key)
      fresh.push(
        await notifications().insert({
          user_id: userId,
          kind: candidate.kind,
          title: candidate.title,
          body: candidate.body,
          action_url: candidate.action_url,
          read_at: null,
          scheduled_for: null,
          sent_at: new Date().toISOString(),
        }),
      )
    }

    // Surface via the OS when the user opted in and granted permission.
    if (
      fresh.length > 0 &&
      context.prefs.push_enabled &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      for (const notification of fresh.slice(0, 3)) {
        try {
          new Notification('StudentOS', { body: notification.title, tag: notification.id })
        } catch {
          // Some platforms (Android Chrome) require SW-based notifications; the
          // in-app center still shows everything.
        }
      }
    }

    return fresh
  },
}
