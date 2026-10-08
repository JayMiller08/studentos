import { QUIZ_XP } from '@/services/gamification-service'
import type { Profile } from '@/types/models'

/**
 * Per-page guided tours.
 *
 * Every app route owns a short walkthrough that plays the first time a user
 * lands on it, and can be replayed from the compass in the top bar. Steps
 * anchor to elements tagged with `data-tour`; a step whose target is missing
 * (empty state, hidden on mobile) degrades to a centered card rather than
 * breaking the tour, so pages stay free to render conditionally.
 *
 * This module is deliberately React-free: the profile service normalizes rows
 * against `ALL_TOUR_IDS`, and the tour feature renders from `PAGE_TOURS`.
 */

export interface TourStep {
  /** CSS selector(s) to anchor the spotlight. First visible match wins;
   * omit for a centered step. */
  target?: string | string[]
  title: string
  body: string
}

export interface PageTour {
  /** Stable id persisted on the profile — never rename one that has shipped. */
  id: string
  /** Exact `location.pathname` this tour belongs to. */
  path: string
  /** Human label, shown on the replay control. */
  label: string
  steps: TourStep[]
}

// Anchors every page gets for free from <PageHeader> and the app shell.
const ACTIONS = '[data-tour="page-actions"]'
const NAV = ['[data-tour="nav"]', '[data-tour="mobile-nav"]']
const REPLAY = '[data-tour="replay-tour"]'

