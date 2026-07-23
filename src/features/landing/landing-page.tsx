import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronDown,
  ListTodo,
  PiggyBank,
  Repeat,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatPlanPrice, PLAN_ORDER, PLANS } from '@/lib/plans'
import { cn } from '@/lib/utils'

const FEATURES = [
  { icon: Sparkles, title: 'Tells you what to do next', body: 'A dynamic priority score ranks every assignment by deadline, weight, effort and difficulty — so you always know the single best thing to work on.' },
  { icon: BrainCircuit, title: 'AI study planner', body: 'Turn your workload into a realistic day-by-day schedule in one tap. Blocks are sized for focus and never scheduled past a deadline.' },
  { icon: Timer, title: 'Focus that sticks', body: 'A Pomodoro timer that survives reloads, deep-work mode, ambient sound, and a distraction counter — with streaks to keep you honest.' },
  { icon: CalendarDays, title: 'Your whole semester', body: 'Class timetable, exams, deadlines and study blocks in one calendar. Set your weekly classes once and every week fills itself in.' },
  { icon: Repeat, title: 'Habits & routines', body: 'Build the small daily habits that compound — with streaks, completion rates and a satisfying 12-week heatmap.' },
  { icon: PiggyBank, title: 'Student budgeting', body: 'Track spending by category, watch a live month-end projection, and hit your savings goals without a spreadsheet.' },
  { icon: Bot, title: 'AI study coach', body: 'Explain concepts, generate quizzes and flashcards, summarize notes and get essay feedback — grounded in your real deadlines.' },
  { icon: BarChart3, title: 'Insightful analytics', body: 'A single productivity score plus focus, completion and weekly-trend charts that show whether the term is on track.' },
]

const TESTIMONIALS = [
  { quote: 'I stopped opening five different apps every morning. StudentOS just tells me what to do and I do it.', name: 'Aisha M.', role: 'BSc Computer Science, 2nd year' },
  { quote: 'The smart planner got me through three deadlines in one week without an all-nighter. Genuinely a first.', name: 'Thabo K.', role: 'BCom Accounting' },
  { quote: 'The focus timer + streaks are weirdly motivating. My study hours doubled and I can see it in the charts.', name: 'Lena R.', role: 'Self-taught developer' },
]

const FAQS = [
  { q: 'Is there a free plan?', a: 'Yes. The Free plan includes the dashboard, planner, calendar, Pomodoro timer, habit tracker and budgeting, with up to 3 active assignments — free forever.' },
  { q: 'What do I get with Student Pro?', a: 'Unlimited assignments and tasks, the AI study planner, smart prioritization, advanced analytics, unlimited notes and cloud sync.' },
  { q: 'Does it work on my phone?', a: 'StudentOS is a mobile-first progressive web app. Install it to your home screen on Android, iOS, or desktop and it works offline.' },
  { q: 'Will the AI make up fake deadlines?', a: 'No. The AI coach and planner only ever reference the assignments and dates you enter. Never inventing deadlines is a core design rule.' },
  { q: 'Can I cancel anytime?', a: 'Absolutely. Manage or cancel your subscription in two clicks from the billing page. No lock-in, no hassle.' },
]

