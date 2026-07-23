import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { useAuth } from '@/app/providers/auth-provider'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SA_INSTITUTIONS } from '@/lib/institutions'
import { cn } from '@/lib/utils'

const GOAL_OPTIONS = [
  { id: 'grades', emoji: '🎯', label: 'Improve my grades' },
  { id: 'productivity', emoji: '⏱️', label: 'Increase productivity' },
  { id: 'focus', emoji: '🧠', label: 'Stay focused' },
  { id: 'balance', emoji: '🧘', label: 'Achieve life balance' },
  { id: 'career', emoji: '🏔️', label: 'Have a successful career' },
  { id: 'money', emoji: '💰', label: 'Manage my money' },
] as const

const MAX_GOALS = 3

const stepOneSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(80),
  university: z.string().trim().max(120),
  degree: z.string().trim().max(120),
})
type StepOneValues = z.infer<typeof stepOneSchema>

const stepTwoSchema = z.object({
  semester: z.string().min(1, 'Select your semester'),
  timezone: z.string().min(1, 'Select your timezone'),
})
type StepTwoValues = z.infer<typeof stepTwoSchema>

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC', 'Africa/Johannesburg', 'Europe/London', 'America/New_York', 'Asia/Singapore']
  }
}

const STEPS = ['About you', 'Your studies', 'Your goals'] as const

export function OnboardingPage() {
  const { profile, updateProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = React.useState(0)
  const [saving, setSaving] = React.useState(false)
  const [selectedGoals, setSelectedGoals] = React.useState<string[]>(profile?.goals ?? [])

  const stepOneForm = useForm<StepOneValues>({
    resolver: zodResolver(stepOneSchema),
    defaultValues: {
      fullName: profile?.full_name ?? '',
      university: profile?.university ?? '',
      degree: profile?.degree ?? '',
    },
  })

  const stepTwoForm = useForm<StepTwoValues>({
    resolver: zodResolver(stepTwoSchema),
    defaultValues: {
      semester: profile?.semester ? String(profile.semester) : '1',
      timezone: profile?.timezone || detectTimezone(),
    },
  })

  function toggleGoal(goalId: string) {
    setSelectedGoals((current) => {
      if (current.includes(goalId)) return current.filter((id) => id !== goalId)
      if (current.length >= MAX_GOALS) return current
      return [...current, goalId]
    })
  }

  async function completeOnboarding() {
    setSaving(true)
    try {
      const stepOne = stepOneForm.getValues()
      const stepTwo = stepTwoForm.getValues()
      await updateProfile({
        full_name: stepOne.fullName,
        university: stepOne.university || null,
        degree: stepOne.degree || null,
        semester: Number(stepTwo.semester),
        timezone: stepTwo.timezone,
        goals: selectedGoals,
        onboarding_completed: true,
      })
      toast.success("You're all set — welcome to StudentOS!")
      navigate('/app', { replace: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save your profile')
    } finally {
      setSaving(false)
    }
  }

  const timezones = React.useMemo(timezoneOptions, [])

  return (
    <div className="bg-background flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-center">
        <Logo />
      </header>

      {/* Step indicator */}
      <div className="mx-auto w-full max-w-md px-4">
        <div className="mb-2 flex items-center gap-2" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length} aria-label="Onboarding progress">
          {STEPS.map((label, index) => (
            <React.Fragment key={label}>
              <div
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  index < step
                    ? 'bg-primary text-primary-foreground'
                    : index === step
                      ? 'bg-primary text-primary-foreground ring-primary/25 ring-4'
                      : 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {index < step ? <Check className="size-4" /> : index + 1}
              </div>
              {index < STEPS.length - 1 ? (
                <div
                  aria-hidden
                  className={cn('h-0.5 flex-1 rounded-full', index < step ? 'bg-primary' : 'bg-muted')}
                />
              ) : null}
            </React.Fragment>
          ))}
        </div>
        <p className="text-muted-foreground mb-4 text-center text-sm">{STEPS[step]}</p>
      </div>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-10">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {step === 0 ? (
            <Card>
              <CardContent className="pt-1">
                <h1 className="mb-1 text-xl font-semibold">Tell us about you</h1>
                <p className="text-muted-foreground mb-5 text-sm">
                  This personalizes your dashboard and schedule.
                </p>
                <Form {...stepOneForm}>
                  <form
                    className="space-y-4"
                    onSubmit={stepOneForm.handleSubmit(() => setStep(1))}
                    noValidate
                  >
                    <FormField
                      control={stepOneForm.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full name</FormLabel>
                          <FormControl>
                            <Input autoComplete="name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={stepOneForm.control}
                      name="university"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Institution</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select your institution" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {SA_INSTITUTIONS.map((name) => (
                                <SelectItem key={name} value={name}>
                                  {name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>Optional</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={stepOneForm.control}
                      name="degree"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Degree or programme</FormLabel>
                          <FormControl>
                            <Input placeholder="BSc Computer Science" {...field} />
                          </FormControl>
                          <FormDescription>Optional</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full">
                      Continue <ArrowRight />
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          ) : null}

          {step === 1 ? (
            <Card>
              <CardContent className="pt-1">
                <h1 className="mb-1 text-xl font-semibold">Your studies</h1>
                <p className="text-muted-foreground mb-5 text-sm">
                  Deadlines and reminders use your timezone.
                </p>
                <Form {...stepTwoForm}>
                  <form
                    className="space-y-4"
                    onSubmit={stepTwoForm.handleSubmit(() => setStep(2))}
                    noValidate
                  >
                    <FormField
                      control={stepTwoForm.control}
                      name="semester"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current semester</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select semester" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">Semester 1</SelectItem>
                              <SelectItem value="2">Semester 2</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={stepTwoForm.control}
                      name="timezone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Timezone</FormLabel>
                          <FormControl>
                            <Input list="timezone-options" autoComplete="off" {...field} />
                          </FormControl>
                          <datalist id="timezone-options">
                            {timezones.map((tz) => (
                              <option key={tz} value={tz} />
                            ))}
                          </datalist>
                          <FormDescription>Detected automatically — change if needed</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setStep(0)}>
                        <ArrowLeft /> Back
                      </Button>
                      <Button type="submit" className="flex-1">
                        Continue <ArrowRight />
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card>
              <CardContent className="pt-1">
                <h1 className="mb-1 text-xl font-semibold">What are your goals?</h1>
                <p className="text-muted-foreground mb-5 text-sm">
                  Choose up to {MAX_GOALS}. You can change these anytime in settings.
                </p>
                <div className="space-y-2.5" role="group" aria-label="Goals">
                  {GOAL_OPTIONS.map((goal) => {
                    const selected = selectedGoals.includes(goal.id)
                    const disabled = !selected && selectedGoals.length >= MAX_GOALS
                    return (
                      <button
                        key={goal.id}
                        type="button"
                        onClick={() => toggleGoal(goal.id)}
                        aria-pressed={selected}
                        disabled={disabled}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors',
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-accent disabled:opacity-40',
                        )}
                      >
                        <span aria-hidden className="text-xl">
                          {goal.emoji}
                        </span>
                        <span className="flex-1 font-medium">{goal.label}</span>
                        <span
                          aria-hidden
                          className={cn(
                            'flex size-5 items-center justify-center rounded-md border transition-colors',
                            selected ? 'bg-primary border-primary text-primary-foreground' : '',
                          )}
                        >
                          {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-5 flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft /> Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={saving}
                    onClick={() => void completeOnboarding()}
                  >
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    Finish setup
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </motion.div>
      </main>
    </div>
  )
}
