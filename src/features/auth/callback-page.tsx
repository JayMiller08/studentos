import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageLoader } from '@/components/ui/spinner'
import { authService } from '@/services/auth-service'

const TIMEOUT_MS = 8000

/**
 * OAuth / email-confirmation landing route. Supabase parses the URL and
 * establishes the session; we wait for it and forward into the app.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = React.useState(false)

  React.useEffect(() => {
    let done = false

    const finish = () => {
      if (!done) {
        done = true
        navigate('/app', { replace: true })
      }
    }

    void authService.getUser().then((user) => {
      if (user) finish()
    })
    const unsubscribe = authService.onAuthStateChange((user) => {
      if (user) finish()
    })
    const timer = setTimeout(() => {
      if (!done) setTimedOut(true)
    }, TIMEOUT_MS)

    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [navigate])

  if (timedOut) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">That link didn't work</h1>
            <p className="text-muted-foreground text-sm">
              The confirmation link may have expired or already been used.
            </p>
          </div>
          <Button asChild>
            <Link to="/auth/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return <PageLoader label="Confirming your account" />
}
