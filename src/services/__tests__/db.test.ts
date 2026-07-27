import { describe, expect, it } from 'vitest'
import { DbError, friendlyDbErrorMessage, isUniqueViolation } from '@/services/db'

describe('isUniqueViolation', () => {
  it('is true for a Postgres unique_violation (23505)', () => {
    const error = new DbError('habit_logs', 'insert', 'duplicate key value violates unique constraint "habit_logs_habit_id_log_date_key"', '23505')
    expect(isUniqueViolation(error)).toBe(true)
  })

  it('is false for other Postgres error codes', () => {
    const error = new DbError('assignments', 'insert', 'null value in column "title"', '23502')
    expect(isUniqueViolation(error)).toBe(false)
  })

  it('is false for a DbError with no code and for non-DbError values', () => {
    expect(isUniqueViolation(new DbError('notes', 'update', 'boom'))).toBe(false)
    expect(isUniqueViolation(new Error('boom'))).toBe(false)
    expect(isUniqueViolation('boom')).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})

describe('friendlyDbErrorMessage', () => {
  it('never leaks raw Postgres/table internals for a unique violation', () => {
    const error = new DbError(
      'habit_logs',
      'insert',
      'duplicate key value violates unique constraint "habit_logs_habit_id_log_date_key"',
      '23505',
    )
    const message = friendlyDbErrorMessage(error)
    expect(message).not.toMatch(/habit_logs|constraint|duplicate key|insert on/i)
    expect(message.length).toBeLessThan(60)
  })

  it('falls back to a generic, non-technical message for other DbErrors', () => {
    const error = new DbError('assignments', 'update', 'permission denied for table assignments', '42501')
    const message = friendlyDbErrorMessage(error)
    expect(message).not.toMatch(/assignments|permission denied|update on/i)
  })

  it('passes through a plain Error message written for humans', () => {
    expect(friendlyDbErrorMessage(new Error('You need to be signed in.'))).toBe(
      'You need to be signed in.',
    )
  })

  it('has a safe default for non-Error values', () => {
    expect(friendlyDbErrorMessage('boom')).toBe('Something went wrong. Please try again.')
  })
})
