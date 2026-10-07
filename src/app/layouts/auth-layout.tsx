import { CalendarDays, Flame, Target } from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { Mascot } from '@/components/art'
import { Aurora } from '@/components/aurora'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'

/** What a student gets, said in three lines rather than a paragraph. */
const PROMISES = [
  { icon: Target, text: 'One clear answer to "what should I work on right now?"' },
  { icon: CalendarDays, text: 'Timetable, deadlines and focus sessions in one place' },
  { icon: Flame, text: 'Streaks and XP that track real work, not time spent logged in' },
] as const

/**
 * Shell for the auth flow.
 *
 * Was a centred card on an empty page — the first screen a student ever sees,
 * and it said nothing about the product. The pitch panel appears from `lg` up,
 * where there is room for it; below that the card still gets the full width it
 * had, because a phone keyboard leaves very little of the viewport.
 */
export function AuthLayout() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <Aurora />

      <header className="relative flex h-16 items-center justify-between px-4 md:px-8">
        <Link to="/" aria-label="StudentOS home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 py-8">
        <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1fr_28rem]">
          <section className="hidden lg:block">
            <h1 className="font-display text-4xl leading-tight font-semibold tracking-tight text-balance">
              Your degree, with a plan behind it.
            </h1>
            <ul className="mt-8 space-y-4">
              {PROMISES.map((promise) => (
                <li key={promise.text} className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                    <promise.icon aria-hidden className="size-4.5" />
                  </span>
                  <span className="text-muted-foreground pt-1.5 text-sm">{promise.text}</span>
                </li>
              ))}
            </ul>
            <Mascot art="mascot" className="mt-10 size-24 opacity-90" />
          </section>

          {/* Tier 3: the card is the only thing on the page to act on, and it
              has to sit clearly above the aurora rather than float in it.
              Applied here so all six auth pages get it without each one
              remembering to. */}
          <div className="w-full max-w-md justify-self-center [&>*]:shadow-e3 lg:justify-self-end">
            <Outlet />
          </div>
        </div>
      </main>

      <footer className="text-muted-foreground relative pb-6 text-center text-xs">
        © {new Date().getFullYear()} Life OS · StudentOS
      </footer>
    </div>
  )
}
