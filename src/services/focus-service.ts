import {
  differenceInCalendarDays,
  isSameDay,
  isSameMonth,
  isSameWeek,
  parseISO,
  subDays,
} from 'date-fns'
import { toDateKey } from '@/lib/utils'
import { byUser, table } from '@/services/db'
import { profileService } from '@/services/profile-service'
import type { PomodoroSession, Profile, StudySession, StudySessionSource } from '@/types/models'

const studySessions = () => table<StudySession>('study_sessions')
const pomodoroSessions = () => table<PomodoroSession>('pomodoro_sessions')

export interface FocusStats {
  todayMinutes: number
  weekMinutes: number
  monthMinutes: number
  totalSessions: number
  totalDistractions: number
  /** Longest run of consecutive days with at least one session. */
  longestStreakDays: number
  currentStreakDays: number
}

export function computeFocusStats(sessions: StudySession[], now = new Date()): FocusStats {
  let todayMinutes = 0
  let weekMinutes = 0
  let monthMinutes = 0
  let totalDistractions = 0

  const activeDays = new Set<string>()
  for (const session of sessions) {
    const startedAt = parseISO(session.started_at)
    if (session.minutes > 0) activeDays.add(toDateKey(startedAt))
    if (isSameDay(startedAt, now)) todayMinutes += session.minutes
    if (isSameWeek(startedAt, now, { weekStartsOn: 1 })) weekMinutes += session.minutes
    if (isSameMonth(startedAt, now)) monthMinutes += session.minutes
    totalDistractions += session.distractions
  }

  // Streaks over the set of active days.
  const sortedDays = [...activeDays].sort()
  let longest = 0
  let run = 0
  let previous: Date | null = null
  for (const dayKey of sortedDays) {
    const day = parseISO(dayKey)
    run = previous && differenceInCalendarDays(day, previous) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = day
  }

  let current = 0
  let cursor = now
  // Current streak may start today or yesterday (today's session not logged yet).
  if (!activeDays.has(toDateKey(cursor))) cursor = subDays(cursor, 1)
  while (activeDays.has(toDateKey(cursor))) {
    current += 1
    cursor = subDays(cursor, 1)
  }

  return {
    todayMinutes,
    weekMinutes,
    monthMinutes,
    totalSessions: sessions.length,
    totalDistractions,
    longestStreakDays: longest,
    currentStreakDays: current,
  }
}

export interface LogSessionInput {
  startedAt: string
  minutes: number
  source: StudySessionSource
  distractions?: number
  moduleId?: string | null
  assignmentId?: string | null
  pomodoro?: {
    kind: 'focus' | 'short_break' | 'long_break'
    plannedMinutes: number
    completed: boolean
  }
}

export const focusService = {
  async listSessions(userId: string): Promise<StudySession[]> {
    return studySessions().list({
      filters: byUser(userId),
      orderBy: { column: 'started_at', ascending: false },
    })
  },

  /** Persist a finished focus block and roll the user's daily streak forward. */
  async logSession(userId: string, profile: Profile | null, input: LogSessionInput): Promise<StudySession> {
    const session = await studySessions().insert({
      user_id: userId,
      started_at: input.startedAt,
      ended_at: new Date().toISOString(),
      minutes: input.minutes,
      source: input.source,
      module_id: input.moduleId ?? null,
      assignment_id: input.assignmentId ?? null,
      distractions: input.distractions ?? 0,
      notes: null,
    })

    if (input.pomodoro) {
      await pomodoroSessions().insert({
        user_id: userId,
        study_session_id: session.id,
        kind: input.pomodoro.kind,
        planned_minutes: input.pomodoro.plannedMinutes,
        actual_minutes: input.minutes,
        completed: input.pomodoro.completed,
        started_at: input.startedAt,
      })
    }

    if (profile && input.minutes > 0) {
      await focusService.touchDailyStreak(userId, profile)
    }

    return session
  },

  /** Advance the profile-level daily streak (any meaningful activity today). */
  async touchDailyStreak(userId: string, profile: Profile): Promise<void> {
    const today = toDateKey(new Date())
    if (profile.last_active_date === today) return

    const yesterday = toDateKey(subDays(new Date(), 1))
    const nextStreak = profile.last_active_date === yesterday ? profile.current_streak + 1 : 1
    await profileService.update(userId, {
      current_streak: nextStreak,
      longest_streak: Math.max(profile.longest_streak, nextStreak),
      last_active_date: today,
    })
  },
}
