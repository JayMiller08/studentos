import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RedirectIfAuthenticated, RequireAuth } from '@/app/guards'
import { AppLayout } from '@/app/layouts/app-layout'
import { AuthLayout } from '@/app/layouts/auth-layout'
import { NotFoundPage } from '@/app/pages/not-found-page'

/**
 * Route table. Feature pages are lazy-loaded so each area of the product is
 * its own chunk; the app shell stays tiny.
 */
export const router = createBrowserRouter([
  // Public landing page ships in Phase 5; until then the root forwards into the app.
  { path: '/', element: <Navigate to="/app" replace /> },

  {
    path: '/auth',
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      {
        path: 'login',
        lazy: async () => {
          const { LoginPage } = await import('@/features/auth/login-page')
          return {
            element: (
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            ),
          }
        },
      },
      {
        path: 'register',
        lazy: async () => {
          const { RegisterPage } = await import('@/features/auth/register-page')
          return {
            element: (
              <RedirectIfAuthenticated>
                <RegisterPage />
              </RedirectIfAuthenticated>
            ),
          }
        },
      },
      {
        path: 'forgot-password',
        lazy: async () => {
          const { ForgotPasswordPage } = await import('@/features/auth/forgot-password-page')
          return {
            element: (
              <RedirectIfAuthenticated>
                <ForgotPasswordPage />
              </RedirectIfAuthenticated>
            ),
          }
        },
      },
      {
        // Reachable while holding a recovery session — must NOT redirect authed users.
        path: 'reset-password',
        lazy: async () => {
          const { ResetPasswordPage } = await import('@/features/auth/reset-password-page')
          return { element: <ResetPasswordPage /> }
        },
      },
      {
        path: 'verify-email',
        lazy: async () => {
          const { VerifyEmailPage } = await import('@/features/auth/verify-email-page')
          return { element: <VerifyEmailPage /> }
        },
      },
      {
        path: 'callback',
        lazy: async () => {
          const { AuthCallbackPage } = await import('@/features/auth/callback-page')
          return { element: <AuthCallbackPage /> }
        },
      },
    ],
  },

  {
    path: '/onboarding',
    lazy: async () => {
      const { OnboardingPage } = await import('@/features/onboarding/onboarding-page')
      return {
        element: (
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        ),
      }
    },
  },

  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        lazy: async () => {
          const { DashboardPage } = await import('@/features/dashboard/dashboard-page')
          return { element: <DashboardPage /> }
        },
      },
      {
        path: 'settings',
        lazy: async () => {
          const { SettingsPage } = await import('@/features/settings/settings-page')
          return { element: <SettingsPage /> }
        },
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
])
