import { describe, expect, it } from 'vitest'
import { notePreview, searchNotes } from '@/services/notes-service'
import type { Note } from '@/types/models'

const NL = String.fromCharCode(10)
/** A literal backslash, spelled out so no escape layer can mangle it. */
const BS = String.fromCharCode(92)
/** How a note refers to an image pasted into it. */
const PASTED = 'note-image:1b4e28ba-2fa1-41d2-883f-0016d3cca427.png'

const preview = (content_md: string) => notePreview({ content_md })

describe('notePreview', () => {
  it('drops checklist boxes instead of leaking an x for ticked items', () => {
    // Regression: previewed as "- Read chapter 4 - x Submit lab report".
    expect(preview('- [ ] Read chapter 4' + NL + NL + '- [x] Submit lab report')).toBe(
      'Read chapter 4 Submit lab report',
    )
  })

  it('handles an upper-case X and nested sub-tasks', () => {
    expect(preview('- [X] Parent' + NL + '  - [ ] Child')).toBe('Parent Child')
  })

  it('drops ordinary bullets too', () => {
    expect(preview('- no heuristic' + NL + '* optimal')).toBe('no heuristic optimal')
  })

  it('keeps a character the editor escaped to keep it literal', () => {
    // Regression: "A\*" previewed as "A\".
    expect(preview('Compare A' + BS + '* and B' + BS + '*')).toBe('Compare A* and B*')
  })

  it('still strips formatting syntax', () => {
    expect(preview('# Title' + NL + NL + '**bold** and _italic_ > quoted')).toBe(
      'Title bold and italic quoted',
    )
  })

  it('leaves a hyphen that is not a bullet alone', () => {
    expect(preview('A well-known result - not a list')).toBe('A well-known result - not a list')
  })

  it('drops code fences and their language tag', () => {
    // Regression: a Java block previewed as "java public class Box {}".
    const fence = String.fromCharCode(96).repeat(3)
    expect(preview(fence + 'java' + NL + 'public class Box {}' + NL + fence)).toBe('public class Box {}')
  })

  it("shows an image's description, never its address", () => {
    expect(preview('Cell diagram:' + NL + NL + '![Plant cell](' + PASTED + ')' + NL + NL + 'Label it.')).toBe(
      'Cell diagram: Plant cell Label it.',
    )
    expect(preview('![](' + PASTED + ')' + NL + NL + 'Caption')).toBe('Caption')
  })
})

describe('searchNotes', () => {
  const noteWith = (content_md: string) =>
    ({ id: 'n1', title: 'Biology', content_md, tags: [] }) as unknown as Note

  it("does not match the address of an image the student pasted", () => {
    const notes = [noteWith('![](' + PASTED + ')')]
    expect(searchNotes(notes, 'note')).toEqual([])
    expect(searchNotes(notes, 'png')).toEqual([])
  })

  it("still finds a note by an image's description", () => {
    const notes = [noteWith('![Plant cell](' + PASTED + ')')]
    expect(searchNotes(notes, 'plant cell')).toEqual(notes)
  })
})
