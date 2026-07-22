import * as React from 'react'
import { authService, type AuthUser } from '@/services/auth-service'
import { profileService } from '@/services/profile-service'
import type { Profile } from '@/types/models'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  profile: Profile | null
  isDemo: boolean
  signIn: (email: string, password: string, remember: boolean) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsVerification: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (patch: Partial<Profile>) => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>('loading')
  const [user, setUser] = React.useState<AuthUser | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)

  const loadForUser = React.useCallback(async (nextUser: AuthUser | null) => {
    if (!nextUser) {
      setUser(null)
      setProfile(null)
      setStatus('unauthenticated')
      return
    }
    setUser(nextUser)
    try {
      const nextProfile = await profileService.ensure(nextUser)
      setProfile(nextProfile)
    } catch (error) {
      console.error('[auth] failed to load profile', error)
      setProfile(null)
    }
    setStatus('authenticated')
  }, [])

  React.useEffect(() => {
    let cancelled = false

    void authService.getUser().then((initialUser) => {
      if (!cancelled) void loadForUser(initialUser)
    })

    const unsubscribe = authService.onAuthStateChange((nextUser) => {
      // Ignore no-op refreshes for the same user to avoid re-fetch churn.
      setUser((prev) => {
        if (prev?.id === nextUser?.id && prev?.emailConfirmed === nextUser?.emailConfirmed) {
          return prev
        }
        void loadForUser(nextUser)
        return prev
      })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [loadForUser])

  const signIn = React.useCallback(
    async (email: string, password: string, remember: boolean) => {
      await authService.signIn(email, password, remember)
      await loadForUser(await authService.getUser())
    },
    [loadForUser],
  )

  const signUp = React.useCallback(
    async (email: string, password: string, fullName: string) => {
      const result = await authService.signUp(email, password, fullName)
      if (!result.needsVerification) {
        await loadForUser(await authService.getUser())
      }
      return result
    },
    [loadForUser],
  )

  const signOut = React.useCallback(async () => {
    await authService.signOut()
    setUser(null)
    setProfile(null)
    setStatus('unauthenticated')
  }, [])

  const refreshProfile = React.useCallback(async () => {
    if (!user) return
    const nextProfile = await profileService.get(user.id)
    if (nextProfile) setProfile(nextProfile)
  }, [user])

  const updateProfile = React.useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) throw new Error('Not signed in')
      const nextProfile = await profileService.update(user.id, patch)
      setProfile(nextProfile)
    },
    [user],
  )

  const value = React.useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      isDemo: authService.isDemo,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      updateProfile,
    }),
    [status, user, profile, signIn, signUp, signOut, refreshProfile, updateProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

/** Convenience for authenticated feature code — throws if used while signed out. */
export function useRequiredUser(): AuthUser {
  const { user } = useAuth()
  if (!user) throw new Error('Expected an authenticated user')
  return user
}
