import { env, isSupabaseConfigured } from '@/lib/env'
import { setRememberMe, supabase } from '@/lib/supabase'

/**
 * Authentication facade.
 * Wraps Supabase Auth when configured; provides a device-local simulated
 * session in demo mode so the whole product can be exercised without a
 * backend. All UI goes through this module — swapping the provider (or
 * adding OAuth) is a change in exactly one place.
 */

export interface AuthUser {
  id: string
  email: string
  emailConfirmed: boolean
  /** Only present right after sign-up (used to seed the profile). */
  fullName?: string
}

const DEMO_USER_KEY = 'studentos.demo.user'
const DEMO_EVENT = 'studentos:demo-auth-change'
/** Stable UUID for the demo user so all local rows relate consistently. */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001'

type AuthChangeCallback = (user: AuthUser | null) => void

function readDemoUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

function writeDemoUser(user: AuthUser | null): void {
  if (user) localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(DEMO_USER_KEY)
  window.dispatchEvent(new Event(DEMO_EVENT))
}

function mapSupabaseUser(user: {
  id: string
  email?: string
  email_confirmed_at?: string | null
  user_metadata?: Record<string, unknown>
}): AuthUser {
  return {
    id: user.id,
    email: user.email ?? '',
    emailConfirmed: Boolean(user.email_confirmed_at),
    fullName:
      typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined,
  }
}

const redirectBase = env.appUrl.replace(/\/$/, '')

export const authService = {
  isDemo: !isSupabaseConfigured,

  async getUser(): Promise<AuthUser | null> {
    if (!supabase) return readDemoUser()
    const { data } = await supabase.auth.getSession()
    return data.session?.user ? mapSupabaseUser(data.session.user) : null
  },

  onAuthStateChange(callback: AuthChangeCallback): () => void {
    if (!supabase) {
      const handler = () => callback(readDemoUser())
      window.addEventListener(DEMO_EVENT, handler)
      window.addEventListener('storage', handler)
      return () => {
        window.removeEventListener(DEMO_EVENT, handler)
        window.removeEventListener('storage', handler)
      }
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ? mapSupabaseUser(session.user) : null)
    })
    return () => data.subscription.unsubscribe()
  },

  async signIn(email: string, password: string, remember: boolean): Promise<void> {
    if (!supabase) {
      writeDemoUser({ id: DEMO_USER_ID, email, emailConfirmed: true })
      return
    }
    setRememberMe(remember)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  },

  /** Returns true when email confirmation is pending (Supabase double-opt-in). */
  async signUp(email: string, password: string, fullName: string): Promise<{ needsVerification: boolean }> {
    if (!supabase) {
      writeDemoUser({ id: DEMO_USER_ID, email, emailConfirmed: true, fullName })
      return { needsVerification: false }
    }
    setRememberMe(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${redirectBase}/auth/callback`,
        data: { full_name: fullName },
      },
    })
    if (error) throw new Error(error.message)
    return { needsVerification: !data.session }
  },

  /**
   * Start the Google OAuth flow. Redirects the browser to Google and back to
   * `/auth/callback`, where the PKCE code is exchanged for a session. Not
   * available in demo mode (there is no backend to broker the exchange).
   */
  async signInWithGoogle(): Promise<void> {
    if (!supabase) {
      throw new Error(
        'Google sign-in needs a connected backend. In local demo mode, use an email and password instead.',
      )
    }
    // OAuth sessions should persist across restarts.
    setRememberMe(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${redirectBase}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    // On success the browser navigates away; only errors return here.
    if (error) throw new Error(error.message)
  },

  async signOut(): Promise<void> {
    if (!supabase) {
      writeDemoUser(null)
      return
    }
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
  },

  async requestPasswordReset(email: string): Promise<void> {
    if (!supabase) return // Demo mode: nothing to reset; UI explains this.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${redirectBase}/auth/reset-password`,
    })
    if (error) throw new Error(error.message)
  },

  async updatePassword(newPassword: string): Promise<void> {
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(error.message)
  },

  async resendVerification(email: string): Promise<void> {
    if (!supabase) return
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${redirectBase}/auth/callback` },
    })
    if (error) throw new Error(error.message)
  },
}
