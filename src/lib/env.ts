import { z } from 'zod'

/**
 * Runtime-validated environment configuration.
 * Supabase credentials are optional: when absent the app runs in
 * "local demo mode" (device-local persistence, simulated auth).
 */
const EnvSchema = z.object({
  supabaseUrl: z.url().optional(),
  supabaseAnonKey: z.string().min(20).optional(),
  appUrl: z.url(),
  appEnv: z.enum(['development', 'preview', 'production']),
})

export type Env = z.infer<typeof EnvSchema>

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse({
    supabaseUrl: normalize(import.meta.env.VITE_SUPABASE_URL),
    supabaseAnonKey: normalize(import.meta.env.VITE_SUPABASE_ANON_KEY),
    appUrl: normalize(import.meta.env.VITE_APP_URL) ?? window.location.origin,
    appEnv: normalize(import.meta.env.VITE_APP_ENV) ?? (import.meta.env.DEV ? 'development' : 'production'),
  })

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment configuration — ${issues}`)
  }

  // Misconfiguration guard: providing only one half of the Supabase pair is
  // almost certainly a deploy mistake; fail loudly instead of silently
  // falling back to demo mode in production.
  const { supabaseUrl, supabaseAnonKey } = parsed.data
  if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
    throw new Error(
      'Invalid environment configuration — VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set together.',
    )
  }

  return parsed.data
}

export const env: Env = loadEnv()

export const isSupabaseConfigured: boolean = Boolean(env.supabaseUrl && env.supabaseAnonKey)
