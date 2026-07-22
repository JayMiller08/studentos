import { z } from 'zod'

/**
 * Numeric form fields backed by text inputs.
 * HTML number inputs yield strings; `z.coerce.number()` types its input as
 * `unknown`, which breaks react-hook-form's field typing. These helpers keep
 * the input type at `string | number` (what inputs actually produce) while
 * validating against the provided number schema.
 */

export function numberField<S extends z.ZodType<number, number>>(schema: S) {
  return z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      const parsed = typeof value === 'string' ? Number(value) : value
      if (value === '' || Number.isNaN(parsed)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a number' })
        return z.NEVER
      }
      return parsed
    })
    .pipe(schema)
}

/** Like {@link numberField} but empty input is allowed and becomes `null`. */
export function optionalNumberField<S extends z.ZodType<number, number>>(schema: S) {
  return z
    .union([z.string(), z.number()])
    .transform((value, ctx) => {
      if (value === '') return null
      const parsed = typeof value === 'string' ? Number(value) : value
      if (Number.isNaN(parsed)) {
        ctx.addIssue({ code: 'custom', message: 'Enter a number' })
        return z.NEVER
      }
      return parsed
    })
    .pipe(schema.nullable())
}
