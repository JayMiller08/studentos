import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .pipe(z.email('Enter a valid email address'))

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(72, 'At most 72 characters')
  .regex(/[a-zA-Z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number')

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean(),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { error: 'You must accept the terms to continue' }),
})
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
