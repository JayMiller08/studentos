import * as React from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TOUR_STEPS } from '@/features/tour/tour-steps'

const SPOTLIGHT_PADDING = 8
const TIP_WIDTH = 340
const GAP = 14

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

function findTarget(target?: string | string[]): HTMLElement | null {
  if (!target) return null
  const selectors = Array.isArray(target) ? target : [target]
  for (const selector of selectors) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const visible = els.find((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    if (visible) return visible
  }
  return null
}

/** Compute tooltip position given the target rect (or null = centered). */
function positionTip(
  rect: Rect | null,
  tipHeight: number,
): { top: number; left: number; centered: boolean } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(TIP_WIDTH, vw - 24)
  if (!rect) {
    return { top: Math.max(24, (vh - tipHeight) / 2), left: (vw - width) / 2, centered: true }
  }
  const clampLeft = (l: number) => Math.max(12, Math.min(l, vw - width - 12))
  const clampTop = (t: number) => Math.max(12, Math.min(t, vh - tipHeight - 12))

  // Tall left-side target (e.g. sidebar): place to its right.
  if (rect.height > vh * 0.55 && rect.left < vw * 0.4) {
    const left = rect.left + rect.width + GAP
    if (left + width < vw - 12) {
      return { top: clampTop(vh / 2 - tipHeight / 2), left, centered: false }
    }
  }
  // Prefer below, else above.
  const belowTop = rect.top + rect.height + GAP
  if (belowTop + tipHeight <= vh - 12) {
    return { top: belowTop, left: clampLeft(rect.left + rect.width / 2 - width / 2), centered: false }
  }
  return {
    top: clampTop(rect.top - tipHeight - GAP),
    left: clampLeft(rect.left + rect.width / 2 - width / 2),
    centered: false,
  }
}

export function ProductTour() {
  const { profile, updateProfile } = useAuth()
  const location = useLocation()
  const [active, setActive] = React.useState(false)
  const [stepIndex, setStepIndex] = React.useState(0)
  const [rect, setRect] = React.useState<Rect | null>(null)
  const [tipPos, setTipPos] = React.useState({ top: -9999, left: -9999, centered: true })
  const tipRef = React.useRef<HTMLDivElement | null>(null)
  const startedRef = React.useRef(false)

  const shouldShow =
    Boolean(profile?.onboarding_completed) &&
    profile?.tour_completed === false &&
    location.pathname === '/app'

  // Start once when eligible (small delay lets the dashboard mount).
  // `startedRef` is only set when the timer fires, so a cleared timer (React
  // StrictMode double-invoke, or a transient re-render) restarts cleanly.
  React.useEffect(() => {
    if (!shouldShow || startedRef.current) return
    const timer = setTimeout(() => {
      startedRef.current = true
      setStepIndex(0)
      setActive(true)
    }, 450)
    return () => clearTimeout(timer)
  }, [shouldShow])

  const finish = React.useCallback(() => {
    setActive(false)
    if (profile && !profile.tour_completed) void updateProfile({ tour_completed: true })
  }, [profile, updateProfile])

  // If the user leaves the dashboard while the tour is open, close it out.
  React.useEffect(() => {
    if (active && location.pathname !== '/app') finish()
  }, [active, location.pathname, finish])

  const step = TOUR_STEPS[stepIndex]

  // Measure the current target and keep it in sync with scroll/resize.
  React.useEffect(() => {
    if (!active || !step) return
    let raf = 0
    const measure = () => {
      const el = findTarget(step.target)
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else {
        setRect(null)
      }
    }
    const el = findTarget(step.target)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // Measure after the smooth scroll settles, then keep in sync.
    raf = window.requestAnimationFrame(() => setTimeout(measure, 260))
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [active, step, stepIndex])

  // Position the tooltip once its real height is known.
  React.useLayoutEffect(() => {
    if (!active) return
    const height = tipRef.current?.offsetHeight ?? 180
    setTipPos(positionTip(rect, height))
  }, [active, rect, stepIndex])

  if (!active || !step) return null

  const isLast = stepIndex === TOUR_STEPS.length - 1
  const width = Math.min(TIP_WIDTH, window.innerWidth - 24)

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Click-blocker + dim (dim only for centered steps; anchored uses the ring) */}
      <div
        className="absolute inset-0"
        style={{ background: rect ? 'transparent' : 'rgba(2,6,23,0.62)' }}
      />

      {/* Spotlight ring around the target */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.62)',
            outline: '2px solid var(--primary)',
            outlineOffset: '2px',
          }}
        />
      ) : null}

      {/* Tooltip card */}
      <div
        ref={tipRef}
        className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 absolute rounded-xl border p-4 shadow-xl duration-200"
        style={{ top: tipPos.top, left: tipPos.left, width }}
      >
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground font-mono text-[11px] tracking-wider tabular-nums">
            {stepIndex + 1} / {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={finish}
            className="text-muted-foreground hover:text-foreground text-xs font-medium"
          >
            Skip tour
          </button>
        </div>
        <h3 className="mt-1.5 text-base font-semibold tracking-tight text-balance">{step.title}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  i === stepIndex ? 'bg-primary w-4' : 'bg-muted-foreground/30',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setStepIndex((i) => i - 1)}>
                Back
              </Button>
            ) : null}
            <Button size="sm" onClick={() => (isLast ? finish() : setStepIndex((i) => i + 1))}>
              {isLast ? 'Get started' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
