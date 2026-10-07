/**
 * Test doubles for running Supabase Edge Functions under Vitest.
 *
 * The functions are Deno programs: they call `Deno.serve(handler)` when
 * imported and build clients with supabase-js. `installDeno` captures the
 * handler so a test can call it with a real `Request`; `fakeSupabase` is an
 * in-memory stand-in for the two clients the functions create — the caller's
 * (anon key + JWT) and the service role's — backed by one shared table store.
 */

export type Row = Record<string, unknown>

export interface FakeStore {
  tables: Record<string, Row[]>
  /** JWT -> user id. A token not listed here is rejected by auth.getUser(). */
  tokens: Record<string, string>
  /** Every `rpc()` call, in order, for asserting what the function asked for. */
  rpcCalls: Array<{ name: string; args: Row }>
  /** Force the next insert into this table to fail. */
  failInsertInto?: string
  /** Force the next call to this function to fail. */
  failRpc?: string
  /** Storage objects, keyed `<bucket>/<path>`. */
  files?: Record<string, Uint8Array>
}

type Handler = (req: Request) => Response | Promise<Response>

export function installDeno(env: Record<string, string | undefined>) {
  const captured: { handler: Handler | null } = { handler: null }
  ;(globalThis as { Deno?: unknown }).Deno = {
    serve: (handler: Handler) => {
      captured.handler = handler
    },
    env: { get: (key: string) => env[key] },
  }
  return captured
}

let nextId = 1
function newId() {
  return `row-${nextId++}`
}

type Filter = [column: string, value: unknown, op?: 'eq' | 'in']

function matches(row: Row, filters: Filter[]) {
  return filters.every(([column, value, op]) =>
    op === 'in' ? (value as unknown[]).includes(row[column]) : row[column] === value,
  )
}

function builder(store: FakeStore, table: string) {
  const state = {
    op: 'select' as 'select' | 'insert' | 'delete' | 'update',
    filters: [] as Filter[],
    payload: null as Row | Row[] | null,
    returning: false,
    single: false,
    maybeSingle: false,
    order: null as string | null,
    limit: null as number | null,
  }

  function run() {
    const rows = (store.tables[table] ??= [])
    if (state.op === 'insert') {
      if (store.failInsertInto === table) {
        store.failInsertInto = undefined
        return { data: null, error: { message: `insert into ${table} failed`, code: 'XX000' } }
      }
      const incoming = Array.isArray(state.payload) ? state.payload : [state.payload!]
      const inserted = incoming.map((row) => ({ id: newId(), ...row }))
      rows.push(...inserted)
      if (!state.returning) return { data: null, error: null }
      return { data: state.single ? inserted[0] : inserted, error: null }
    }
    if (state.op === 'delete') {
      store.tables[table] = rows.filter((row) => !matches(row, state.filters))
      return { data: null, error: null }
    }
    if (state.op === 'update') {
      const changed = rows.filter((row) => matches(row, state.filters))
      for (const row of changed) Object.assign(row, state.payload)
      return { data: state.returning ? changed : null, error: null }
    }
    let found = rows.filter((row) => matches(row, state.filters))
    if (state.order) {
      const key = state.order
      found = [...found].sort((a, b) => Number(a[key]) - Number(b[key]))
    }
    if (state.single) {
      return found[0]
        ? { data: found[0], error: null }
        : { data: null, error: { message: 'no rows', code: 'PGRST116' } }
    }
    if (state.maybeSingle) return { data: found[0] ?? null, error: null }
    if (state.limit !== null) found = found.slice(0, state.limit)
    return { data: found, error: null }
  }

  const api = {
    select(_columns?: string) {
      if (state.op === 'insert') state.returning = true
      return api
    },
    insert(payload: Row | Row[]) {
      state.op = 'insert'
      state.payload = payload
      return api
    },
    delete() {
      state.op = 'delete'
      return api
    },
    update(payload: Row) {
      state.op = 'update'
      state.payload = payload
      return api
    },
    eq(column: string, value: unknown) {
      state.filters.push([column, value])
      return api
    },
    in(column: string, values: unknown[]) {
      state.filters.push([column, values, 'in'])
      return api
    },
    limit(count: number) {
      state.limit = count
      return api
    },
    order(column: string) {
      state.order = column
      return api
    },
    single() {
      state.single = true
      return api
    },
    maybeSingle() {
      state.maybeSingle = true
      return api
    },
    then<T>(resolve: (value: ReturnType<typeof run>) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve(run()).then(resolve, reject)
    },
  }
  return api
}

/**
 * Mirrors `award_xp()` from migration 00014: idempotent on
 * (user, event, source) and levelling by floor(sqrt(xp / 100)) + 1. The SQL
 * itself is exercised against real Postgres separately; this only needs to
 * behave the same way from the function's point of view.
 */
function awardXp(store: FakeStore, args: Row) {
  const ledger = (store.tables.xp_ledger ??= [])
  const profile = (store.tables.profiles ?? []).find((row) => row.id === args.p_user_id)
  const duplicate = ledger.some(
    (row) =>
      row.user_id === args.p_user_id && row.event === args.p_event && row.source_id === args.p_source_id,
  )
  const amount = Math.max(0, Number(args.p_amount) || 0)
  if (!duplicate) {
    ledger.push({ id: newId(), user_id: args.p_user_id, event: args.p_event, source_id: args.p_source_id, amount })
    if (profile) {
      profile.xp = Number(profile.xp ?? 0) + amount
      profile.level = Math.floor(Math.sqrt(Number(profile.xp) / 100)) + 1
    }
  }
  return {
    data: [{ awarded: duplicate ? 0 : amount, total_xp: profile?.xp ?? 0, new_level: profile?.level ?? 1 }],
    error: null,
  }
}

