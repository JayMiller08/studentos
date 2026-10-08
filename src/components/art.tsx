import { ART, type ArtName } from '@/lib/art'
import { cn } from '@/lib/utils'

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
        maskImage: `url(${ART.sparkles})`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskImage: `url(${ART.sparkles})`,
        WebkitMaskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}

export interface MascotProps {
  art?: ArtName
  className?: string
}

/**
 * A mascot image sized for an empty state.
 *
 * Decorative by definition: the surrounding copy already says what is missing
 * and what to do about it, so an alt text here would only repeat it to a screen
 * reader. Lazy so a page with several empty states does not fetch them all.
 */
export function Mascot({ art = 'reading', className }: MascotProps) {
  return (
    <img
      src={ART[art]}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className={cn('size-28 object-contain select-none', className)}
    />
  )
}
