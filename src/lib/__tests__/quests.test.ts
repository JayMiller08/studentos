import { describe, expect, it } from 'vitest'
import {
  daysLeft,
  QUEST_CATALOGUE,
  type QuestSignals,
  type QuestSlot,
  questProgress,
  questRotation,
  questsForWeek,
  questWeek,
  STUDY_EVENTS,
} from '@/lib/quests'
import { ACTIVITY_RULES } from '@/services/gamification-service'

/**
 * The quest rules as demo mode runs them. The same cases are probed against
 * Postgres for quest_progress() — these keep the two answering alike.
 */

describe('questWeek', () => {
  it('starts on Monday 00:00 local and ends the next Monday', () => {
    const week = questWeek(new Date(2026, 9, 7, 15, 30)) // Wednesday 7 Oct 2026
    expect(week.start).toEqual(new Date(2026, 9, 5))
    expect(week.end).toEqual(new Date(2026, 9, 12))
    expect(week.key).toBe('2026-10-05')
  })

  it('puts Sunday night in the week that began the Monday before', () => {
    expect(questWeek(new Date(2026, 9, 11, 23, 59)).key).toBe('2026-10-05')
    expect(questWeek(new Date(2026, 9, 12, 0, 0)).key).toBe('2026-10-12')
  })

  it('counts weeks from Monday 1 January 2024', () => {
    expect(questWeek(new Date(2024, 0, 1)).index).toBe(0)
    expect(questWeek(new Date(2024, 0, 7, 23)).index).toBe(0)
    expect(questWeek(new Date(2024, 0, 8)).index).toBe(1)
    expect(questWeek(new Date(2026, 9, 7)).index).toBe(144)
  })

  it('is not thrown by a daylight-saving change inside the span', () => {
    // A zone with DST makes some weeks 167 or 169 hours long; the index must stay whole.
    for (let day = 0; day < 400; day += 7) {
      const index = questWeek(new Date(2025, 0, 6 + day)).index
      expect(Number.isInteger(index)).toBe(true)
    }
  })
})

describe('the weekly rotation', () => {
  const slots: QuestSlot[] = [0, 1, 2]

  it('shows exactly one quest per slot, every week', () => {
    for (let week = 0; week < 60; week += 1) {
      expect(questsForWeek(week).map((quest) => quest.slot)).toEqual([0, 1, 2])
    }
  })

  it('is week_index % pool size', () => {
    for (const slot of slots) {
      const size = QUEST_CATALOGUE.filter((quest) => quest.slot === slot).length
      for (let week = 0; week < 20; week += 1) expect(questRotation(slot, week)).toBe(week % size)
    }
  })

  it('changes every slot with more than one quest from one week to the next', () => {
    const [a, b] = [questsForWeek(10), questsForWeek(11)]
    for (const slot of slots) {
      if (QUEST_CATALOGUE.filter((quest) => quest.slot === slot).length > 1) {
        expect(a[slot]!.id).not.toBe(b[slot]!.id)
      }
    }
  })

  it('reaches every quest in the catalogue', () => {
    const seen = new Set<string>()
    for (let week = 0; week < 24; week += 1) for (const quest of questsForWeek(week)) seen.add(quest.id)
    expect(seen.size).toBe(QUEST_CATALOGUE.length)
  })

  it('numbers each slot 0..n-1, with no gaps or repeats', () => {
    for (const slot of slots) {
      const ordinals = QUEST_CATALOGUE.filter((quest) => quest.slot === slot).map((quest) => quest.ordinal)
      expect([...ordinals].sort((x, y) => x - y)).toEqual([...ordinals.keys()])
    }
  })

  it('gives every quest a unique id, a positive target and a reward', () => {
    expect(new Set(QUEST_CATALOGUE.map((quest) => quest.id)).size).toBe(QUEST_CATALOGUE.length)
    for (const quest of QUEST_CATALOGUE) {
      expect(quest.target).toBeGreaterThan(0)
      expect(quest.reward).toBeGreaterThan(0)
    }
  })
})

describe('STUDY_EVENTS', () => {
  it('is every activity that keeps the streak, plus a quiz', () => {
    const streak = Object.entries(ACTIVITY_RULES)
      .filter(([, rule]) => rule.advancesStreak)
      .map(([event]) => event)
    expect([...STUDY_EVENTS].sort()).toEqual([...streak, 'quiz_completed'].sort())
  })
})