export const PAGE_TOURS: PageTour[] = [
  {
    id: 'dashboard',
    path: '/app',
    label: 'Dashboard',
    steps: [
      {
        title: 'Welcome to StudentOS 👋',
        body: "It packs a lot in, so here's a 60-second tour of the essentials. You can skip anytime.",
      },
      {
        target: '[data-tour="progress"]',
        title: 'Where you stand',
        body: 'Your level, quiz average, streak and badges — first thing, every time. Quiz answers are marked on the server, so they are the XP that counts.',
      },
      {
        target: '[data-tour="priority"]',
        title: 'Your #1 priority',
        body: 'The dashboard always surfaces the single most important thing to do next, ranked from your real deadlines — so you never have to wonder where to start.',
      },
      {
        target: '[data-tour="today"]',
        title: 'Today at a glance',
        body: 'Your tasks for today live here — tick them off right from the dashboard. Nearby cards show your schedule, your latest quiz scores and study time.',
      },
      {
        target: '[data-tour="quests"]',
        title: 'A shape for the week',
        body: 'Three quests, the same for everyone, new every Monday. Finish one and claim its bonus XP right here, on top of what you earned doing it.',
      },
      {
        target: NAV,
        title: 'Everything lives here',
        body: 'Planner, calendar, focus timer, quizzes, habits and notes — reach any tool from here. Explore one area at a time; you don’t need it all at once.',
      },
      {
        target: REPLAY,
        title: 'Every page explains itself',
        body: 'Each page has its own short tour that plays the first time you open it. Tap the compass to replay the tour for whatever page you’re on.',
      },
    ],
  },

  {
    id: 'planner',
    path: '/app/planner',
    label: 'Planner',
    steps: [
      {
        target: '[data-tour="planner-views"]',
        title: 'Day, week or month',
        body: 'Switch how far ahead you look. Day view is for actually doing the work; week and month are for spotting the crunch before it arrives.',
      },
      {
        target: '[data-tour="planner-backlog"]',
        title: 'Park it in the backlog',
        body: 'Anything without a date waits here. Drag a task onto a day to schedule it, or drag it back when the day gets away from you.',
      },
      {
        target: ACTIONS,
        title: 'Add a task',
        body: 'Give a task an estimate and StudentOS can time-block it for you, so your plan reflects hours you actually have.',
      },
    ],
  },

  {
    id: 'assignments',
    path: '/app/assignments',
    label: 'Assignments',
    steps: [
      {
        target: ACTIONS,
        title: 'Start with your modules',
        body: 'Add your modules once, then log each assignment against one. Deadlines, weighting and progress all hang off this.',
      },
      {
        target: '[data-tour="assignment-filters"]',
        title: 'Active, completed or all',
        body: 'Active hides anything you have already submitted, so the list stays honest about what is left.',
      },
      {
        target: '[data-tour="assignment-list"]',
        title: 'Ordered by what matters',
        body: 'Assignments are ranked by deadline, grade weight and how much is left to do — not just by due date. The top of this list is where to spend tonight.',
      },
    ],
  },

  {
    id: 'calendar',
    path: '/app/calendar',
    label: 'Calendar',
    steps: [
      {
        target: '[data-tour="calendar-views"]',
        title: 'Month, week and exams',
        body: 'Month is the big picture, week is your timetable, and the exams view pulls every exam into one countdown list.',
      },
      {
        target: '[data-tour="calendar-grid"]',
        title: 'Classes, deadlines and study blocks',
        body: 'Assignment deadlines appear here automatically alongside your events. Double-click a day to add something, or drag an event to move it.',
      },
      {
        target: ACTIONS,
        title: 'Add recurring classes once',
        body: 'Set a lecture to repeat weekly and it fills your whole semester — no need to add it week by week.',
      },
    ],
  },

  {
    id: 'focus',
    path: '/app/focus',
    label: 'Focus',
    steps: [
      {
        target: '[data-tour="focus-timer"]',
        title: 'Pomodoro or deep work',
        body: 'Pomodoro runs focus and break cycles for you; deep work is an open-ended timer for when you are already in flow. Tap "Distracted" whenever your mind wanders — watching that number fall week to week is the point.',
      },
      {
        target: '[data-tour="focus-ambient"]',
        title: 'Something to drown out res',
        body: 'Ambient sound is generated on your device, so it keeps working offline and costs you no data.',
      },
      {
        target: '[data-tour="focus-stats"]',
        title: 'Every session counts',
        body: 'Finished sessions log automatically and feed your streak, your XP and the trends in Analytics.',
      },
    ],
  },

  {
    id: 'quiz',
    path: '/app/quiz',
    label: 'Quizzes',
    steps: [
      {
        target: '[data-tour="quiz-generate"]',
        title: 'Quiz yourself on your own material',
        body: 'Upload a lecture PDF or photos of your notes, or pick a note. Choose the topics, the length and how hard, and every question comes from that material, with the page it is on. Boss quizzes need 80% to beat.',
      },
      {
        target: '[data-tour="quiz-stats"]',
        title: 'XP you actually earned',
        body: `Every correct answer is worth ${QUIZ_XP.correct} XP, checked on the server against an answer key your browser never sees. This is the one score in StudentOS that cannot be faked.`,
      },
      {
        target: '[data-tour="quiz-library"]',
        title: 'Revise, as often as you like',
        body: 'Re-taking a quiz is free and always records your score — it just will not pay XP twice. The first attempt is the one that counts.',
      },
    ],
  },

  {
    id: 'smart-plan',
    path: '/app/smart-plan',
    label: 'Smart Plan',
    steps: [
      {
        target: '[data-tour="plan-settings"]',
        title: 'Tell it your real capacity',
        body: 'Set how many days to plan and how much you can honestly study per day. An over-optimistic plan is the fastest way to abandon one.',
      },
      {
        title: 'A schedule, with reasons',
        body: 'StudentOS splits your assignments into study blocks weighted by deadline, grade impact and difficulty — and every block shows why it was placed there.',
      },
      {
        title: 'Apply a day at a time',
        body: 'Happy with a day? Send it straight to your planner as real tasks. Applying twice will not duplicate anything.',
      },
      {
        title: 'Save, edit, delete',
        body: 'Keep a plan to come back to it — then reopen it, resize or drop blocks that stopped fitting, rename it, or delete it when the term moves on.',
      },
    ],
  },

  {
    id: 'analytics',
    path: '/app/analytics',
    label: 'Analytics',
    steps: [
      {
        target: '[data-tour="analytics-stats"]',
        title: 'Your headline numbers',
        body: 'Productivity score blends how consistently you show up with how much you actually finish — one number you can move.',
      },
      {
        target: '[data-tour="analytics-charts"]',
        title: 'Patterns, not guilt',
        body: 'These charts are for spotting your good weeks and copying them. Look for the shape of the trend, not any single bad day.',
      },
    ],
  },

  {
    id: 'habits',
    path: '/app/habits',
    label: 'Habits',
    steps: [
      {
        target: ACTIONS,
        title: 'Start with one small habit',
        body: 'Ten minutes of revision beats an hour you never do. Add one habit, keep it embarrassingly small, and let the streak build.',
      },
      {
        target: '[data-tour="habits-week"]',
        title: 'Tap any day to log it',
        body: 'Tick off today, or backfill a day you forgot. Your current streak sits at the end of each row.',
      },
      {
        target: '[data-tour="habits-heatmap"]',
        title: 'Twelve weeks at a glance',
        body: 'The heatmap shows consistency over time. Missing one day barely shows — missing three weeks does.',
      },
    ],
  },

  {
    id: 'notes',
    path: '/app/notes',
    label: 'Notes',
    steps: [
      {
        target: '[data-tour="notes-search"]',
        title: 'Search everything',
        body: 'Search runs across titles, content and tags — so you can find that one definition without remembering where you put it.',
      },
      {
        target: '[data-tour="notes-folders"]',
        title: 'Folders per module',
        body: 'A folder per module keeps things findable. Anything unfiled stays one click away.',
      },
      {
        target: ACTIONS,
        title: 'Just start writing',
        body: 'Format with the toolbar — headings, lists, checklists, quotes — no special characters to memorise. Earlier versions are kept, so an accidental delete is recoverable.',
      },
    ],
  },

  {
    id: 'quests',
    path: '/app/quests',
    label: 'Quests',
    steps: [
      {
        target: '[data-tour="quest-board"]',
        title: 'Three quests a week',
        body: 'One for showing up, one for proving what you know, one for keeping moving. Everyone gets the same three, and a new set arrives every Monday.',
      },
      {
        target: '[data-tour="quest-rules"]',
        title: 'Progress you cannot fake',
        body: 'Quests count what StudentOS can check — quizzes marked on our server, and activity you have already been rewarded for. Nothing here can be typed in.',
      },
      {
        target: '[data-tour="quest-history"]',
        title: 'Claim it to keep it',
        body: 'A finished quest waits until Sunday night. Claim it and its bonus XP is yours, on top of the XP you earned doing it; every claim is listed here.',
      },
    ],
  },

  {
    id: 'squad',
    path: '/app/squad',
    label: 'Squad',
    steps: [
      {
        target: ['[data-tour="squad-standings"]', '[data-tour="squad-start"]'],
        title: 'A week, together',
        body: 'Three to six of you on the same three quests, with one table of the XP each of you earned since Monday. It starts again every Monday.',
      },
      {
        target: ['[data-tour="squad-invite"]', '[data-tour="squad-start"]'],
        title: 'Bring your study group',
        body: 'Every squad has an eight-character code. Send it to the friends you study with; they join with a handle of their own.',
      },
      {
        target: '[data-tour="squad-privacy"]',
        title: 'Only what you would put on a whiteboard',
        body: 'Your squad sees your handle, your XP this week, your streak and your quest ticks. Never your name, modules, grades or notes. Squads pay no XP.',
      },
    ],
  },

  {
    id: 'achievements',
    path: '/app/achievements',
    label: 'Achievements',
    steps: [
      {
        target: '[data-tour="level-hero"]',
        title: 'XP for real work',
        body: 'Quiz answers earn the most, because they are marked on our server. Tasks, focus sessions and habits earn a little each, up to a daily limit. Levels are the receipt.',
      },
      {
        target: '[data-tour="badges"]',
        title: 'Badges to chase',
        body: 'Locked badges show what earns them, so there is always a next small target.',
      },
    ],
  },

  {
    id: 'billing',
    path: '/app/billing',
    label: 'Billing',
    steps: [
      {
        target: '[data-tour="billing-plans"]',
        title: 'What each plan unlocks',
        body: 'Free covers the core planner, assignments and focus timer. Pro adds smart prioritization, AI quizzes from your notes and unlimited assignments.',
      },
      {
        title: 'Change or cancel anytime',
        body: 'Your plan is managed from this page, and downgrading never deletes your work.',
      },
    ],
  },

  {
    id: 'settings',
    path: '/app/settings',
    label: 'Settings',
    steps: [
      {
        target: '[data-tour="settings-tabs"]',
        title: 'Profile, appearance, notifications',
        body: 'Your academic details live under Profile — keeping them current is what lets StudentOS plan around your semester.',
      },
      {
        target: REPLAY,
        title: 'Tours live here',
        body: 'The compass replays the tour for whichever page you are on. Appearance also has a reset if you want them all to play again.',
      },
    ],
  },

  {
    id: 'admin',
    path: '/app/admin',
    label: 'Admin',
    steps: [
      {
        title: 'Admin overview',
        body: 'Usage, signups and plan mix across the workspace. Read-only — nothing here changes a student’s data.',
      },
    ],
  },
]

