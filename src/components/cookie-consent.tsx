import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CONSENT_STORAGE_KEY, type ConsentChoice, readConsent, saveConsent } from '@/lib/consent'

/**
 * The one cookie banner, on every page, asked once per browser.
 *
 * Rendered at the app root rather than inside a layout, so the landing and
 * legal pages ask as well as the app, and nobody meets two banners. Shown only
 * after mount: it depends on this browser's storage, so it is never part of
 * server-rendered HTML. A plain link to the privacy policy rather than a
 * router <Link>, because the root sits outside the router.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(readConsent() === null)
    // Answered in another tab: stop asking in this one too.
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_STORAGE_KEY && readConsent() !== null) setShow(false)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const choose = (choice: ConsentChoice) => {
    saveConsent(choice)
    // Hidden for this visit even if the browser refused to store it.
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      // A landmark with a name, so the banner is reachable by rotor and does
      // not read as orphaned content outside every region.
      role="region"
      aria-label="Cookie notice"
      className="bg-background fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-3 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <p className="text-muted-foreground flex-1 text-sm">
        StudentOS uses cookies for ads and to understand how the site is used. Accept or decline: the app works
        the same either way. See our{' '}
        <a href="/privacy" className="hover:text-foreground underline">
          Privacy Policy
        </a>
        .
      </p>
      <div className="flex w-full gap-2 sm:w-auto">
        <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => choose('declined')} aria-label="Decline cookies">
          Decline
        </Button>
        <Button className="flex-1 sm:flex-none" onClick={() => choose('accepted')} aria-label="Accept cookies">
          Accept
        </Button>
      </div>
    </div>
  )
}
