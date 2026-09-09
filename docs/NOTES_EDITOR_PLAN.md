# Plan — making notes writable without Markdown

**Status:** proposed, not yet built
**Prepared:** 9 September 2026

## Why

The note editor is a plain `<textarea>` in a monospace font whose placeholder is
a syntax lesson:

```
Write in Markdown…  # Heading, **bold**, - lists, `code`
```

To get a heading, a student has to know that `#` makes one. To check they got it
right they have to leave the writing surface entirely and press **Preview**,
because what they typed does not look like what they meant. For a computer
science student that is fine. For a first-year law or nursing student typing up
a lecture, it is a wall in front of the one feature they were most likely to use
daily — and every wrong guess is visible in their own notes.

The goal is **not to remove Markdown**. It is to stop *requiring* it.

## What "easier" means here

Concretely, a student should be able to:

- Press a **B** button, or `Ctrl+B`, and see bold text — no asterisks anywhere.
- Get a bulleted list by clicking a list button, and keep it going with Enter.
- See headings rendered as headings *while typing them*, with no preview toggle.
- Paste from a lecture slide, Word or a web page and keep the formatting,
  without a wall of stray symbols.
- Never see a character they did not intend to type.

Students who already know Markdown should keep every shortcut they have —
typing `# ` still makes a heading, `- ` still starts a list.

## Recommendation

**TipTap (ProseMirror) in WYSIWYG mode, with Markdown kept as the stored
format.**

Two decisions worth separating, because the second is the one that carries risk.

### 1. The editor: TipTap

| Option | Verdict |
| --- | --- |
| **TipTap** | **Recommended.** Headless, so it inherits the existing Tailwind/Radix styling instead of fighting it. React 19 compatible, actively maintained, and the bubble-menu / slash-command patterns are well-trodden. |
| Lexical | Comparable quality, noticeably more boilerplate for the same result. |
| Milkdown | Markdown-native, which is appealing — but a smaller ecosystem and a heavier lift to restyle. |
| Slate | Too much to build and maintain ourselves. |
| Quill | Mature, but its Delta format fights the Markdown storage decision below. |

Bundle weight is the main cost (~100 KB gzipped with a sensible extension set).
Routes are already lazily loaded (`src/app/router.tsx`), so this lands in the
notes chunk and costs nothing to a student who never opens Notes. **This must
stay true — the editor must not be imported from any eagerly-loaded module.**

### 2. The storage format: keep `content_md`

This is the important one. The obvious instinct is to store rich HTML or
ProseMirror JSON, since that is what the editor speaks natively. It should be
resisted, because `content_md` is load-bearing in more places than the editor:

- `notes.content_md` and `note_versions.content_md` (schema, migration `00001`)
- `searchNotes()` searches note bodies as plain text
- `notePreview()` renders card previews on the notes page and the dashboard
- version history diffs and restores compare stored bodies
- the AI Coach reads note content as text
- the DB trigger in `00010` counts notes against the Free plan cap

Switching the format means a data migration, a schema change, rewriting search,
and reworking version history — for zero visible benefit to a student, since
Markdown expresses everything the toolbar will offer.

So: **the editor is WYSIWYG, the file on disk stays Markdown.** TipTap
serialises to Markdown on change; the existing 800 ms debounced autosave and
version snapshots keep working untouched.

**The constraint this imposes:** the toolbar may only offer what Markdown can
express — headings, bold, italic, strikethrough, lists, checklists, quote,
inline code, code block, link, table, image, horizontal rule. No text colour, no
font sizes, no arbitrary alignment. This is a feature, not a limitation: it
keeps notes portable and prevents a student building a document that silently
loses its formatting on next open. Round-tripping must be tested explicitly
(see Phase 5).

## Phases

Each phase is independently shippable and leaves the app working.

### Phase 0 — Spike (½ day)
Prove the round trip before committing. Take the three ugliest real notes
available, load → edit → serialise, and diff the Markdown. Confirm TipTap's
Markdown serialiser is faithful for the feature set above. **If the round trip
loses data, stop and reconsider storing ProseMirror JSON with a generated
`content_text` column for search.**

### Phase 1 — The editor component (1–2 days)
Build `src/features/notes/rich-note-editor.tsx` in isolation: TipTap instance,
Markdown in/out, styled to match the existing `prose` classes. Not wired to
anything yet.

### Phase 2 — Swap it in (1 day)
Replace the `Textarea` in `NoteEditor` (`notes-page.tsx`). Replace the
Edit/Preview toggle — with a WYSIWYG surface there is nothing to preview.
Keep a **Markdown mode** toggle for students who prefer raw source, remembered
per user in `localStorage`, mirroring the focus-mode preference.

### Phase 3 — The parts that make it feel easy (1–2 days)
- Bubble toolbar on selection (bold, italic, link, heading, list)
- Slash menu (`/heading`, `/list`, `/todo`, `/code`, `/table`) for discovery
- Paste handling from Word / Google Docs / web → clean formatting
- Placeholder text that is an invitation, not a syntax lesson

### Phase 4 — Copy that no longer says "Markdown" (½ day)
Every one of these currently tells students the editor is Markdown:
- `notes-page.tsx` — page description, empty-state body, editor dialog description
- `src/lib/tours.ts` — the `notes` tour step titled "Markdown, with history"
- `README.md` feature list
- a new entry in `src/lib/releases.ts` so students are told what changed

### Phase 5 — Verification (½ day)
- Round-trip tests: a note with every supported construct survives
  load → edit → save → reload unchanged
- Legacy notes: existing Markdown notes open correctly and are not mangled
  by simply being opened (**a no-op open must not rewrite the body or create a
  spurious version-history entry**)
- Version history: restore an old version, confirm it renders
- Search still matches text typed in the rich editor
- Keyboard: full editing without a mouse; toolbar buttons labelled
- Mobile: toolbar usable on touch, no layout overflow
- axe: no critical violations on `/app/notes`

**Estimate: 4–7 days.**

## Risks

| Risk | Mitigation |
| --- | --- |
| Markdown round-trip mangles an existing note | Phase 0 spike gates the whole plan. Version history is the safety net — a mangled note can be restored. |
| Bundle size slows the notes page | Keep it in the lazy notes chunk; measure before and after. |
| A student loses work mid-migration | No data migration happens. The format does not change, so there is nothing to migrate and nothing to roll back. |
| Power users feel downgraded | Markdown input shortcuts still work, plus an explicit Markdown mode. |
| Scope creep into a full document editor | The Markdown-expressible constraint is the scope boundary. |

## Explicitly out of scope

Real-time collaboration, comments, image uploads into notes, export to PDF/Word,
and AI writing assistance inside the editor. Each is a project of its own.

## Already shipped

**Recently saved notes on the dashboard** — done, in the same change as this
plan. The dashboard shows the four most recently updated notes; selecting one
opens it directly via `/app/notes?note=<id>`. Previews route through the shared
`notePreview()` helper in `notes-service.ts`, which is deliberately the single
place that strips Markdown syntax — when the editor changes, that is the one
function that needs to change with it.
