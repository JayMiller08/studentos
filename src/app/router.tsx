import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RedirectIfAuthenticated, RequireAdmin, RequireAuth } from '@/app/guards'
import { AppLayout } from '@/app/layouts/app-layout'
import { AuthLayout } from '@/app/layouts/auth-layout'
import { NotFoundPage } from '@/app/pages/not-found-page'

/**
 * Route table. Feature pages are lazy-loaded so each area of the product is
 * its own chunk; the app shell stays tiny.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    lazy: async () => {
      const { LandingPage } = await import('@/features/landing/landing-page')
      return { element: <LandingPage /> }
    },
  },

  // Demo-mode simulated checkout (never used when Stripe is configured).
  {
    path: '/checkout/mock',
    lazy: async () => {
      const { MockCheckoutPage } = await import('@/features/billing/mock-checkout-page')
      return {
        element: (
          <RequireAuth>
            <MockCheckoutPage />
          </RequireAuth>
        ),
      }
    },
  },

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
        path: 'planner',
        lazy: async () => {
          const { PlannerPage } = await import('@/features/planner/planner-page')
          return { element: <PlannerPage /> }
        },
      },
      {
        path: 'assignments',
        lazy: async () => {
          const { AssignmentsPage } = await import('@/features/assignments/assignments-page')
          return { element: <AssignmentsPage /> }
        },
      },
      {
        path: 'calendar',
        lazy: async () => {
          const { CalendarPage } = await import('@/features/calendar/calendar-page')
          return { element: <CalendarPage /> }
        },
      },
      {
        path: 'focus',
        lazy: async () => {
          const { FocusPage } = await import('@/features/focus/focus-page')
          return { element: <FocusPage /> }
        },
      },
      {
        path: 'smart-plan',
        lazy: async () => {
          const { SmartPlanPage } = await import('@/features/ai/smart-plan-page')
          return { element: <SmartPlanPage /> }
        },
      },
      {
        path: 'coach',
        lazy: async () => {
          const { CoachPage } = await import('@/features/ai/coach-page')
          return { element: <CoachPage /> }
        },
      },
      {
        path: 'analytics',
        lazy: async () => {
          const { AnalyticsPage } = await import('@/features/analytics/analytics-page')
          return { element: <AnalyticsPage /> }
        },
      },
      {
        path: 'habits',
        lazy: async () => {
          const { HabitsPage } = await import('@/features/habits/habits-page')
          return { element: <HabitsPage /> }
        },
      },
      {
        path: 'budget',
        lazy: async () => {
          const { BudgetPage } = await import('@/features/budget/budget-page')
          return { element: <BudgetPage /> }
        },
      },
      {
        path: 'notes',
        lazy: async () => {
          const { NotesPage } = await import('@/features/notes/notes-page')
          return { element: <NotesPage /> }
        },
      },
      {
        path: 'achievements',
        lazy: async () => {
          const { AchievementsPage } = await import('@/features/gamification/achievements-page')
          return { element: <AchievementsPage /> }
        },
      },
      {
        path: 'billing',
        lazy: async () => {
          const { BillingPage } = await import('@/features/billing/billing-page')
          return { element: <BillingPage /> }
        },
      },
      {
        path: 'admin',
        lazy: async () => {
          const { AdminPage } = await import('@/features/admin/admin-page')
          return {
            element: (
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            ),
          }
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
