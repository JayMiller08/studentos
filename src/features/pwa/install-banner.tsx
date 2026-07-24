import { Download, Share, SquarePlus, X } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { usePwaInstall } from '@/hooks/use-pwa-install'

const SNOOZE_KEY = 'studentos.pwa.install-dismissed'
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
function isMobile(): boolean {
  return (
    window.matchMedia('(max-width: 1023px)').matches ||
    window.matchMedia('(pointer: coarse)').matches
  )
}
function isSnoozed(): boolean {
  const raw = localStorage.getItem(SNOOZE_KEY)
  const until = raw ? Number(raw) : 0
  return Number.isFinite(until) && Date.now() < until
}

type BannerState = 'hidden' | 'prompt' | 'ios' | 'generic'

/**
 * Mobile-only prompt nudging users to add StudentOS to their home screen.
 * - Android / supported browsers: fires the native install prompt.
 * - iOS Safari: shows the Share → "Add to Home Screen" instruction (no
 *   programmatic install exists there).
 * Hidden when already installed, on desktop, or recently dismissed.
 */
export function InstallBanner() {
  const { canInstall, promptInstall, installed } = usePwaInstall()
  const [state, setState] = React.useState<BannerState>('hidden')
  const [ready, setReady] = React.useState(false)

  // Give `beforeinstallprompt` a moment to fire, and don't nag immediately.
  React.useEffect(() => {
    const timer = setTimeout(() => setReady(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    if (!ready) return
    if (installed || isStandalone() || isSnoozed() || !isMobile()) {
      setState('hidden')
      return
    }
    if (canInstall) setState('prompt')
    else if (isIos()) setState('ios')
    else setState('generic')
  }, [ready, canInstall, installed])

  function dismiss() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
    setState('hidden')
  }

  async function install() {
    const accepted = await promptInstall()
    if (accepted) setState('hidden')
    else dismiss()
  }

  if (state === 'hidden') return null

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 lg:hidden"
      role="region"
      aria-label="Install StudentOS"
    >
      <div className="bg-popover text-popover-foreground animate-in slide-in-from-bottom-4 fade-in-0 flex items-start gap-3 rounded-xl border p-3 shadow-xl duration-300">
        <span className="mt-0.5 shrink-0">
          <Logo showWordmark={false} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Add StudentOS to your Home Screen</p>
          {state === 'ios' ? (
            <p className="text-muted-foreground mt-0.5 text-xs">
              Tap the Share icon{' '}
              <Share aria-hidden className="inline size-3.5 -translate-y-px" /> then{' '}
              <span className="text-foreground font-medium">Add to Home Screen</span>
              <SquarePlus aria-hidden className="ml-0.5 inline size-3.5 -translate-y-px" /> for the
              full app — offline access and one-tap launch.
            </p>
          ) : (
            <p className="text-muted-foreground mt-0.5 text-xs">
              Install it for offline access, faster loading and a one-tap launch — no app store
              needed.
            </p>
          )}
          {state === 'prompt' ? (
            <Button size="sm" className="mt-2 h-8" onClick={() => void install()}>
              <Download /> Install app
            </Button>
          ) : state === 'generic' ? (
            <p className="text-muted-foreground mt-1.5 text-xs">
              Open your browser menu and choose <span className="text-foreground font-medium">Add to Home screen</span>.
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 shrink-0 rounded-md p-1"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