function Header() {
  const { status } = useAuth()
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link to="/" aria-label="StudentOS home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex" aria-label="Sections">
          <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
          <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {status === 'authenticated' ? (
            <Button asChild size="sm">
              <Link to="/app">Open app</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/auth/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth/register">Get started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="from-primary/10 pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b to-transparent"
      />
      <div className="mx-auto max-w-6xl px-4 py-20 text-center md:px-6 md:py-28">
        <Badge variant="secondary" className="mx-auto mb-5">
          <Sparkles className="size-3" /> The operating system for university students
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-6xl">
          Never wonder{' '}
          <span className="from-primary bg-gradient-to-r to-indigo-500 bg-clip-text text-transparent">
            what to study next
          </span>
        </h1>
        <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg text-pretty">
          StudentOS combines planning, focus, habits, budgeting and AI into one academic command
          center — and actively tells you the most important thing to do right now.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link to="/auth/register">
              Start free <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/app">
              Try the live demo
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-3 text-sm">Free forever plan · No credit card required</p>

        <HeroPreview />
      </div>
    </section>
  )
}

/** Lightweight, self-contained product mock (no screenshots needed). */
function HeroPreview() {
  return (
    <div className="mx-auto mt-14 max-w-4xl">
      <div className="bg-card overflow-hidden rounded-2xl border shadow-2xl">
        <div className="bg-muted/50 flex items-center gap-1.5 border-b px-4 py-3">
          <span className="size-3 rounded-full bg-red-400" />
          <span className="size-3 rounded-full bg-yellow-400" />
          <span className="size-3 rounded-full bg-green-400" />
          <span className="text-muted-foreground ml-3 text-xs">studentos.app/app</span>
        </div>
        <div className="grid gap-4 p-5 text-left sm:grid-cols-3">
          <div className="from-primary/10 border-primary/20 rounded-xl border bg-gradient-to-br to-transparent p-4 sm:col-span-2">
            <p className="text-primary flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="size-3.5" /> Today's priority
            </p>
            <p className="mt-1.5 font-semibold">Graph algorithms practical</p>
            <p className="text-muted-foreground text-sm">Due in 2 days · 2h 45m remaining · 15% of grade</p>
            <div className="bg-primary/15 mt-3 h-1.5 w-full overflow-hidden rounded-full">
              <div className="bg-primary h-full w-[45%] rounded-full" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border p-2.5">
              <Zap className="text-primary size-4" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">Level 4 · 780 XP</p>
                <p className="text-muted-foreground text-[11px]">4-day streak</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border p-2.5">
              <Timer className="text-primary size-4" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">4h 10m this week</p>
                <p className="text-muted-foreground text-[11px]">Focus time</p>
              </div>
            </div>
          </div>
          {['Review Dijkstra notes', 'Start eigenvalues set', 'Weekly review'].map((task, i) => (
            <div key={task} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
              <span className={cn('flex size-4 items-center justify-center rounded-full border', i === 0 && 'bg-success border-success text-white')}>
                {i === 0 ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className={cn('truncate', i === 0 && 'text-muted-foreground line-through')}>{task}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Everything, in one place</h2>
        <p className="text-muted-foreground mt-3 text-lg">
          Stop juggling a dozen apps. StudentOS replaces your planner, timer, habit tracker, budget
          spreadsheet and study buddy.
        </p>
      </div>
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => (
          <Card key={feature.title} className="gap-3 py-5">
            <CardContent className="space-y-2">
              <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                <feature.icon aria-hidden className="size-5" />
              </div>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-muted-foreground text-sm">{feature.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { icon: ListTodo, title: 'Add your work', body: 'Enter assignments, classes and exams once — or set recurring classes and let the calendar fill itself.' },
    { icon: Sparkles, title: 'Get your plan', body: 'StudentOS scores everything and builds a realistic study schedule, telling you exactly what to start with.' },
    { icon: BarChart3, title: 'Stay on track', body: 'Focus with the timer, complete tasks, build streaks and watch your productivity score climb.' },
  ]
  return (
    <section className="bg-muted/40 border-y">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How it works</h2>
          <p className="text-muted-foreground mt-3 text-lg">Three steps to a calmer, more productive semester.</p>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="text-center">
              <div className="bg-card relative mx-auto flex size-14 items-center justify-center rounded-2xl border shadow-sm">
                <step.icon aria-hidden className="text-primary size-6" />
                <span className="bg-primary text-primary-foreground absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold">
                  {index + 1}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{step.title}</h3>
              <p className="text-muted-foreground mx-auto mt-1.5 max-w-xs text-sm">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Testimonials() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Loved by students</h2>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((testimonial) => (
          <Card key={testimonial.name} className="py-5">
            <CardContent className="space-y-4">
              <p className="text-pretty">&ldquo;{testimonial.quote}&rdquo;</p>
              <div>
                <p className="text-sm font-semibold">{testimonial.name}</p>
                <p className="text-muted-foreground text-xs">{testimonial.role}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="bg-muted/40 scroll-mt-20 border-y">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Simple, student-friendly pricing</h2>
          <p className="text-muted-foreground mt-3 text-lg">Start free. Upgrade when you're ready. Cancel anytime.</p>
        </div>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {PLAN_ORDER.map((planId) => {
            const plan = PLANS[planId]
            const highlighted = planId === 'pro'
            return (
              <Card
                key={planId}
                className={cn('relative flex flex-col', highlighted && 'border-primary ring-primary/20 shadow-md ring-1')}
              >
                {highlighted ? (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Sparkles className="size-3" /> Most popular
                  </Badge>
                ) : null}
                <CardContent className="flex flex-1 flex-col pt-6">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-muted-foreground text-sm">{plan.tagline}</p>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-bold">{formatPlanPrice(plan.monthlyPrice)}</span>
                    {plan.monthlyPrice > 0 ? <span className="text-muted-foreground text-sm">/mo</span> : null}
                  </div>
                  <ul className="mt-5 mb-6 flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check aria-hidden className="text-success mt-0.5 size-4 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild variant={highlighted ? 'default' : 'outline'} className="w-full">
                    <Link to="/auth/register">
                      {planId === 'free' ? 'Get started free' : `Choose ${plan.name}`}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="border-b">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 py-4 text-left font-medium"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {q}
        <ChevronDown className={cn('text-muted-foreground size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <p className="text-muted-foreground pb-4 text-sm">{a}</p> : null}
    </div>
  )
}

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 md:px-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Questions &amp; answers</h2>
      </div>
      <div className="mt-10">
        {FAQS.map((faq) => (
          <FaqItem key={faq.q} q={faq.q} a={faq.a} />
        ))}
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
      <div className="from-primary relative overflow-hidden rounded-3xl bg-gradient-to-br to-indigo-600 px-6 py-16 text-center text-white">
        <h2 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
          Your calmest, most productive semester starts today
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-white/90">
          Join thousands of students who always know what to do next.
        </p>
        <Button asChild size="lg" variant="secondary" className="mt-8">
          <Link to="/auth/register">
            Start free <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm md:flex-row md:px-6">
        <Logo />
        <p>© {new Date().getFullYear()} Life OS · StudentOS. All rights reserved.</p>
        <div className="flex gap-4">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          <Link to="/auth/login" className="hover:text-foreground transition-colors">Sign in</Link>
        </div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  return (
    <div className="bg-background min-h-dvh">
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
