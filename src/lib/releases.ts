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
