import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { DollarSign, Flag, Megaphone, Trash2, UserCheck, Users } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency, getInitials } from '@/lib/utils'
import { queryKeys } from '@/lib/query-keys'
import { adminService } from '@/services/admin-service'
import type { Plan, SupportTicket } from '@/types/models'

function MetricsRow() {
  const { data: metrics } = useQuery({
    queryKey: [...queryKeys.adminUsers(), 'metrics'],
    queryFn: () => adminService.metrics(),
  })

  const cards = [
    { icon: Users, label: 'Total users', value: metrics ? String(metrics.totalUsers) : '—' },
    { icon: UserCheck, label: 'Onboarded', value: metrics ? String(metrics.onboarded) : '—' },
    {
      icon: DollarSign,
      label: 'Est. MRR',
      value: metrics ? formatCurrency(metrics.mrrUsd) : '—',
    },
    {
      icon: Flag,
      label: 'Paid users',
      value: metrics ? String(metrics.byPlan.pro + metrics.byPlan.elite) : '—',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className="gap-1 py-4">
          <CardContent className="space-y-1">
            <card.icon aria-hidden className="text-primary size-4" />
            <p className="text-2xl font-semibold">{card.value}</p>
            <p className="text-muted-foreground text-xs">{card.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function UsersTab() {
  const queryClient = useQueryClient()
  const { data: users = [] } = useQuery({
    queryKey: queryKeys.adminUsers(),
    queryFn: () => adminService.listUsers(),
  })
  const [search, setSearch] = React.useState('')

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers() })
  }

  const setPlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: Plan }) => adminService.setUserPlan(id, plan),
    onSuccess: () => {
      invalidate()
      toast.success('Plan updated')
    },
  })

  const filtered = users.filter(
    (user) =>
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.full_name ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Users</CardTitle>
        <CardDescription>{users.length} total</CardDescription>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email…"
          className="mt-2 max-w-sm"
          aria-label="Search users"
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-150 text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="pb-2 font-medium">User</th>
              <th className="pb-2 font-medium">Joined</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Plan</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.slice(0, 100).map((user) => (
              <tr key={user.id}>
                <td className="py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="bg-secondary text-secondary-foreground flex size-8 items-center justify-center rounded-full text-xs font-medium">
                      {getInitials(user.full_name ?? user.email)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{user.full_name ?? '—'}</p>
                      <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="text-muted-foreground py-2.5 text-xs">
                  {format(parseISO(user.created_at), 'd MMM yyyy')}
                </td>
                <td className="py-2.5">
                  {user.role === 'admin' ? (
                    <Badge variant="default">Admin</Badge>
                  ) : (
                    <Badge variant="muted">Student</Badge>
                  )}
                </td>
                <td className="py-2.5">
                  <Select
                    value={user.plan}
                    onValueChange={(value) => setPlan.mutate({ id: user.id, plan: value as Plan })}
                  >
                    <SelectTrigger size="sm" className="w-28" aria-label={`Plan for ${user.email}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="elite">Elite</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">No users match your search.</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function FlagsTab() {
  const queryClient = useQueryClient()
  const { data: flags = [] } = useQuery({
    queryKey: queryKeys.adminFlags(),
    queryFn: () => adminService.listFlags(),
  })

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      adminService.toggleFlag(id, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminFlags() })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Feature flags</CardTitle>
        <CardDescription>Roll features out or back without a deploy</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {flags.length === 0 ? (
          <p className="text-muted-foreground text-sm">No feature flags configured.</p>
        ) : (
          flags.map((flag) => (
            <div key={flag.id} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor={`flag-${flag.id}`} className="font-mono">
                  {flag.key}
                </Label>
                {flag.description ? (
                  <p className="text-muted-foreground mt-0.5 text-sm">{flag.description}</p>
                ) : null}
              </div>
              <Switch
                id={`flag-${flag.id}`}
                checked={flag.enabled}
                onCheckedChange={(checked) => toggle.mutate({ id: flag.id, enabled: checked })}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function AnnouncementsTab() {
  const queryClient = useQueryClient()
  const { data: announcements = [] } = useQuery({
    queryKey: queryKeys.adminAnnouncements(),
    queryFn: () => adminService.listAnnouncements(),
  })
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [level, setLevel] = React.useState<'info' | 'warning' | 'critical'>('info')

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminAnnouncements() })

  const create = useMutation({
    mutationFn: () =>
      adminService.createAnnouncement({ title, body, level, publish: true }),
    onSuccess: () => {
      invalidate()
      setTitle('')
      setBody('')
      toast.success('Announcement published')
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => adminService.removeAnnouncement(id),
    onSuccess: invalidate,
  })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New announcement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input id="ann-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea id="ann-body" rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-level">Severity</Label>
            <Select value={level} onValueChange={(value) => setLevel(value as typeof level)}>
              <SelectTrigger id="ann-level" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!title.trim() || !body.trim() || create.isPending}
          >
            <Megaphone /> Publish
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Published</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {announcements.length === 0 ? (
            <p className="text-muted-foreground text-sm">No announcements yet.</p>
          ) : (
            announcements.map((announcement) => (
              <div key={announcement.id} className="flex items-start gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        announcement.level === 'critical'
                          ? 'destructive'
                          : announcement.level === 'warning'
                            ? 'warning'
                            : 'muted'
                      }
                    >
                      {announcement.level}
                    </Badge>
                    <p className="truncate text-sm font-medium">{announcement.title}</p>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{announcement.body}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete announcement"
                  onClick={() => remove.mutate(announcement.id)}
                >
                  <Trash2 className="text-muted-foreground size-3.5" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TicketsTab() {
  const queryClient = useQueryClient()
  const { data: tickets = [] } = useQuery({
    queryKey: queryKeys.adminTickets(),
    queryFn: () => adminService.listTickets(),
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SupportTicket['status'] }) =>
      adminService.setTicketStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminTickets() })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Support tickets</CardTitle>
        <CardDescription>{tickets.filter((t) => t.status !== 'resolved').length} open</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {tickets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No support tickets.</p>
        ) : (
          tickets.map((ticket) => (
            <div key={ticket.id} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{ticket.subject}</p>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{ticket.body}</p>
              </div>
              <Select
                value={ticket.status}
                onValueChange={(value) =>
                  setStatus.mutate({ id: ticket.id, status: value as SupportTicket['status'] })
                }
              >
                <SelectTrigger size="sm" className="w-32" aria-label="Ticket status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function AdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Admin" description="Manage users, subscriptions, features and support" />
      <MetricsRow />
      <Tabs defaultValue="users">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="flags">Feature flags</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="tickets">Support</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="flags" className="mt-4">
          <FlagsTab />
        </TabsContent>
        <TabsContent value="announcements" className="mt-4">
          <AnnouncementsTab />
        </TabsContent>
        <TabsContent value="tickets" className="mt-4">
          <TicketsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
