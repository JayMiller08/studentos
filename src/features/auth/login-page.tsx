import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { loginSchema, type LoginValues } from '@/features/auth/schemas'

export function LoginPage() {
  const { signIn, isDemo } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true },
  })

  async function onSubmit(values: LoginValues) {
    setSubmitError(null)
    try {
      await signIn(values.email, values.password, values.remember)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from ?? '/app', { replace: true })
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to sign in')
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to your academic command center</CardDescription>
      </CardHeader>
      <CardContent>
        {isDemo ? (
          <p className="bg-secondary text-secondary-foreground mb-4 rounded-lg px-3 py-2 text-xs">
            Demo mode: enter any email and password to explore StudentOS on this device.
          </p>
        ) : null}
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
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Password</FormLabel>
                    <Link
                      to="/auth/forgot-password"
                      className="text-primary text-sm hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="remember"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="font-normal">Remember me on this device</FormLabel>
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
              Sign in
            </Button>
          </form>
        </Form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          New to StudentOS?{' '}
          <Link to="/auth/register" className="text-primary font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
