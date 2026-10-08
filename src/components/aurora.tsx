/**
 * Aurora wash behind the pre-app screens — sign-in and onboarding.
 *
 * Three heavily blurred colour fields rather than an image: they cost nothing
 * to download, scale to any viewport, and follow the theme because they are
 * painted from tokens. Purely atmosphere, so `aria-hidden` and inert. The drift
 * is `motion-safe` and the global reduced-motion rule stops it too.
 */
export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="bg-primary/25 absolute -top-40 -left-32 size-[34rem] rounded-full blur-3xl motion-safe:animate-[aurora-drift_19s_ease-in-out_infinite_alternate]" />
      <div className="bg-quest/20 absolute top-1/3 -right-40 size-[30rem] rounded-full blur-3xl motion-safe:animate-[aurora-drift_23s_ease-in-out_infinite_alternate-reverse]" />
      <div className="bg-league/20 absolute -bottom-48 left-1/4 size-[28rem] rounded-full blur-3xl motion-safe:animate-[aurora-drift_27s_ease-in-out_infinite_alternate]" />
    </div>
  )
}
