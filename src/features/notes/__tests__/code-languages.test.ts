import { describe, expect, it } from 'vitest'
import { CODE_LANGUAGES, detectLanguage, lowlight } from '../code-languages'
import { CODE_SAMPLES, NOT_CODE_SAMPLES } from './code-samples'

const codeCases = Object.entries(CODE_SAMPLES).flatMap(([language, samples]) =>
  (samples ?? []).map((sample) => ({ language, ...sample })),
)

const JAVA_BOX = ['public class Box {', '    private Object value;', '}'].join('\n')
const PROSE = 'Remember to revise chapter 4 before the test on Friday.'

describe('detectLanguage', () => {
  it.each(codeCases)('$language: $name', ({ language, code }) => {
    expect(detectLanguage(code)).toBe(language)
  })

  it.each(NOT_CODE_SAMPLES)('not code: $name', ({ code }) => {
    expect(detectLanguage(code)).toBeNull()
  })

  it('has nothing to go on in an empty block', () => {
    expect(detectLanguage('')).toBeNull()
    expect(detectLanguage('  \n\t ')).toBeNull()
  })

  it('calls text JSON only when it parses as JSON', () => {
    expect(detectLanguage('{"done": true}')).toBe('json')
    expect(detectLanguage('{ done: true }')).not.toBe('json')
  })

  it('still answers for a very long block', () => {
    expect(detectLanguage(JAVA_BOX + '\n' + '// more\n'.repeat(5000))).toBe('java')
  })
})

describe('highlighting with nothing chosen', () => {
  it('colours code as the language detected', () => {
    const tree = lowlight.highlightAuto(JAVA_BOX)
    expect(tree.data?.language).toBe('java')
    expect(tree.children.length).toBeGreaterThan(0)
  })

  it('leaves text it cannot place uncoloured, rather than guess', () => {
    expect(lowlight.highlightAuto(PROSE).children).toEqual([])
  })
})

describe('the language list', () => {
  it('has a grammar for every language it offers', () => {
    for (const { value } of CODE_LANGUAGES) expect(lowlight.registered(value), value).toBe(true)
  })

  it('offers every language the detector can name', () => {
    const offered = CODE_LANGUAGES.map((entry) => entry.value as string)
    for (const language of Object.keys(CODE_SAMPLES)) expect(offered).toContain(language)
  })
})
