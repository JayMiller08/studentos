/**
 * Cookie consent: asked once per browser, remembered, and passed to Google.
 *
 * The choice lives in localStorage under the key the in-app banner already
 * used, so anyone who answered it before is not asked again. index.html reads
 * the same key before any Google script runs, so a returning visitor who
 * accepted is treated as having accepted from the first byte, and one who
 * declined (or never answered) stays at Consent Mode's "denied" default.
 *
 * Storage can throw (blocked site data, some private modes). Then the choice
 * holds for the visit and the banner asks again next time: there is nowhere
 * to remember it, and assuming consent is not an option.
 */

export type ConsentChoice = 'accepted' | 'declined'

export const CONSENT_STORAGE_KEY = 'cookie-consent'

/** The Consent Mode signals the banner controls, all together. */
const SIGNALS = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage'] as const

type Gtag = (command: 'consent', action: 'update', params: Record<string, 'granted' | 'denied'>) => void

export function readConsent(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    return value === 'accepted' || value === 'declined' ? value : null
  } catch {
    return null
  }
}

/** Tell Google's Consent Mode, if a Google tag is on the page at all. */
export function applyConsent(choice: ConsentChoice): void {
  const gtag = (window as unknown as { gtag?: Gtag }).gtag
  if (typeof gtag !== 'function') return
  const state = choice === 'accepted' ? 'granted' : 'denied'
  gtag('consent', 'update', Object.fromEntries(SIGNALS.map((signal) => [signal, state])))
}

/** Remember the choice and act on it. Returns false when it could not be stored. */
export function saveConsent(choice: ConsentChoice): boolean {
  applyConsent(choice)
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice)
    return true
  } catch {
    return false
  }
}