describe('questProgress', () => {
  const week = questWeek(new Date(2026, 9, 7, 12))
  const at = (day: number, hour = 10) => new Date(2026, 9, 5 + day, hour).toISOString()
  const before = new Date(2026, 9, 4, 23, 59, 59).toISOString()
  const signals = (partial: Partial<QuestSignals>): QuestSignals => ({ ledger: [], attempts: [], quizzes: [], ...partial })
  const row = (event: string, created_at: string, amount = 0) => ({ event, created_at, amount })
  const attempt = (quiz_id: string, score: number, total: number, submitted_at: string) => ({
    quiz_id,
    score,
    total,
    submitted_at,
  })

  it('counts only this week, and from 00:00 Monday exactly', () => {
    const ledger = [
      row('task_completed', before, 3),
      row('task_completed', week.start.toISOString(), 3),
      row('task_completed', at(2), 0),
      row('task_completed', week.end.toISOString(), 3),
    ]
    expect(questProgress('tasks', signals({ ledger }), week)).toBe(2)
  })

  it.each([
    ['pomodoros', 'pomodoro_completed'],
    ['habit_checkins', 'habit_completed'],
    ['submissions', 'assignment_submitted'],
  ] as const)('%s counts %s rows', (metric, event) => {
    const ledger = [row(event, at(0)), row(event, at(1)), row('note_created', at(1))]
    expect(questProgress(metric, signals({ ledger }), week)).toBe(2)
  })

  it('sums XP earned, leaving quest rewards out', () => {
    const ledger = [row('task_completed', at(0), 3), row('quiz_completed', at(1), 39), row('quest_claimed', at(1), 75)]
    expect(questProgress('xp_earned', signals({ ledger }), week)).toBe(42)
  })

  it('counts distinct days of study, including a quiz re-take, but not a note', () => {
    const ledger = [
      row('task_completed', at(0, 9)),
      row('study_session', at(0, 20)),
      row('pomodoro_completed', at(1)),
      row('note_created', at(2)),
    ]
    const attempts = [attempt('q', 1, 4, at(3))]
    expect(questProgress('study_days', signals({ ledger, attempts }), week)).toBe(3)
  })

  it('treats 80% exactly as a pass, and 0 of 0 as never one', () => {
    const attempts = [attempt('a', 3, 4, at(0)), attempt('a', 4, 5, at(1)), attempt('b', 0, 0, at(1))]
    expect(questProgress('quiz_attempts', signals({ attempts }), week)).toBe(3)
    expect(questProgress('quiz_score_80', signals({ attempts }), week)).toBe(1)
  })

  it('beats a boss only on a boss quiz, at 80% or more', () => {
    const quizzes = [
      { id: 'boss', kind: 'boss' as const },
      { id: 'practice', kind: 'practice' as const },
    ]
    expect(questProgress('boss_defeated', signals({ quizzes, attempts: [attempt('practice', 5, 5, at(0))] }), week)).toBe(0)
    expect(questProgress('boss_defeated', signals({ quizzes, attempts: [attempt('boss', 3, 5, at(0))] }), week)).toBe(0)
    expect(questProgress('boss_defeated', signals({ quizzes, attempts: [attempt('boss', 4, 5, at(0))] }), week)).toBe(1)
  })

  it('counts a revision only when the previous attempt was a week or more before it', () => {
    const nineDaysEarlier = new Date(2026, 9, 6 - 9, 10).toISOString()
    const threeDaysEarlier = new Date(2026, 9, 3, 10).toISOString()
    const attempts = [
      attempt('old', 2, 4, nineDaysEarlier),
      attempt('old', 3, 4, at(1)),
      attempt('recent', 2, 4, threeDaysEarlier),
      attempt('recent', 4, 4, at(1)),
      attempt('first', 4, 4, at(1)),
    ]
    expect(questProgress('quiz_revised', signals({ attempts }), week)).toBe(1)
  })
})

describe('daysLeft', () => {
  it('counts today, and never says zero', () => {
    const week = questWeek(new Date(2026, 9, 5, 9))
    expect(daysLeft(week, new Date(2026, 9, 5, 9))).toBe(7)
    expect(daysLeft(week, new Date(2026, 9, 11, 23))).toBe(1)
  })
})
