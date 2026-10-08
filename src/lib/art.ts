/**
 * The app's illustration set.
 *
 * These assets arrived with the AI Coach and outlived it — the page was cut,
 * the mascot was not. They now carry the empty states and reward moments,
 * which is what stops those screens being a grey icon in a dashed box.
 *
 * The two animations are WebP rather than the source GIFs: at 640² and 120
 * frames those were 3.5MB together, which is real money on the mobile data
 * most students are using. Re-encoded to 15fps at display size they are 216KB.
 */
export const ART = {
  /** Robot mascot — the friendly face, used at rest. */
  mascot: '/ai-mascot.png',
  /** Animated robot reading — "nothing here yet, go make something". */
  reading: '/robot-reading.webp',
  /** Animated robot in a cloud — work in progress. */
  thinking: '/robot-thinking.webp',
  /** Monochrome glyph, tinted via CSS mask. */
  sparkles: '/sparkles.png',
} as const

export type ArtName = keyof typeof ART
