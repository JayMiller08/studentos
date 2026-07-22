import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="bg-secondary text-secondary-foreground flex size-14 items-center justify-center rounded-full">
        <Compass aria-hidden className="size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          The page you're looking for doesn't exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/app">Back to dashboard</Link>
      </Button>
    </div>
  )
}
