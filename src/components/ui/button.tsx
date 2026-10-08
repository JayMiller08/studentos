import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // primary-strong, not primary: the fill sits behind a white label and
        // needs 4.5:1, which the lighter accent value does not reach in dark mode.
        //
        // The glow and the inset top edge are what make this read as the one
        // thing to press. Both live in the shadow, not the fill: a lighter
        // gradient across the face would cut into the 4.5:1 the label needs.
        default:
          'bg-primary-strong text-primary-foreground shadow-button hover:shadow-button-hover hover:bg-primary-strong/92',
        destructive:
          'bg-destructive text-destructive-foreground shadow-e1 hover:bg-destructive/90',
        // text-card-foreground is not cosmetic: this variant sets a background
        // but used to inherit its text colour, so on a surface whose inherited
        // colour was near-black the label vanished into the dark card.
        outline:
          'border border-input bg-card text-card-foreground shadow-e1 hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-e1 hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-success text-success-foreground shadow-e1 hover:bg-success/90',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md px-3 text-xs gap-1.5',
        lg: 'h-11 rounded-lg px-6',
        icon: 'size-10',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
