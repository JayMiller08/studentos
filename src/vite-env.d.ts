/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** Supabase project URL. When absent the app runs in local demo mode. */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon (publishable) key. Safe to expose to the browser; RLS enforces access. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Public site URL used for auth redirects (differs per environment). */
  readonly VITE_APP_URL?: string
  /** Optional: environment name surfaced in diagnostics. */
  readonly VITE_APP_ENV?: 'development' | 'preview' | 'production'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
