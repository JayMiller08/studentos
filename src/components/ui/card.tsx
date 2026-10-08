import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The surface nearly everything sits on.
 *
 * Its top-edge sheen is applied from globals.css against `data-slot="card"`,
 * in the components layer, so a card that sets its own background image (the
 * HeroCard tint) overrides it without having to opt out.
 */
function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground shadow-e1 flex flex-col gap-5 rounded-xl border py-5',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className,
      )}
      {...props}
    />
  )
}

/**
 * A card's heading.
 *
 * A leading icon is drawn as a tinted tile, from here, for every card at once.
 * The tile takes its tint from the icon's own colour (`bg-current/12`), so a
 * warning icon gets a warm tile and a muted one a quiet tile without any card
 * having to say so. An outer `<svg>` is a CSS box, which is what makes padding
 * and a background on the icon itself possible.
 */
function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'leading-none font-semibold tracking-tight',
        '[&>svg]:bg-current/12 [&>svg]:size-7 [&>svg]:shrink-0 [&>svg]:rounded-lg [&>svg]:p-1.5',
        className,
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('flex items-center px-5', className)} {...props} />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
