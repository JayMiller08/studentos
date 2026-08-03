import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Covers the Edge Function's Gemini client.
 *
 * It lives under src/ because vitest only collects `src/**\/*.test.ts`, and it
 * shims the single Deno global that module reads at load time. Worth the
 * awkward import path: a malformed request body here is invisible until a
 * student attaches a document and the model answers from something else.
 */
const ENV: Record<string, string> = { GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-2.5-flash' }
;(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (key: string) => ENV[key] } }

const { generate, GeminiError } = await import('../../../supabase/functions/_shared/gemini.ts')

interface GeminiPart {
  text?: string
  inlineData?: { mimeType: string; data: string }
}
interface GeminiContent {
  role: string
  parts: GeminiPart[]
}

function stubFetch(payload: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

function replyWith(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] }
}

function sentBody(spy: ReturnType<typeof stubFetch>) {
  return JSON.parse(spy.mock.calls[0]![1].body) as {
    systemInstruction: { parts: Array<{ text: string }> }
    contents: GeminiContent[]
    generationConfig: Record<string, unknown>
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('the Gemini request body', () => {
  it('sends the system prompt under the camelCase key', async () => {
    // snake_case is also accepted by the proto parser, but mixing the two is
    // how a field silently goes missing.
    const spy = stubFetch(replyWith('ok'))
    await generate({ system: 'BE A COACH', messages: [{ role: 'user', content: 'hi' }] })
    expect(sentBody(spy).systemInstruction.parts[0]?.text).toBe('BE A COACH')
  })

  it('maps the assistant turn to Gemini’s "model" role', async () => {
    const spy = stubFetch(replyWith('ok'))
    await generate({
      system: 's',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' },
        { role: 'user', content: 'q2' },
      ],
    })
    expect(sentBody(spy).contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
  })

  it('attaches files as inlineData on the user turn', async () => {
    const spy = stubFetch(replyWith('ok'))
    await generate({
      system: 's',
      messages: [
        {
          role: 'user',
          content: 'summarise this',
          files: [{ name: 'notes.pdf', mimeType: 'application/pdf', data: 'BASE64' }],
        },
      ],
    })
    const parts = sentBody(spy).contents[0]!.parts
    expect(parts[0]?.text).toBe('summarise this')
    expect(parts[1]?.inlineData).toEqual({ mimeType: 'application/pdf', data: 'BASE64' })
  })

  it('omits the text part when a file is sent with no message', async () => {
    // An empty text part can make Gemini treat the turn as contentless and
    // answer the system prompt — i.e. summarise the dashboard, not the file.
    const spy = stubFetch(replyWith('ok'))
    await generate({
      system: 's',
      messages: [
        {
          role: 'user',
          content: '   ',
          files: [{ name: 'slides.pdf', mimeType: 'application/pdf', data: 'B64' }],
        },
      ],
    })
    const parts = sentBody(spy).contents[0]!.parts
    expect(parts).toHaveLength(1)
    expect(parts[0]?.inlineData).toBeDefined()
    expect(parts[0]?.text).toBeUndefined()
  })

  it('still sends a text part when there is nothing attached', async () => {
    const spy = stubFetch(replyWith('ok'))
    await generate({ system: 's', messages: [{ role: 'user', content: '' }] })
    expect(sentBody(spy).contents[0]!.parts).toEqual([{ text: '' }])
  })

  it('never attaches files to a model turn', async () => {
    // Gemini rejects inline data on a model turn.
    const spy = stubFetch(replyWith('ok'))
    await generate({
      system: 's',
      messages: [
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: 'a',
          files: [{ name: 'x.pdf', mimeType: 'application/pdf', data: 'B64' }],
        },
      ],
    })
    const modelTurn = sentBody(spy).contents.find((c) => c.role === 'model')!
    expect(modelTurn.parts.some((p) => p.inlineData)).toBe(false)
  })

  it('drops leading model turns so the conversation opens on the user', async () => {
    const spy = stubFetch(replyWith('ok'))
    await generate({
      system: 's',
      messages: [
        { role: 'assistant', content: 'orphaned reply' },
        { role: 'user', content: 'real question' },
      ],
    })
    const contents = sentBody(spy).contents
    expect(contents).toHaveLength(1)
    expect(contents[0]?.role).toBe('user')
  })
})

describe('the thinking budget', () => {
  it('always caps reasoning, because it is deducted from maxOutputTokens', async () => {
    // Left on "dynamic" the model can spend the whole ceiling reasoning about
    // a long document and get cut off mid-answer.
    const spy = stubFetch(replyWith('ok'))
    await generate({ system: 's', messages: [{ role: 'user', content: 'q' }] })
    const config = sentBody(spy).generationConfig as {
      thinkingConfig?: { thinkingBudget?: number }
    }
    expect(config.thinkingConfig?.thinkingBudget).toBeGreaterThan(0)
  })

  it('leaves most of the ceiling for the answer', async () => {
    const spy = stubFetch(replyWith('ok'))
    await generate({
      system: 's',
      messages: [{ role: 'user', content: 'q' }],
      maxOutputTokens: 12288,
    })
    const config = sentBody(spy).generationConfig as {
      maxOutputTokens: number
      thinkingConfig: { thinkingBudget: number }
    }
    expect(config.thinkingConfig.thinkingBudget).toBeLessThan(config.maxOutputTokens / 2)
  })

  it('lets a caller lower it for short structured output', async () => {
    const spy = stubFetch(replyWith('{}'))
    await generate({
      system: 's',
      messages: [{ role: 'user', content: 'q' }],
      thinkingBudget: 512,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    })
    const config = sentBody(spy).generationConfig as {
      thinkingConfig: { thinkingBudget: number }
    }
    expect(config.thinkingConfig.thinkingBudget).toBe(512)
  })

  it('never sends 0, which 2.5 Pro rejects', async () => {
    // Flash accepts 0 to disable thinking; Pro's minimum is 128, and the model
    // is deployment-configurable.
    const spy = stubFetch(replyWith('ok'))
    await generate({ system: 's', messages: [{ role: 'user', content: 'q' }] })
    const config = sentBody(spy).generationConfig as {
      thinkingConfig: { thinkingBudget: number }
    }
    expect(config.thinkingConfig.thinkingBudget).not.toBe(0)
  })
})

describe('a truncated answer', () => {
  it('tells the student instead of stopping mid-sentence', async () => {
    stubFetch({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'The key idea is' }] } }],
    })
    const reply = await generate({ system: 's', messages: [{ role: 'user', content: 'q' }] })
    expect(reply).toContain('The key idea is')
    expect(reply).toContain('length limit')
  })

  it('leaves JSON responses untouched so they still parse', async () => {
    stubFetch({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"notes":[]}' }] } }],
    })
    const reply = await generate({
      system: 's',
      messages: [{ role: 'user', content: 'q' }],
      responseMimeType: 'application/json',
    })
    expect(() => JSON.parse(reply)).not.toThrow()
  })
})

describe('the Gemini response', () => {
  it('concatenates every text part', async () => {
    stubFetch({ candidates: [{ content: { parts: [{ text: 'one ' }, { text: 'two' }] } }] })
    await expect(generate({ system: 's', messages: [{ role: 'user', content: 'q' }] })).resolves.toBe(
      'one two',
    )
  })

  it('reports a safety block rather than an empty answer', async () => {
    // SAFETY arrives as an empty candidate, not an HTTP error.
    stubFetch({ candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] })
    await expect(
      generate({ system: 's', messages: [{ role: 'user', content: 'q' }] }),
    ).rejects.toThrow(GeminiError)
  })

  it('surfaces a blocked prompt', async () => {
    stubFetch({ promptFeedback: { blockReason: 'OTHER' } })
    await expect(
      generate({ system: 's', messages: [{ role: 'user', content: 'q' }] }),
    ).rejects.toThrow(/safety filters/)
  })

  it('treats a 429 as retryable rather than a hard failure', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    })
    vi.stubGlobal('fetch', spy)
    await expect(
      generate({ system: 's', messages: [{ role: 'user', content: 'q' }] }),
    ).rejects.toThrow(/busy/)
  })
})
