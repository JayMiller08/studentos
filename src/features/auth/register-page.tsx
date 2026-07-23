import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { OAuthButtons } from '@/features/auth/oauth-buttons'
import { registerSchema, type RegisterValues } from '@/features/auth/schemas'

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  let score: 0 | 1 | 2 | 3 = 0
  if (password.length >= 8) score = 1
  if (score === 1 && /[0-9]/.test(password) && /[a-zA-Z]/.test(password)) score = 2
  if (score === 2 && password.length >= 12 && /[^a-zA-Z0-9]/.test(password)) score = 3
  const labels: Record<0 | 1 | 2 | 3, string> = {
    0: 'Too weak',
    1: 'Okay',
    2: 'Good',
    3: 'Strong',
  }
  return { score, label: labels[score] }
}

export function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '', acceptTerms: false as unknown as true },
  })

  const password = form.watch('password')
  const strength = passwordStrength(password)

  async function onSubmit(values: RegisterValues) {
    setSubmitError(null)
    try {
      const { needsVerification } = await signUp(values.email, values.password, values.fullName)
      if (needsVerification) {
        navigate(`/auth/verify-email?email=${encodeURIComponent(values.email)}`, { replace: true })
      } else {
        navigate('/onboarding', { replace: true })
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to create your account')
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription>Join thousands of students who always know what's next</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" placeholder="Alex Mokoena" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@university.edu"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  {password ? (
                    <div className="flex items-center gap-2" aria-live="polite">
                      <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                        <div
                          className={
                            strength.score <= 1
                              ? 'bg-destructive h-full transition-all'
                              : strength.score === 2
                                ? 'bg-warning h-full transition-all'
                                : 'bg-success h-full transition-all'
                          }
                          style={{ width: `${((strength.score + 1) / 4) * 100}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground text-xs">{strength.label}</span>
                    </div>
                  ) : (
                    <FormDescription>At least 8 characters with a letter and a number</FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="acceptTerms"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-row items-start gap-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="text-muted-foreground font-normal">
                      I agree to the Terms of Service and Privacy Policy
                    </FormLabel>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError ? (
              <p role="alert" className="text-destructive text-sm">
                {submitError}
              </p>
            ) : null}

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Create account
            </Button>
          </form>
        </Form>

        <OAuthButtons />

        <p className="text-muted-foreground mt-6 text-center text-sm">
          Already have an account?{' '}
          <Link to="/auth/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
