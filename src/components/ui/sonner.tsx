import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from '@/app/providers/theme-provider'

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position="top-center"
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:rounded-xl group-[.toaster]:border-border group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
