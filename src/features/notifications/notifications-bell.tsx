import { formatDistanceToNow, parseISO } from 'date-fns'
import { Bell, BookOpen, CheckCheck, Flame, GraduationCap, Info, PiggyBank, Timer, Trophy, X } from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useNotificationActions, useNotifications } from '@/features/notifications/hooks'
import { cn } from '@/lib/utils'
import type { NotificationKind } from '@/types/models'

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  assignment_due: BookOpen,
  exam: GraduationCap,
  habit: Flame,
  budget: PiggyBank,
  study: Timer,
  achievement: Trophy,
  system: Info,
}

export function NotificationsBell() {
  const { data: notifications = [] } = useNotifications()
  const { markRead, markAllRead, remove } = useNotificationActions()
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)

  const unreadCount = notifications.filter((n) => n.read_at === null).length

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
          }
        >
          <Bell />
          {unreadCount > 0 ? (
            <span
              aria-hidden
              className="bg-destructive text-destructive-foreground absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-[9px] font-bold"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-96">
          {notifications.length === 0 ? (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              You're all caught up 🎉
            </p>
          ) : (
            <ul>
              {notifications.slice(0, 20).map((notification) => {
                const Icon = KIND_ICON[notification.kind]
                const unread = notification.read_at === null
                return (
                  <li key={notification.id} className="group relative border-b last:border-b-0">
                    <button
                      type="button"
                      className={cn(
                        'hover:bg-accent flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                        unread && 'bg-primary/4',
                      )}
                      onClick={() => {
                        if (unread) markRead.mutate(notification.id)
                        setOpen(false)
                        if (notification.action_url) navigate(notification.action_url)
                      }}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                          unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Icon aria-hidden className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm', unread && 'font-medium')}>
                          {notification.title}
                        </span>
                        {notification.body ? (
                          <span className="text-muted-foreground block truncate text-xs">
                            {notification.body}
                          </span>
                        ) : null}
                        <span className="text-muted-foreground/70 block text-[10px]">
                          {formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true })}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Dismiss notification"
                      className="text-muted-foreground hover:text-foreground absolute top-2 right-2 hidden group-hover:block"
                      onClick={() => remove.mutate(notification.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
