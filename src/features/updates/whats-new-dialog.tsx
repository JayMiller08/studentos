import { format, parseISO } from 'date-fns'
import { Sparkles, Wand2, Wrench } from 'lucide-react'
import * as React from 'react'
import { useAuth } from '@/app/providers/auth-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useTour } from '@/features/tour/tour-provider'
import {
  LATEST_RELEASE_DATE,
  type Release,
  type ReleaseChangeKind,
  unseenReleases,
} from '@/lib/releases'
import { todayKey } from '@/lib/utils'

/**
 * Per user, and per device.
 *
 * The obvious alternative is a column on `profiles`, which would announce each
 * release once per account rather than once per browser. It would also mean a
 * migration that has to be run before the app can boot without erroring on a
 * missing column — the failure mode migration 00006 already left behind with
 * `tour_completed`. Showing this once on a student's laptop and once on their
 * phone is a small price for a feature that cannot break sign-in.
 */
function seenKey(userId: string): string {
  return `studentos.releases.seen.${userId}`
}

function readMarker(userId: string): string | null {
  try {
    return localStorage.getItem(seenKey(userId))
  } catch {
    return null
  }
}

function writeMarker(userId: string): void {
  try {
    localStorage.setItem(seenKey(userId), LATEST_RELEASE_DATE)
  } catch {
    // Private browsing or a full quota. Worst case the student sees the notes
    // again next time, which is better than blocking the app.
  }
}

const KIND_META: Record<ReleaseChangeKind, { label: string; icon: typeof Sparkles; className: string }> = {
  new: { label: 'New', icon: Sparkles, className: 'bg-primary/10 text-primary' },
  improved: { label: 'Improved', icon: Wand2, className: 'bg-secondary text-secondary-foreground' },
  fixed: { label: 'Fixed', icon: Wrench, className: 'bg-success/10 text-success' },
}

function ReleaseNotes({ release }: { release: Release }) {
  return (
    <section className="space-y-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {format(parseISO(release.date), 'd MMMM yyyy')}
      </p>
      <h3 className="text-base font-semibold">{release.title}</h3>
      <ul className="space-y-3">
        {release.changes.map((change) => {
          const meta = KIND_META[change.kind]
          return (
            <li key={change.title} className="flex gap-3">
              <span
                aria-hidden
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.className}`}
              >
                <meta.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  <span className="sr-only">{meta.label}: </span>
                  {change.title}
                </p>
                <p className="text-muted-foreground text-sm">{change.body}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Tells a student what changed since they were last here.
 *
 * Held back while a tour is running: a brand new user meeting the product for
 * the first time should not have a changelog stacked on top of their welcome
 * walkthrough.
 */
export function WhatsNewDialog() {
  const { profile } = useAuth()
  const { activeTour } = useTour()
  const [pending, setPending] = React.useState<Release[]>([])

  const userId = profile?.id
  const createdOn = profile?.created_at?.slice(0, 10)
  const onboarded = profile?.onboarding_completed ?? false
  const open = pending.length > 0

  React.useEffect(() => {
    if (!userId || !onboarded || activeTour || open) return

    const marker = readMarker(userId)
    // A profile with no usable creation date is treated as brand new, so a bad
    // row shows nothing rather than announcing the entire history of the app.
    const unseen = unseenReleases(marker, createdOn ?? todayKey())

    if (unseen.length === 0) {
      // Record where they stand, so the *next* release is measured from here
      // rather than from the day they signed up.
      if (!marker) writeMarker(userId)
      return
    }
    setPending(unseen)
  }, [userId, onboarded, createdOn, activeTour, open])

  function dismiss() {
    if (userId) writeMarker(userId)
    setPending([])
  }

  if (!open) return null

  return (
    <Dialog open onOpenChange={(next) => !next && dismiss()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles aria-hidden className="text-primary size-5" />
            What&apos;s new in StudentOS
          </DialogTitle>
          <DialogDescription>
            {pending.length === 1
              ? 'Here is what changed since you were last here.'
              : `Here is what changed across ${pending.length} updates since you were last here.`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh]">
          <div className="space-y-6 pr-3">
            {pending.map((release) => (
              <ReleaseNotes key={release.date} release={release} />
            ))}
          </div>
        </ScrollArea>

        <Button onClick={dismiss} className="w-full">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  )
}
