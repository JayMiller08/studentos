// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// `?raw` rather than node:fs — this suite runs under the app's tsconfig.
import indexHtml from '../../../index.html?raw'
import { CookieConsent } from '@/components/cookie-consent'
import { applyConsent, CONSENT_STORAGE_KEY, readConsent, saveConsent } from '@/lib/consent'

/**
 * The banner used to come back on every visit: a second banner hard-coded in
 * index.html hid itself on click and remembered nothing. Now there is one
 * banner, it asks once per browser, and the answer reaches Google's Consent
 * Mode — on the click, and on every later visit before any Google script runs.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

function mount(): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  React.act(() => root!.render(<CookieConsent />))
  return container
}

function unmount() {
  React.act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
}

const banner = () => document.querySelector('[aria-label="Cookie notice"]')
const click = (label: string) =>
  React.act(() => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())

beforeEach(() => {
  localStorage.clear()
  delete (window as { gtag?: unknown }).gtag
})

afterEach(() => {
  unmount()
  vi.restoreAllMocks()
})

describe('the banner', () => {
  it('asks a browser that has never answered', () => {
    mount()
    expect(banner()).not.toBeNull()
  })

  it.each([
    ['Accept cookies', 'accepted'],
    ['Decline cookies', 'declined'],
  ])('remembers "%s" and never asks again', (label, stored) => {
    mount()
    click(label)
    expect(banner()).toBeNull()
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe(stored)

    // A later visit, and the one after: still not asked.
    for (let visit = 0; visit < 2; visit += 1) {
      unmount()
      mount()
      expect(banner()).toBeNull()
    }
  })

  it('does not ask someone who answered the old in-app banner', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted')
    mount()
    expect(banner()).toBeNull()
  })

  it('goes away in this tab when another tab answers', () => {
    mount()
    localStorage.setItem(CONSENT_STORAGE_KEY, 'declined')
    React.act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_STORAGE_KEY }))
    })
    expect(banner()).toBeNull()
  })

  it('tells Google when Google is on the page', () => {
    const gtag = vi.fn()
    ;(window as { gtag?: unknown }).gtag = gtag
    mount()
    click('Accept cookies')
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    })
  })
})

describe('when the browser will not store anything', () => {
  it('reads no answer, says it could not save, and still hides the banner for this visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readConsent()).toBeNull()
    expect(saveConsent('accepted')).toBe(false)
    mount()
    click('Decline cookies')
    expect(banner()).toBeNull()
  })
})

describe('consent signals', () => {
  it('denies all four on decline', () => {
    const gtag = vi.fn()
    ;(window as { gtag?: unknown }).gtag = gtag
    applyConsent('declined')
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    })
  })

  it('does nothing without a Google tag', () => {
    expect(() => applyConsent('accepted')).not.toThrow()
  })
})

describe('index.html', () => {
  it('has no banner of its own any more', () => {
    expect(indexHtml).not.toContain('consent-banner')
    expect(indexHtml).not.toMatch(/allConsentGranted|revokeAllConsent/)
  })

  it('starts denied, and restores an accepted answer from the same key before any Google script', () => {
    const head = indexHtml.slice(0, indexHtml.indexOf('</head>'))
    const restore = head.indexOf(`localStorage.getItem('${CONSENT_STORAGE_KEY}') === 'accepted'`)
    expect(head.indexOf("gtag('consent', 'default'")).toBeGreaterThan(-1)
    expect(restore).toBeGreaterThan(head.indexOf("gtag('consent', 'default'"))
    const firstGoogleScript = head.indexOf('googlesyndication.com')
    if (firstGoogleScript > -1) expect(restore).toBeLessThan(firstGoogleScript)
  })
})
