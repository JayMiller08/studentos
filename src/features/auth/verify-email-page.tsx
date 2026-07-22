import { MailOpen } from 'lucide-react'
import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { authService } from '@/services/auth-service'

const RESEND_COOLDOWN_SECONDS = 30

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [cooldown, setCooldown] = React.useState(0)
  const [resending, setResending] = React.useState(false)

  React.useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((value) => value - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function resend() {
    if (!email) return
    setResending(true)
    try {
      await authService.resendVerification(email)
      toast.success('Verification email sent')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to resend the email')
    } finally {
      setResending(false)
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="bg-secondary text-secondary-foreground flex size-14 items-center justify-center rounded-full">
          <MailOpen aria-hidden className="size-7" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Verify your email</h1>
          <p className="text-muted-foreground max-w-sm text-sm">
            We sent a confirmation link{email ? ' to ' : ''}
            {email ? <span className="text-foreground font-medium">{email}</span> : null}. Click it
            to activate your account, then sign in.
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void resend()}
            disabled={!email || resending || cooldown > 0}
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
          </Button>
          <Button asChild variant="link">
            <Link to="/auth/login">Back to sign in</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
