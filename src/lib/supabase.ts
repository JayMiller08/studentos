import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from '@/lib/env'

const REMEMBER_KEY = 'studentos.auth.remember'

/**
 * "Remember me" support: the session token is kept in localStorage when the
 * user opts in (survives browser restarts) and in sessionStorage otherwise.
 * The preference flag itself always lives in localStorage so the adapter can
 * decide where to look on cold start.
 */
export function setRememberMe(remember: boolean): void {
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
}

function activeStore(): Storage {
  return localStorage.getItem(REMEMBER_KEY) === '0' ? sessionStorage : localStorage
}

const dynamicStorage = {
  getItem: (key: string) => activeStore().getItem(key) ?? null,
  setItem: (key: string, value: string) => {
    activeStore().setItem(key, value)
  },
  removeItem: (key: string) => {
    // Clear both stores so switching the preference never leaves a stale session.
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
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
