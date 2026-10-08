import { vi } from 'vitest'

/**
 * A stand-in for the Gemini API, for Edge Function tests.
 *
 * Routes by what a real request would carry: Files API uploads by URL, and
 * generateContent calls by their system instruction — writing a quiz, checking
 * one, or outlining a file — so a test says what each step answers and can
 * read back exactly what each step was sent.
 */

export interface GeminiCall {
  kind: 'write' | 'check' | 'outline' | 'other'
  /** The user turn's text. */
  text: string
  /** fileData parts, in order. */
  files: Array<{ fileUri: string; mimeType: string }>
  body: Record<string, unknown>
}

export interface GeminiScript {
  /** The writing step's reply: an object (sent as JSON) or raw text. */
  write?: unknown
  /**
   * The checking step: given the questions it was sent, return the option
   * index it would choose for each — or raw text to send as-is.
   */
  check?: ((questions: Array<{ question: number; prompt: string; options: string[] }>) => number[]) | string
  outline?: unknown
  /** HTTP status for generateContent, to simulate the service failing. */
  status?: number
}

export interface GeminiFake {
  calls: GeminiCall[]
  uploads: Array<{ mimeType: string; bytes: number; displayName: string }>
  deleted: string[]
}

const reply = (text: string, status = 200) =>
  new Response(
    status === 200
      ? JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] })
      : JSON.stringify({ error: { message: 'busy' } }),
    { status, headers: { 'content-type': 'application/json' } },
  )

const asText = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value))

/** Answer the check by picking each question's option that starts with "right". */
export const answerRight = (questions: Array<{ options: string[] }>) =>
  questions.map((question) => question.options.findIndex((option) => option.startsWith('right')))

export function fakeGemini(script: GeminiScript): GeminiFake {
  const fake: GeminiFake = { calls: [], uploads: [], deleted: [] }
  let uploadCount = 0
  const pending = new Map<string, { mimeType: string; displayName: string }>()

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input instanceof Request ? input.url : input)
    const method = init?.method ?? 'GET'
    const headers = new Headers(init?.headers)

    // Files API: start a resumable upload.
    if (url.includes('/upload/v1beta/files')) {
      const session = `https://upload.test/session-${++uploadCount}`
      const meta = JSON.parse(String(init?.body ?? '{}')) as { file?: { displayName?: string } }
      pending.set(session, {
        mimeType: headers.get('X-Goog-Upload-Header-Content-Type') ?? '',
        displayName: meta.file?.displayName ?? '',
      })
      return new Response('{}', { status: 200, headers: { 'x-goog-upload-url': session } })
    }
    // Files API: send the bytes and finalize.
    if (url.startsWith('https://upload.test/')) {
      const meta = pending.get(url)!
      const size = init?.body instanceof ArrayBuffer ? init.body.byteLength : 0
      fake.uploads.push({ mimeType: meta.mimeType, bytes: size, displayName: meta.displayName })
      const name = `files/f${fake.uploads.length}`
      return Response.json({
        file: { name, uri: `https://gemini.test/${name}`, mimeType: meta.mimeType, state: 'ACTIVE' },
      })
    }
    if (method === 'DELETE' && url.includes('/v1beta/files/')) {
      fake.deleted.push(url.slice(url.indexOf('files/')))
      return new Response('{}', { status: 200 })
    }

    // generateContent.
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      systemInstruction?: { parts?: Array<{ text?: string }> }
      contents?: Array<{ parts?: Array<{ text?: string; fileData?: { fileUri: string; mimeType: string } }> }>
    }
    const system = body.systemInstruction?.parts?.[0]?.text ?? ''
    const parts = body.contents?.[0]?.parts ?? []
    const call: GeminiCall = {
      kind: system.startsWith('You write multiple-choice')
        ? 'write'
        : system.startsWith('You check a quiz')
          ? 'check'
          : system.startsWith('You outline')
            ? 'outline'
            : 'other',
      text: parts.map((part) => part.text ?? '').join(''),
      files: parts.filter((part) => part.fileData).map((part) => part.fileData!),
      body: body as Record<string, unknown>,
    }
    fake.calls.push(call)
    if (script.status && script.status !== 200) return reply('', script.status)

    if (call.kind === 'write') return reply(asText(script.write ?? { questions: [] }))
    if (call.kind === 'outline') return reply(asText(script.outline ?? { isStudyMaterial: true, topics: [] }))
    if (call.kind === 'check') {
      if (typeof script.check === 'string') return reply(script.check)
      // The question list is the line after the instruction.
      const sent = JSON.parse(call.text.split('\n')[1] ?? '[]') as Array<{ question: number; prompt: string; options: string[] }>
      const choices = (script.check ?? answerRight)(sent)
      return reply(JSON.stringify({ answers: sent.map((question, index) => ({ question: question.question, choice: choices[index] })) }))
    }
    return reply('{}')
  })

  return fake
}

/** A minimal PDF: just enough for the type sniff and the page count. */
export function pdfBytes(pages: number): Uint8Array {
  const body = Array.from({ length: pages }, (_, index) => `${index + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`)
  return new TextEncoder().encode(`%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n${body.join('\n')}\n%%EOF`)
}

/** The first bytes of a JPEG. */
export function jpegBytes(): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00])
}
