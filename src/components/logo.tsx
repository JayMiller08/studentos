import { GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  showWordmark?: boolean
}

export function Logo({ className, showWordmark = true }: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="from-primary flex size-8 items-center justify-center rounded-lg bg-gradient-to-br to-indigo-500 text-white shadow-sm">
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
