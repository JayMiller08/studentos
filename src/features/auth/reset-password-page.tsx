import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
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
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas'
import { authService } from '@/services/auth-service'

/**
 * Landing page for the Supabase recovery link. The link signs the user in
 * with a temporary recovery session; submitting here sets the new password.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  async function onSubmit(values: ResetPasswordValues) {
    setSubmitError(null)
    try {
      await authService.updatePassword(values.password)
      toast.success('Password updated — welcome back!')
      navigate('/app', { replace: true })
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Unable to update the password. The link may have expired — request a new one.',
      )
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Choose a new password</CardTitle>
        <CardDescription>Set a strong password you haven't used before</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
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
              Update password
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
