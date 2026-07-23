import { Outlet } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'

/** Centered card layout for the auth flow. */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 md:px-8">
        <Link to="/" aria-label="StudentOS home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
      <footer className="text-muted-foreground pb-6 text-center text-xs">
        © {new Date().getFullYear()} Life OS · StudentOS
      </footer>
    </div>
  )
}