/** One-off spotlight shown to people who used StudentOS before per-page tours
 * existed, so they discover the replay control instead of being interrupted. */
export const REPLAY_HINT_TOUR: PageTour = {
  id: 'replay-hint',
  path: '*',
  label: 'Tours',
  steps: [
    {
      target: REPLAY,
      title: 'Every page has a tour now',
      body: 'You already know your way around, so we won’t interrupt you. Tap the compass on any page for a quick walkthrough of what it does.',
    },
  ],
}

export const ALL_TOUR_IDS: readonly string[] = PAGE_TOURS.map((tour) => tour.id)

const TOUR_BY_PATH = new Map(PAGE_TOURS.map((tour) => [tour.path, tour]))

/** The tour owning a route, if any. Trailing slashes are ignored. */
export function tourForPath(pathname: string): PageTour | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return TOUR_BY_PATH.get(normalized) ?? null
}

/**
 * Fill in tour fields for rows written before per-page tours shipped — a demo
 * profile in localStorage, or a database that has not run migration 00007 yet.
 * Someone who finished the original single tour already knows the app, so we
 * count every page tour as seen and point them at the replay control instead
 * of replaying fifteen walkthroughs at them.
 */
export function withTourDefaults(profile: Profile): Profile {
  const hasTours = Array.isArray(profile.tours_seen)
  const hasHint = typeof profile.tour_replay_hint === 'boolean'
  if (hasTours && hasHint) return profile

  const veteran = Boolean(profile.tour_completed)
  return {
    ...profile,
    tours_seen: hasTours ? profile.tours_seen : veteran ? [...ALL_TOUR_IDS] : [],
    // Each field defaults on its own: dismissing the pointer persists only
    // `tour_replay_hint`, and re-deriving it here would resurrect the pointer
    // on every reload for as long as `tours_seen` stays absent.
    tour_replay_hint: hasHint ? profile.tour_replay_hint : veteran,
  }
}
