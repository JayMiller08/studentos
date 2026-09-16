import { describe, expect, it } from 'vitest'
import { notePreview } from '@/services/notes-service'

const NL = String.fromCharCode(10)
/** A literal backslash, spelled out so no escape layer can mangle it. */
const BS = String.fromCharCode(92)

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
})
