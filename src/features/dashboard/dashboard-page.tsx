import { ArrowRight, Bell, Download, Sparkles, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { usePwaInstall } from '@/hooks/use-pwa-install'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Burning the midnight oil'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const { profile } = useAuth()
  const { canInstall, promptInstall } = usePwaInstall()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date())

  const setupSteps = [
    {
      id: 'profile',
      label: 'Complete your profile',
      done: Boolean(profile?.university && profile?.degree),
      to: '/app/settings',
      icon: UserRound,
    },
    {
      id: 'notifications',
      label: 'Choose your reminders',
      done: Boolean(profile?.notification_prefs && !profile.notification_prefs.email_digest === false),
      to: '/app/settings',
      icon: Bell,
    },
  ]
  const doneCount = setupSteps.filter((step) => step.done).length

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={today}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles aria-hidden className="text-primary size-4" /> Set up your StudentOS
            </CardTitle>
            <CardDescription>
              {doneCount} of {setupSteps.length} steps complete
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={(doneCount / setupSteps.length) * 100} aria-label="Setup progress" />
            <ul className="space-y-2">
              {setupSteps.map((step) => (
                <li key={step.id}>
                  <Link
                    to={step.to}
                    className="hover:bg-accent flex items-center gap-3 rounded-lg border p-3 transition-colors"
                  >
                    <step.icon aria-hidden className="text-muted-foreground size-4.5" />
                    <span className={step.done ? 'text-muted-foreground flex-1 line-through' : 'flex-1'}>
                      {step.label}
                    </span>
                    <ArrowRight aria-hidden className="text-muted-foreground size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {canInstall ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download aria-hidden className="text-primary size-4" /> Install StudentOS
              </CardTitle>
              <CardDescription>
                Add StudentOS to your home screen for instant, offline-ready access.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void promptInstall()}>Install app</Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
