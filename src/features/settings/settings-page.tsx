import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Monitor, Moon, Sun } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '@/app/providers/auth-provider'
import { useTheme } from '@/app/providers/theme-provider'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
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
import { cn } from '@/lib/utils'
import type { NotificationPrefs } from '@/types/models'

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(80),
  university: z.string().trim().max(120),
  degree: z.string().trim().max(120),
  semester: z.string(),
  timezone: z.string().min(1, 'Timezone is required'),
})
type ProfileValues = z.infer<typeof profileSchema>

const NOTIFICATION_OPTIONS: Array<{ key: keyof NotificationPrefs; label: string; description: string }> = [
  { key: 'assignments', label: 'Assignment reminders', description: 'Deadlines approaching and overdue work' },
  { key: 'exams', label: 'Exam reminders', description: 'Upcoming exams from your calendar' },
  { key: 'habits', label: 'Habit reminders', description: 'Daily nudges for your habits' },
  { key: 'budget', label: 'Budget alerts', description: 'When spending nears your monthly limit' },
  { key: 'study_reminders', label: 'Study reminders', description: 'Planned focus blocks and streaks' },
  { key: 'email_digest', label: 'Weekly email digest', description: 'A summary of your week, every Sunday' },
]

function ProfileTab() {
  const { profile, updateProfile } = useAuth()

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: {
      fullName: profile?.full_name ?? '',
      university: profile?.university ?? '',
      degree: profile?.degree ?? '',
      semester: profile?.semester ? String(profile.semester) : '1',
      timezone: profile?.timezone ?? 'UTC',
    },
  })

  const timezones = React.useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return ['UTC']
    }
  }, [])

  async function onSubmit(values: ProfileValues) {
    await updateProfile({
      full_name: values.fullName,
      university: values.university || null,
      degree: values.degree || null,
      semester: Number(values.semester),
      timezone: values.timezone,
    })
    toast.success('Profile updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your academic identity across StudentOS</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="university"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>University</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="degree"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Degree</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="semester"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Semester</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          Semester {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <FormControl>
                    <>
                      <Input list="settings-timezones" autoComplete="off" {...field} />
                      <datalist id="settings-timezones">
                        {timezones.map((tz) => (
                          <option key={tz} value={tz} />
                        ))}
                      </datalist>
                    </>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const { profile, updateProfile } = useAuth()

  const options = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>How StudentOS looks on this device</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={theme === option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors',
                  theme === option.value ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                )}
              >
                <option.icon aria-hidden className="size-5" />
                {option.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
          <CardDescription>Interface language (more languages coming soon)</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={profile?.language ?? 'en'}
            onValueChange={(value) => void updateProfile({ language: value })}
          >
            <SelectTrigger className="w-full sm:w-64" aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    </div>
  )
}

function NotificationsTab() {
  const { profile, updateProfile } = useAuth()
  const prefs = profile?.notification_prefs

  async function togglePref(key: keyof NotificationPrefs, value: boolean) {
    if (!prefs) return
    await updateProfile({ notification_prefs: { ...prefs, [key]: value } })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose what StudentOS reminds you about</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {NOTIFICATION_OPTIONS.map((option) => (
          <div key={option.key} className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor={`pref-${option.key}`}>{option.label}</Label>
              <p className="text-muted-foreground mt-0.5 text-sm">{option.description}</p>
            </div>
            <Switch
              id={`pref-${option.key}`}
              checked={prefs?.[option.key] ?? false}
              onCheckedChange={(checked) => void togglePref(option.key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your profile, preferences and notifications" />
      <Tabs defaultValue="profile">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <ProfileTab />
        </TabsContent>
        <TabsContent value="appearance" className="mt-4">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
