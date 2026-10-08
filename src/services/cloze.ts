/**
 * Turning prose into fill-in-the-blank questions, with no model behind it.
 *
 * This is how demo mode — and any browser without a Gemini key — still gets a
 * quiz out of a student's own notes. Written for the old offline coach and kept
 * when that was removed, because the reasoning below was learned the hard way.
 */

/** Sentences worth quizzing: long enough to have a removable word in them. */
export function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(' ').length >= 5)
}

/** One sentence with its longest word blanked out, or null if nothing fits. */
export function clozeQuestion(sentence: string): { question: string; answer: string } | null {
  const words = sentence.split(' ')
  const candidates = words
    .map((word, index) => ({ word: word.replace(/[^\p{L}\p{N}-]/gu, ''), index }))
    .filter(({ word }) => word.length >= 6)
    .sort((a, b) => b.word.length - a.word.length)
  // Blanking the opening word leaves a stem like "_____ the process by which…",
  // which reads as broken grammar rather than a question. Prefer a word further
  // in, and only fall back to the first if it is the sole candidate.
  const target = candidates.find(({ index }) => index > 0) ?? candidates[0]
  if (!target) return null
  const blanked = words
    .map((word, index) => (index === target.index ? '_____' : word))
    .join(' ')
  return { question: blanked, answer: target.word }
}