/**
 * Mirrors `touch_streak()` from migration 00016 far enough for a caller: the
 * first activity of a day moves the streak on by one, later ones change
 * nothing. The real rules — freezes, gaps, timezones — are exercised against
 * Postgres; parity with advanceStreak() is a separate test.
 */
export const FAKE_TODAY = '2026-10-07'

function touchStreak(store: FakeStore, args: Row) {
  const profile = (store.tables.profiles ?? []).find((row) => row.id === args.p_user_id)
  if (!profile) return { data: [], error: null }
  const today = FAKE_TODAY
  const changed = profile.last_active_date !== today
  if (changed) {
    profile.current_streak = Number(profile.current_streak ?? 0) + 1
    profile.longest_streak = Math.max(Number(profile.longest_streak ?? 0), Number(profile.current_streak))
    profile.last_active_date = today
  }
  return {
    data: [
      {
        streak: profile.current_streak,
        best_streak: profile.longest_streak,
        freezes: profile.streak_freezes ?? 1,
        active_on: profile.last_active_date,
        used_freeze: false,
        earned_freeze: false,
        changed,
      },
    ],
    error: null,
  }
}

/**
 * Mirrors `begin_quiz_generation()` from migration 00018: the month's
 * allowance by plan, counted from charged quiz rows on the meter, refused with
 * AI001 and the student's sentence; otherwise a queued job and one charge.
 * Stale-job recovery and the month boundary are tested against Postgres.
 */
export const FAKE_ALLOWANCE: Record<string, number> = { free: 3, pro: 40, elite: 150 }

function beginQuizGeneration(store: FakeStore, args: Row) {
  const profile = (store.tables.profiles ?? []).find((row) => row.id === args.p_user_id)
  const plan = String(profile?.plan ?? 'free')
  const limit = FAKE_ALLOWANCE[plan] ?? 3
  const usage = (store.tables.ai_usage ??= [])
  const used = usage.filter((row) => row.user_id === args.p_user_id && row.kind === 'quiz' && row.charged !== false).length
  if (used >= limit) {
    return {
      data: null,
      error: { message: `You have used your ${limit} AI quizzes for this month.`, code: 'AI001' },
    }
  }
  const id = newId()
  ;(store.tables.quiz_generations ??= []).push({
    id,
    user_id: args.p_user_id,
    resource_id: args.p_resource_id ?? null,
    note_id: args.p_note_id ?? null,
    title: args.p_title,
    options: args.p_options,
    status: 'queued',
    quiz_id: null,
    error: null,
  })
  usage.push({ id: newId(), user_id: args.p_user_id, kind: 'quiz', source_id: id, charged: true })
  return { data: id, error: null }
}

/** Mirrors `begin_outline()`: 20 readings a day, then AI001. */
function beginOutline(store: FakeStore, args: Row) {
  const usage = (store.tables.ai_usage ??= [])
  const used = usage.filter((row) => row.user_id === args.p_user_id && row.kind === 'outline').length
  if (used >= 20) {
    return { data: null, error: { message: 'You have added 20 files today. Try again tomorrow.', code: 'AI001' } }
  }
  usage.push({ id: newId(), user_id: args.p_user_id, kind: 'outline', source_id: args.p_resource_id, charged: true })
  return { data: null, error: null }
}

export function fakeSupabase(store: FakeStore) {
  return function createClient(_url: string, _key: string, options?: { global?: { headers?: Row } }) {
    const authHeader = String(options?.global?.headers?.Authorization ?? '')
    const token = authHeader.replace(/^Bearer\s+/i, '')
    return {
      auth: {
        async getUser() {
          const id = store.tokens[token]
          return id
            ? { data: { user: { id } }, error: null }
            : { data: { user: null }, error: { message: 'invalid JWT' } }
        },
      },
      from: (table: string) => builder(store, table),
      storage: {
        from: (bucket: string) => ({
          async download(path: string) {
            const bytes = store.files?.[`${bucket}/${path}`]
            return bytes
              ? { data: new Blob([bytes as Uint8Array<ArrayBuffer>]), error: null }
              : { data: null, error: { message: 'Object not found' } }
          },
        }),
      },
      async rpc(name: string, args: Row) {
        store.rpcCalls.push({ name, args })
        if (store.failRpc === name) {
          store.failRpc = undefined
          return { data: null, error: { message: `${name} failed`, code: 'XX000' } }
        }
        if (name === 'award_xp') return awardXp(store, args)
        if (name === 'touch_streak') return touchStreak(store, args)
        if (name === 'begin_quiz_generation') return beginQuizGeneration(store, args)
        if (name === 'begin_outline') return beginOutline(store, args)
        return { data: null, error: { message: `unknown rpc ${name}` } }
      },
    }
  }
}

export function post(body: unknown, token?: string, method = 'POST') {
  return new Request('https://functions.test/fn', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === 'GET' || method === 'OPTIONS' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}
