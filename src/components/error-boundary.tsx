import { AlertTriangle, RotateCcw } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Top-level error boundary. Chunk-load failures after a deploy are recovered
 * with a hard reload; anything else gets a friendly retry screen while the
 * error is logged for diagnostics.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[app-error]', error, info.componentStack)
    // Stale chunk after a new deploy — reload once to pick up fresh assets.
    if (/Failed to fetch dynamically imported module|Importing a module script failed/.test(error.message)) {
      const key = 'studentos.chunk-reload'
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
      }
    }
  }

  private reset = () => {
    sessionStorage.removeItem('studentos.chunk-reload')
    this.setState({ error: null })
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-full">
            <AlertTriangle aria-hidden className="size-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-muted-foreground max-w-md text-sm">
              An unexpected error occurred. Your data is safe — try again, and if this keeps
              happening please contact support.
            </p>
          </div>
          <Button onClick={this.reset}>
            <RotateCcw /> Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
