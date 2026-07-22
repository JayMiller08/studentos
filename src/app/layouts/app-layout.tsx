import { LogOut, Menu, Settings as SettingsIcon, User } from 'lucide-react'
import * as React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { MOBILE_NAV_ITEMS, NAV_SECTIONS, type NavItem } from '@/app/navigation'
import { useAuth } from '@/app/providers/auth-provider'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationsBell } from '@/features/notifications/notifications-bell'
import { useReminderGeneration } from '@/features/notifications/hooks'
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
  return (
    <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label ?? 'root'} className="flex flex-col gap-1">
          {section.label ? (
            <p className="text-muted-foreground px-3 pb-1 text-xs font-medium tracking-wide uppercase">
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

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-primary'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )
      }
    >
      <item.icon aria-hidden className="size-4.5 shrink-0" />
      {item.label}
    </NavLink>
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

function DemoBanner() {
  const { isDemo } = useAuth()
  if (!isDemo) return null
  return (
    <div className="bg-secondary text-secondary-foreground px-4 py-1.5 text-center text-xs font-medium">
      Local demo mode — data is stored on this device only. Configure Supabase to enable accounts
      &amp; sync.
    </div>
  )
}

function MobileBottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur supports-[backdrop-filter]:bg-card/80 lg:hidden"
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
                'flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            <item.icon aria-hidden className="size-5" />
            <span className="truncate">{item.label}</span>
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
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <NavLink to="/app" aria-label="StudentOS dashboard">
            <Logo />
          </NavLink>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64">
        <DemoBanner />

        {/* Topbar */}
        <header className="bg-background/95 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-16 items-center border-b px-5">
                <Logo />
              </div>
              <SidebarNav onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <NavLink to="/app" className="lg:hidden" aria-label="StudentOS dashboard">
            <Logo showWordmark={false} />
          </NavLink>

          <div className="ml-auto flex items-center gap-1.5">
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
    </div>
  )
}
