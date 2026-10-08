import { GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  showWordmark?: boolean
}

export function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {/* Tokens, not `indigo-500`: the mark now follows the theme like the
          rest of the chrome, and the glow ties it to the primary action. */}
      <span className="from-primary to-chart-2 text-primary-foreground flex size-8 items-center justify-center rounded-lg bg-gradient-to-br shadow-[0_4px_14px_-4px_var(--glow-primary)]">
        <GraduationCap aria-hidden className="size-5" />
      </span>
      {showWordmark ? (
        <span className="text-base font-semibold tracking-tight">
          Student<span className="text-primary">OS</span>
        </span>
      ) : null}
    </span>
  )
}
