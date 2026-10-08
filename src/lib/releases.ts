/**
 * The changelog StudentOS shows students after an update.
 *
 * Deliberately data, not markup: shipping a release means adding an entry here,
 * and the dialog, the "seen" bookkeeping and the ordering all follow from it.
 *
 * Write for a student, not a release engineer — what changed for them, in their
 * words. Nobody wants "fixed a state persistence bug in the focus module".
 */

export type ReleaseChangeKind = 'new' | 'improved' | 'fixed'

export interface ReleaseChange {
  kind: ReleaseChangeKind
  title: string
  body: string
}

export interface Release {
  /**
   * Release date as `yyyy-MM-dd`. This doubles as the sort key and as the
   * marker of what a student has already been shown, so entries must be listed
   * newest first and no two releases may share a date.
   */
  date: string
  title: string
  changes: ReleaseChange[]
}

export const RELEASES: Release[] = [
  {
    date: '2026-10-08',
    title: 'Squads',
    changes: [
      {
        kind: 'new',
        title: 'Study with a squad',
        body: 'Start a squad of three to six and send your friends its code. You get the same three quests every week and one table of the XP each of you earned since Monday. It starts again every Monday.',
      },
      {
        kind: 'new',
        title: 'Your handle, not your name',
        body: 'Your squad sees a handle you choose, your XP this week, your streak and which quests you have claimed. Never your name, university, modules, grades or notes. Squads pay no XP, so there is nothing to game.',
      },
    ],
  },
  {
    date: '2026-10-07',
    title: 'Quizzes from your own files, and weekly quests',
    changes: [
      {
        kind: 'new',
        title: 'Quiz yourself on your lecture slides',
        body: 'Upload a lecture PDF or photos of your notes and StudentOS writes a quiz from exactly that — every question citing the page it comes from. Pick the topics, the length and how hard it should be. Your files stay private, in a library you can quiz from again any time.',
      },
      {
        kind: 'improved',
        title: 'Every plan can make AI quizzes',
        body: 'Free now includes 3 AI quizzes a month, Pro 40 and Elite 150. Each quiz is checked twice against your material before you see it, so the answers are right.',
      },
      {
        kind: 'new',
        title: 'Three quests every week',
        body: 'One for showing up, one for proving what you know, one for keeping moving — the same three for everyone, and a new set every Monday. Finish one and claim its bonus XP, on top of what you earned doing it, straight from the dashboard.',
      },
      {
        kind: 'improved',
        title: 'XP nobody can edit',
        body: 'Your XP, level, streak and badges are now worked out by our server from what you actually did, so nobody can type their way up a level. That matters now that quests pay out.',
      },
      {
        kind: 'improved',
        title: 'Everything pays once',
        body: 'Ticking the same task twice, or a habit for the same day, now pays once, and everyday activity has a daily limit. Quizzes have no limit — they are the XP you prove.',
      },
      {
        kind: 'fixed',
        title: 'Quizzes keep your streak',
        body: 'Answering a quiz now counts as studying for the day, and reaching a new level through a quiz unlocks its badge straight away.',
      },
    ],
  },
  {
    date: '2026-09-27',
    title: 'Quizzes — XP you have to earn',
    changes: [
      {
        kind: 'new',
        title: 'Turn any note into a quiz',
        body: 'Pick a note and StudentOS writes multiple-choice questions from it. Answer them and you earn 8 XP per correct answer — marked on our server, against an answer key your browser never sees. Boss quizzes need 80% and are worth a lot more.',
      },
      {
        kind: 'improved',
        title: 'XP now means something',
        body: 'Focus sessions and ticked tasks are worth less than they were, because both are things you tell us about rather than things we can check. Quiz answers are the opposite, so that is where the points moved.',
      },
      {
        kind: 'improved',
        title: 'A calmer, deeper look',
        body: 'New dashboard layout, a redesigned sign-in, and real depth on every card — especially in dark mode.',
      },
      {
        kind: 'fixed',
        title: 'Budget and the AI Coach have gone',
        body: 'Both were pulling attention away from your studies. The Coach’s AI now writes your quizzes instead, and Smart Plan is unchanged.',
      },
    ],
  },
  {
    date: '2026-09-23',
    title: 'An image button, and checklists that mind their own business',
    changes: [
      {
        kind: 'new',
        title: 'Add an image from the toolbar',
        body: 'Notes have an image button now — pick a picture from your phone or computer, no pasting needed. Pasting a screenshot and dragging a file in still work exactly as before.',
      },
      {
        kind: 'fixed',
        title: 'Misspelled words are no longer struck out',
        body: 'In a checklist, a word your browser thought was misspelled could appear with a line through it, as though the item were done. Only ticked items are struck through now.',
      },
    ],
  },
  {
    date: '2026-09-20',
    title: 'Your streak freeze is ready when you need it',
    changes: [
      {
        kind: 'fixed',
        title: 'Streak freezes now cover you from day one',
        body: 'A freeze only arrived after seven days in a row, so a missed day could still reset your streak before you had one to spend — including for everyone already studying when freezes launched. You now start with a freeze, and still earn another for every 7 days in a row, up to 2.',
      },
    ],
  },
  {
    date: '2026-09-16',
    title: 'Images in notes, colourful code and cleaner checklists',
    changes: [
      {
        kind: 'new',
        title: 'Paste images into your notes',
        body: 'Paste a screenshot or a copied image straight into a note, or drag one in, and it is saved with the note. Big images are resized so your notes stay quick to open, and your images are private to you.',
      },
      {
        kind: 'improved',
        title: 'Checklists that look finished',
        body: 'Checklist boxes are neater and line up with your text, and ticking an item now strikes it through, so you can see at a glance what is done.',
      },
      {
        kind: 'new',
        title: 'Code blocks with colour and line numbers',
        body: 'Type three backticks (```) or press the Code block button and a code block appears straight away. Code is coloured as you type and every line is numbered. The language is recognised for you — the label in the corner shows what it found, and you can change it there.',
      },
    ],
  },
  {
    date: '2026-09-15',
    title: 'Breaks on autopilot, and a safety net for your streak',
    changes: [
      {
        kind: 'improved',
        title: 'Pomodoro breaks start themselves',
        body: 'When a focus session ends, your break now begins straight away, so you never have to come back and press Start just to rest. When the break is over, the next focus session waits until you are ready.',
      },
      {
        kind: 'new',
        title: 'Streak freezes',
        body: 'Miss a single day and a streak freeze keeps your streak alive. You earn one for every 7 days in a row and can hold up to 2. A freeze covers one missed day, so missing two in a row still starts your streak again.',
      },
    ],
  },
  {
    date: '2026-09-09',
    title: 'Write notes without the syntax',
    changes: [
      {
        kind: 'improved',
        title: 'Notes are now what-you-see-is-what-you-get',
        body: 'No more typing # and ** to get headings and bold, and no more flipping to a preview to check it worked. Use the toolbar — headings, lists, checklists, quotes, links — and your note looks right while you write it. Everything you had already written is untouched, and if you liked writing Markdown, the Markdown button keeps it one click away.',
      },
      {
        kind: 'fixed',
        title: 'Deep work no longer loses your session',
        body: 'Switching to Pomodoro or leaving the Focus Center used to reset the deep work timer to zero and throw the time away. It now keeps running wherever you go — and the time is logged when you stop it.',
      },
      {
        kind: 'fixed',
        title: 'Your streak reflects your actual days',
        body: 'A streak could keep showing its old number long after it had lapsed. It now counts only days you really studied, and resets once a day goes by unlogged.',
      },
      {
        kind: 'new',
        title: 'Recent notes on your dashboard',
        body: 'The notes you saved most recently now sit on the dashboard. Tap one to jump straight back into it.',
      },
    ],
  },
]

/** The marker written once a student has been shown everything above. */
export const LATEST_RELEASE_DATE: string = RELEASES[0]?.date ?? ''

/**
 * Releases a student has not been shown yet.
 *
 * `marker` is the date of the newest release they have already seen. Someone
 * who has never been shown one is measured from the day their account was
 * created instead, so a student who signs up today is not handed a changelog
 * describing changes to an app they have never used.
 */
export function unseenReleases(marker: string | null, accountCreatedOn: string): Release[] {
  const since = marker && marker.length > 0 ? marker : accountCreatedOn
  return RELEASES.filter((release) => release.date > since)
}
