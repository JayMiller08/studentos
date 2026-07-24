export interface TourStep {
  /** CSS selector(s) to anchor the spotlight. First visible match wins;
   * omit for a centered step. */
  target?: string | string[]
  title: string
  body: string
}

/**
 * First-run guided tour. Steps anchor to elements tagged with `data-tour`
 * on the dashboard and app shell. The nav step lists both the desktop
 * sidebar and the mobile bottom bar so it works on any device.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to StudentOS 👋',
    body: "It packs a lot in, so here's a 60-second tour of the essentials. You can skip anytime.",
  },
  {
    target: '[data-tour="priority"]',
    title: 'Your #1 priority',
    body: 'The dashboard always surfaces the single most important thing to do next, ranked from your real deadlines — so you never have to wonder where to start.',
  },
  {
    target: '[data-tour="today"]',
    title: 'Today at a glance',
    body: "Your tasks for today live here — tick them off right from the dashboard. Nearby cards show your schedule, study time and streak.",
  },
  {
    target: ['[data-tour="nav"]', '[data-tour="mobile-nav"]'],
    title: 'Everything lives here',
    body: 'Planner, calendar, focus timer, AI coach, habits, budget and notes — reach any tool from here. Explore one area at a time; you don’t need it all at once.',
  },
  {
    target: '[data-tour="topbar"]',
    title: 'Reminders, level & theme',
    body: 'Your reminders, XP level and streak, and the light/dark toggle sit up here.',
  },
  {
    title: "You're all set 🎉",
    body: 'Add your first assignment and StudentOS plans the rest. You can replay this tour anytime from Settings → Appearance.',
  },
]
