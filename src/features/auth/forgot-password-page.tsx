import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MailCheck } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas'
import { authService } from '@/services/auth-service'

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: ForgotPasswordValues) {
    setSubmitError(null)
    try {
      await authService.requestPasswordReset(values.email)
      setSentTo(values.email)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to send the reset email')
    }
  }

  if (sentTo) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="bg-success/15 text-success flex size-14 items-center justify-center rounded-full">
            <MailCheck aria-hidden className="size-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">Check your inbox</h1>
            <p className="text-muted-foreground text-sm">
              If an account exists for <span className="font-medium">{sentTo}</span>, we sent a link
              to reset your password.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/auth/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>Enter your email and we'll send you a reset link</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
            {submitError ? (
              <p role="alert" className="text-destructive text-sm">
                {submitError}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Send reset link
            </Button>
          </form>
        </Form>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Remembered it?{' '}
          <Link to="/auth/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
