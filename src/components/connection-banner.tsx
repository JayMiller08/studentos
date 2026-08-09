import { CloudOff, RotateCcw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConnection } from '@/hooks/use-connection'

/**
 * Explains a stall instead of leaving the app looking broken.
 *
 * This is load protection as much as courtesy: an app that silently stops
 * responding gets reloaded, repeatedly, and every reload is a fresh burst of
 * queries aimed at a backend that is already struggling. Saying "you're
 * offline, we'll retry" is what stops that.
 */
export function ConnectionBanner() {
  const { state, retryNow } = useConnection()
  if (state === 'online') return null

  const offline = state === 'offline'
  const Icon = offline ? WifiOff : CloudOff

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-warning/15 text-warning-foreground dark:text-warning flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium"
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span>
        {offline
          ? "You're offline — your work is saved and will sync when you reconnect."
          : "Can't reach StudentOS. Retrying automatically…"}
      </span>
      {offline ? null : (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={retryNow}>
          <RotateCcw className="size-3" /> Retry now
        </Button>
      )}
    </div>
  )
}
