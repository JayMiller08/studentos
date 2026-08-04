import { cn } from '@/lib/utils'

/**
 * Artwork for the AI Coach.
 *
 * The two animations are WebP rather than the source GIFs: at 640² and 120
 * frames those were 3.5MB together, which is real money on the mobile data
 * most students are using. Re-encoded to 15fps at display size they are 216KB.
 */
export const COACH_ART = {
  /** Robot mascot — assistant avatar and header. */
  mascot: '/ai-mascot.png',
  /** Animated robot reading — the empty state. */
  reading: '/robot-reading.webp',
  /** Animated robot in a cloud — shown while a reply is generating. */
  thinking: '/robot-thinking.webp',
  /** Monochrome glyph, tinted via CSS mask. */
  sparkles: '/sparkles.png',
} as const

/**
 * Sparkles drawn in the current text colour.
 *
 * The asset is a flat black PNG, so it cannot be recoloured as an `<img>` —
 * it would stay black on a dark chip. Painting it as a CSS mask over
 * `bg-current` makes it inherit the surrounding colour instead, which is what
 * lets one file work on both the active and inactive chips, light and dark.
 */
export function SparkleGlyph({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{
        maskImage: `url(${COACH_ART.sparkles})`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskImage: `url(${COACH_ART.sparkles})`,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}
