/**
 * Squads: the limits and the rules for names, handles and join codes.
 *
 * The database is the authority (migration 00020): every squad write is a
 * function that checks these again. This copy lets a form say what is wrong
 * before the request goes, and runs demo mode. `squads-sql.test.ts` holds the
 * two to the same numbers and the same sentences.
 */

/** Below this a squad is still forming: it works, but asks for more members. */
export const SQUAD_MIN = 3
/** Enforced by a trigger, so it holds for every writer (`SQ001`). */
export const SQUAD_MAX = 6

/** No 0/O, 1/I/L: codes are read aloud and typed from phone screens. */
export const SQUAD_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const SQUAD_CODE_LENGTH = 8

/** Wrong join codes allowed per hour before joining is refused. */
export const JOIN_FAILURES_PER_HOUR = 10

export const SQUAD_NAME_LENGTH = { min: 2, max: 40 } as const
export const HANDLE_PATTERN = /^[A-Za-z0-9_]{3,20}$/

/** The sentences the database uses, word for word. */
export const SQUAD_MESSAGES = {
  name: 'A squad name is 2 to 40 characters.',
  handle: 'A handle is 3 to 20 letters, numbers or underscores.',
  alreadyInToStart: "You're already in a squad. Leave it before starting another.",
  alreadyInToJoin: "You're already in a squad. Leave it before joining another.",
  wrongCode: 'No squad has that code. Check it with whoever sent it.',
  tooManyWrong: 'Too many wrong codes. Try again in an hour.',
  full: `That squad is full (${SQUAD_MAX} of ${SQUAD_MAX}).`,
  notInSquad: "You're not in a squad.",
  ownerOnly: "Only the squad's owner can do that.",
  noSuchHandle: 'Nobody in your squad goes by that handle.',
  removeSelf: 'To go yourself, leave the squad.',
  handleTaken: (handle: string) => `Someone in that squad already goes by "${handle}". Pick another handle.`,
} as const

/** A code as typed — any case, with dashes or spaces — as the database reads it. */
export function normalizeCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

/** "ABCD-EFGH": easier to read out than eight characters in a row. */
export function formatCode(code: string): string {
  return code.length === SQUAD_CODE_LENGTH ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

/** Trimmed, with runs of spaces collapsed, as squad_check_name() stores it. */
export function tidyName(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

/** What is wrong with a squad name, or null. */
export function nameProblem(input: string): string | null {
  const name = tidyName(input)
  return name.length < SQUAD_NAME_LENGTH.min || name.length > SQUAD_NAME_LENGTH.max ? SQUAD_MESSAGES.name : null
}

/** What is wrong with a handle, or null. */
export function handleProblem(input: string): string | null {
  return HANDLE_PATTERN.test(input.trim()) ? null : SQUAD_MESSAGES.handle
}

export interface Ranked<Row> {
  row: Row
  /** 1-based; equal XP shares a rank, and the next rank skips (1, 1, 3). */
  rank: number
}

/** Standings by weekly XP, highest first, ties sharing a place. */
export function rankStandings<Row extends { weeklyXp: number; handle: string }>(rows: Row[]): Ranked<Row>[] {
  const sorted = [...rows].sort(
    (a, b) => b.weeklyXp - a.weeklyXp || a.handle.toLowerCase().localeCompare(b.handle.toLowerCase()),
  )
  return sorted.map((row) => ({ row, rank: sorted.findIndex((other) => other.weeklyXp === row.weeklyXp) + 1 }))
}

/** "1st", "2nd", "3rd", "4th"… for "You're 2nd of 5 this week". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** A fresh join code, for demo mode: uniform over the alphabet (rejection sampling). */
export function randomCode(
  random: (count: number) => ArrayLike<number> = (count) => crypto.getRandomValues(new Uint8Array(count)),
): string {
  const limit = 256 - (256 % SQUAD_CODE_ALPHABET.length)
  let code = ''
  while (code.length < SQUAD_CODE_LENGTH) {
    for (const byte of Array.from(random(16))) {
      if (byte >= limit) continue
      code += SQUAD_CODE_ALPHABET[byte % SQUAD_CODE_ALPHABET.length]
      if (code.length === SQUAD_CODE_LENGTH) break
    }
  }
  return code
}
