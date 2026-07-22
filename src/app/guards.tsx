import type * as React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { PageLoader } from '@/components/ui/spinner'

/** Blocks a route until the user is signed in (and onboarded). */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, profile } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <PageLoader label="Signing you in" />

  if (status === 'unauthenticated') {
    return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />
  }

  const isOnboardingRoute = location.pathname.startsWith('/onboarding')
  if (profile && !profile.onboarding_completed && !isOnboardingRoute) {
    return <Navigate to="/onboarding" replace />
  }
  if (profile?.onboarding_completed && isOnboardingRoute) {
    return <Navigate to="/app" replace />
  }

  return children
}

/** Admin-only routes. Server-side, admin data is additionally protected by RLS. */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { status, profile } = useAuth()
  if (status === 'loading') return <PageLoader />
  if (profile?.role !== 'admin') return <Navigate to="/app" replace />
  return children
}

/** Keeps signed-in users out of the auth pages. */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader />
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/app'} replace />
  }
  return children
}
