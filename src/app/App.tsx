import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/app/providers/auth-provider'
import { ThemeProvider } from '@/app/providers/theme-provider'
import { router } from '@/app/router'
import { ErrorBoundary } from '@/components/error-boundary'
import { PwaReloadPrompt } from '@/components/pwa-reload-prompt'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/query-client'

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <RouterProvider router={router} />
              <Toaster />
              <PwaReloadPrompt />
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
