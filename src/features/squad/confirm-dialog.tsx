import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export interface ConfirmDialogProps {
  /** The button that opens it. */
  trigger: React.ReactElement
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
}

/**
 * "Are you sure?" for the squad actions that cannot be taken back from this
 * side: leaving, removing someone, retiring a code a friend may be about to use.
 */
export function ConfirmDialog({ trigger, title, description, confirmLabel, onConfirm, destructive }: ConfirmDialogProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
