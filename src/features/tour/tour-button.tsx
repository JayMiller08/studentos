import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTour } from '@/features/tour/tour-provider'

/**
 * Replays the current page's tour. Lives in the top bar so the control is in
 * the same place on every page — and so the one-off pointer shown to existing
 * users has something stable to point at.
 */
export function TourButton() {
  const { pageTour, hintPending, replay } = useTour()
  if (!pageTour) return null

  return (
    <Button
      data-tour="replay-tour"
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={`Replay the ${pageTour.label} tour`}
      onClick={replay}
    >
      <Compass />
      {hintPending ? (
        <>
          <span
            aria-hidden
            className="bg-primary absolute top-1.5 right-1.5 size-2 animate-ping rounded-full opacity-75"
          />
          <span aria-hidden className="bg-primary absolute top-1.5 right-1.5 size-2 rounded-full" />
        </>
      ) : null}
    </Button>
  )
}
