import * as React from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { type PageTour, REPLAY_HINT_TOUR, tourForPath } from '@/lib/tours'

interface TourContextValue {
  /** Tour owning the current route, if any — what the replay control plays. */
  pageTour: PageTour | null
  /** Tour running right now (a page tour, or the one-off replay pointer). */
  activeTour: PageTour | null
  stepIndex: number
  /** True while the existing-user pointer at the replay control is pending. */
  hintPending: boolean
  /** Play the current page's tour from the start. */
  replay: () => void
  goTo: (index: number) => void
  /** Close the running tour and remember it as seen. */
  finish: () => void
  /** Forget every tour so each page introduces itself again. */
  resetAll: () => Promise<void>
}

const TourContext = React.createContext<TourContextValue | null>(null)

/**
 * Pages render asynchronously (lazy route chunks, then data), so anchoring a
 * spotlight the instant the route changes would measure an empty screen. Every
 * page renders a `<PageHeader>`, which makes it a reliable "this page exists
 * now" signal; we fall back to starting anyway so a page that somehow lacks one
 * still gets its tour, just centered.
 */
function whenPageReady(run: () => void): () => void {
  const deadline = Date.now() + 4000
  let timer = 0
  let cancelled = false

  const poll = () => {
    if (cancelled) return
    if (document.querySelector('[data-tour="page-header"]') || Date.now() > deadline) {
      run()
      return
    }
    timer = window.setTimeout(poll, 120)
  }

  // A beat first, so the tour never flashes over a page mid-paint.
  timer = window.setTimeout(poll, 350)
  return () => {
    cancelled = true
    window.clearTimeout(timer)
  }
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { profile, updateProfile } = useAuth()
  const location = useLocation()
  const [activeTour, setActiveTour] = React.useState<PageTour | null>(null)
  const [stepIndex, setStepIndex] = React.useState(0)
  // Closing a tour persists to the profile, which is a round trip. Remember it
  // locally too, or the gap before the write lands re-triggers the auto-start.
  const [dismissed, setDismissed] = React.useState<ReadonlySet<string>>(() => new Set())

  const pageTour = tourForPath(location.pathname)
  const seen = React.useMemo(() => new Set(profile?.tours_seen ?? []), [profile?.tours_seen])

  // Existing users get one pointer at the replay control instead of having
  // every page tour replayed at them; see migration 00007.
  const hintPending = Boolean(
    profile?.onboarding_completed && profile.tour_replay_hint && !dismissed.has(REPLAY_HINT_TOUR.id),
  )

  const pendingTour: PageTour | null = !profile?.onboarding_completed
    ? null
    : hintPending
      ? REPLAY_HINT_TOUR
      : pageTour && !seen.has(pageTour.id) && !dismissed.has(pageTour.id)
        ? pageTour
        : null

  // Auto-start the pending tour once the route has actually rendered.
  React.useEffect(() => {
    if (!pendingTour || activeTour) return
    return whenPageReady(() => {
      setStepIndex(0)
      setActiveTour(pendingTour)
    })
  }, [pendingTour, activeTour])

  const finish = React.useCallback(() => {
    const tour = activeTour
    setActiveTour(null)
    setStepIndex(0)
    if (!tour || !profile) return
    // Skipping counts as seen — a tour that reappears every visit is a bug to
    // the person living with it, however well-intentioned.
    setDismissed((prev) => new Set(prev).add(tour.id))
    if (tour.id === REPLAY_HINT_TOUR.id) {
      if (profile.tour_replay_hint) void updateProfile({ tour_replay_hint: false })
      return
    }
    if (!profile.tours_seen.includes(tour.id)) {
      void updateProfile({ tours_seen: [...profile.tours_seen, tour.id] })
    }
  }, [activeTour, profile, updateProfile])

  const replay = React.useCallback(() => {
    if (!pageTour) return
    // Taking a tour deliberately answers the pointer's question.
    setDismissed((prev) => new Set(prev).add(REPLAY_HINT_TOUR.id))
    if (profile?.tour_replay_hint) void updateProfile({ tour_replay_hint: false })
    setStepIndex(0)
    setActiveTour(pageTour)
  }, [pageTour, profile?.tour_replay_hint, updateProfile])

  const resetAll = React.useCallback(async () => {
    // The session-level dismissals have to go too, or "reset" would only take
    // effect after a reload — tours the user closed this session would stay
    // suppressed despite the profile saying they are unseen.
    setActiveTour(null)
    setStepIndex(0)
    setDismissed(new Set())
    await updateProfile({ tours_seen: [], tour_replay_hint: false })
  }, [updateProfile])

  // Leaving the page mid-tour closes it out — the spotlight would be pointing
  // at elements that no longer exist.
  const pathname = location.pathname
  const startedOn = React.useRef(pathname)
  React.useEffect(() => {
    if (!activeTour) {
      startedOn.current = pathname
      return
    }
    if (startedOn.current !== pathname) finish()
  }, [pathname, activeTour, finish])

  const value = React.useMemo<TourContextValue>(
    () => ({
      pageTour,
      activeTour,
      stepIndex,
      hintPending,
      replay,
      goTo: setStepIndex,
      finish,
      resetAll,
    }),
    [pageTour, activeTour, stepIndex, hintPending, replay, finish, resetAll],
  )

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>
}

export function useTour(): TourContextValue {
  const context = React.useContext(TourContext)
  if (!context) throw new Error('useTour must be used within TourProvider')
  return context
}
