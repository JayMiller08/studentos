import { Flame, LogOut, Menu, Settings as SettingsIcon, User } from 'lucide-react'
import * as React from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { MOBILE_NAV_ITEMS, navSectionsForRole, type NavItem } from '@/app/navigation'
import { useAuth } from '@/app/providers/auth-provider'
import { XpBar } from '@/components/ui/xp-bar'
import { effectiveStreak } from '@/lib/streak'
import { levelProgress } from '@/services/gamification-service'
import { Logo } from '@/components/logo'
import { LevelChip } from '@/components/ui/level-chip'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationsBell } from '@/features/notifications/notifications-bell'
import { useReminderGeneration } from '@/features/notifications/hooks'
import { InstallBanner } from '@/features/pwa/install-banner'
import { ProductTour } from '@/features/tour/product-tour'
import { TourButton } from '@/features/tour/tour-button'
import { TourProvider } from '@/features/tour/tour-provider'
import { WhatsNewDialog } from '@/features/updates/whats-new-dialog'
import { ConnectionBanner } from '@/components/connection-banner'
import { CookieConsent } from '@/components/cookie-consent'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn, getInitials } from '@/lib/utils'

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { profile } = useAuth()
  const sections = navSectionsForRole(profile?.role)
  return (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.label ?? 'root'} className="flex flex-col gap-0.5">
          {section.label ? (
            <p className="text-muted-foreground px-3 pb-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
              {section.label}
            </p>
          ) : null}
          {section.items.map((item) => (
            <SidebarLink key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  )
}

/**
 * One nav row.
 *
 * The active row gets three cues at once - a tint, a lit accent bar and a
 * coloured icon - because a single cue (the old grey fill) is easy to miss at
 * a glance, and "where am I" should never take a second look.
 */
function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
          isActive
            ? 'bg-primary/10 text-foreground dark:bg-primary/15'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive ? (
            <span
              aria-hidden
              className="bg-primary absolute inset-y-2 left-0 w-[3px] rounded-full shadow-[0_0_12px_var(--glow-primary)]"
            />
          ) : null}
          <item.icon
            aria-hidden
            className={cn(
              'size-4.5 shrink-0 transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
            )}
          />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

/**
 * The student's progress, pinned under the navigation.
 *
 * Level, XP and streak are the reason to come back tomorrow, and they used to
 * be a 60-pixel chip in the header. Here they are always in view on desktop,
 * one click from the achievements page.
 */
function SidebarPlayerCard({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, user } = useAuth()
  if (!profile) return null
  const progress = levelProgress(profile.xp)
  const streak = effectiveStreak(profile)
  const name = profile.full_name ?? user?.email ?? 'Student'
  const streakText = streak > 0 ? `, ${streak}-day streak` : ''

  return (
    <div className="border-sidebar-border border-t p-3">
      <Link
        to="/app/achievements"
        onClick={onNavigate}
        aria-label={`${name}: level ${progress.level}, ${profile.xp.toLocaleString()} XP${streakText}. View achievements`}
        className="bg-card shadow-e1 hover:shadow-e2 focus-visible:ring-ring/60 block rounded-xl border p-3 transition-shadow focus-visible:ring-2 focus-visible:outline-none"
      >
        <div className="flex items-center gap-2.5">
          <Avatar className="size-9">
            {profile.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
            <AvatarFallback className="text-xs">{getInitials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="text-muted-foreground text-xs tabular-nums">
              Level {progress.level} &middot; {profile.xp.toLocaleString()} XP
            </p>
          </div>
          {streak > 0 ? (
            <span className="text-streak inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums">
              <Flame aria-hidden className="size-4" />
              {streak}
            </span>
          ) : null}
        </div>
        <XpBar
          compact
          level={progress.level}
          current={progress.current}
          needed={progress.needed}
          className="mt-3"
        />
      </Link>
    </div>
  )
}

function UserMenu() {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const name = profile?.full_name ?? user?.email ?? 'Student'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="focus-visible:ring-ring/60 rounded-full outline-none focus-visible:ring-2"
        >
          <Avatar>
            {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/app/settings')}>
          <User /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/app/settings')}>
          <SettingsIcon /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            void signOut().then(() => navigate('/auth/login'))
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function LevelBadge() {
  const { profile } = useAuth()
  if (!profile) return null
  const progress = levelProgress(profile.xp)
  return (
    <LevelChip
      level={progress.level}
      percent={progress.percent}
      // Tablet only. Below `sm` there is no room; from `lg` the sidebar's
      // player card shows the same level, and saying it twice on one screen
      // (three times on the dashboard) is noise, not emphasis.
      className="hidden sm:inline-flex lg:hidden"
    />
  )
}

function DemoBanner() {
  const { isDemo } = useAuth()
  if (!isDemo) return null
  return (
    <div
      role="status"
      className="border-glass-border bg-primary/10 text-foreground border-b px-4 py-1.5 text-center text-xs font-medium"
    >
      Local demo mode — data is stored on this device only. Configure Supabase to enable accounts
      &amp; sync.
    </div>
  )
}

function MobileBottomNav() {
  return (
    <nav
      data-tour="mobile-nav"
      aria-label="Primary"
      className="bg-card/95 border-glass-border supports-[backdrop-filter]:bg-glass fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {MOBILE_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* A pill behind the active icon, the way native tab bars do it:
                    colour alone is a weak cue on a small target. */}
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200',
                    isActive && 'bg-primary/15',
                  )}
                >
                  <item.icon aria-hidden className="size-5" />
                </span>
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)
  // Synthesizes today's assignment/exam reminders once per session.
  useReminderGeneration()

  return (
    <TourProvider>
      <div className="min-h-dvh">
        <a
          href="#main-content"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>

        {/* Desktop sidebar */}
        <aside
          data-tour="nav"
          className="border-sidebar-border bg-sidebar/85 fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r backdrop-blur-xl lg:flex"
        >
          <div className="flex h-16 shrink-0 items-center px-5">
            <NavLink to="/app" aria-label="StudentOS dashboard">
              <Logo />
            </NavLink>
          </div>
          <SidebarNav />
          <SidebarPlayerCard />
        </aside>

        <div className="flex min-h-dvh flex-col lg:pl-64">
          <ConnectionBanner />
          <DemoBanner />

          {/* Topbar */}
          <header className="bg-background/95 border-glass-border supports-[backdrop-filter]:bg-glass sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-xl md:px-6">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-full flex-col">
                  <div className="flex h-16 shrink-0 items-center px-5">
                    <Logo />
                  </div>
                  <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
                  <SidebarPlayerCard onNavigate={() => setMobileNavOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <NavLink to="/app" className="lg:hidden" aria-label="StudentOS dashboard">
              <Logo showWordmark={false} />
            </NavLink>

            <div data-tour="topbar" className="ml-auto flex items-center gap-1.5">
              <LevelBadge />
              <TourButton />
              <NotificationsBell />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>

          <main
            id="main-content"
            className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-24 md:px-6 lg:pb-10"
          >
            <Outlet />
          </main>
        </div>

        <MobileBottomNav />
        <InstallBanner />
        <ProductTour />
        <WhatsNewDialog />
        <CookieConsent />
      </div>
    </TourProvider>
  )
}
