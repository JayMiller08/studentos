import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from '@/lib/env'

const REMEMBER_KEY = 'studentos.auth.remember'

/** The slice of `Storage` the auth adapter actually uses. */
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/**
 * Last-resort store for environments with no Web Storage: unit tests and
 * SSR-style tooling, and browsers where site data is blocked (there, *touching*
 * `localStorage` throws rather than returning undefined). supabase-js probes
 * for a session as soon as the client is constructed, so without this the
 * probe becomes an unhandled rejection before any app code runs.
 */
const memory = new Map<string, string>()
const memoryStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value)
  },
  removeItem: (key) => {
    memory.delete(key)
  },
}

function webStorage(kind: 'local' | 'session'): StorageLike {
  try {
    const store = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage
    return store ?? memoryStorage
  } catch {
    return memoryStorage
  }
}

/**
 * "Remember me" support: the session token is kept in localStorage when the
 * user opts in (survives browser restarts) and in sessionStorage otherwise.
 * The preference flag itself always lives in localStorage so the adapter can
 * decide where to look on cold start.
 */
export function setRememberMe(remember: boolean): void {
  webStorage('local').setItem(REMEMBER_KEY, remember ? '1' : '0')
}

function activeStore(): StorageLike {
  const local = webStorage('local')
  return local.getItem(REMEMBER_KEY) === '0' ? webStorage('session') : local
}

const dynamicStorage = {
  getItem: (key: string) => activeStore().getItem(key) ?? null,
  setItem: (key: string, value: string) => {
    activeStore().setItem(key, value)
  },
  removeItem: (key: string) => {
    // Clear both stores so switching the preference never leaves a stale session.
    webStorage('local').removeItem(key)
    webStorage('session').removeItem(key)
  },
}

/**
 * Singleton Supabase client, or `null` in local demo mode.
 * The anon key is safe to ship to browsers — Row Level Security is the
 * enforcement boundary for every table.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl as string, env.supabaseAnonKey as string, {
      auth: {
        storage: dynamicStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null

/** Use in code paths that are only reachable when Supabase is configured. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. This action requires a connected backend.')
  }
  return supabase
}

export { isSupabaseConfigured }
