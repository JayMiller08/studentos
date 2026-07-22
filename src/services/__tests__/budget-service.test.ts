import { describe, expect, it } from 'vitest'
import { monthKey, summarize } from '@/services/budget-service'
import type { Budget, Transaction } from '@/types/models'

const NOW = new Date('2026-07-15T12:00:00') // mid-month (15 of 31 days)

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'b1',
    user_id: 'u1',
    month: '2026-07-01',
    currency: 'USD',
    planned_income: 1000,
    spending_limit: 700,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  }
}

function tx(type: 'income' | 'expense', amount: number, category = 'other'): Transaction {
  return {
    id: crypto.randomUUID(),
    user_id: 'u1',
    budget_month: '2026-07-01',
    type,
    amount,
    category,
    note: null,
    occurred_on: '2026-07-10',
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  }
}

describe('monthKey', () => {
  it('returns the first-of-month key', () => {
    expect(monthKey(new Date('2026-07-15T00:00:00'))).toBe('2026-07-01')
    expect(monthKey(new Date('2026-12-31T23:00:00'))).toBe('2026-12-01')
  })
})

describe('summarize', () => {
  it('totals income, expenses and remaining', () => {
    const summary = summarize(
      makeBudget(),
      [tx('income', 1000), tx('expense', 200, 'food'), tx('expense', 100, 'transport')],
      NOW,
    )
    expect(summary.income).toBe(1000)
    expect(summary.expenses).toBe(300)
    expect(summary.remaining).toBe(400) // 700 limit - 300
    expect(summary.usedPercent).toBe(43)
  })

  it('groups and sorts spending by category', () => {
    const summary = summarize(
      makeBudget(),
      [tx('expense', 50, 'food'), tx('expense', 120, 'housing'), tx('expense', 30, 'food')],
      NOW,
    )
    expect(summary.byCategory[0]).toEqual({ category: 'housing', amount: 120 })
    expect(summary.byCategory[1]).toEqual({ category: 'food', amount: 80 })
  })

  it('projects month-end spend from the run rate', () => {
    // 150 spent by day 15 of a 31-day month → ~310 projected.
    const summary = summarize(makeBudget(), [tx('expense', 150)], NOW)
    expect(summary.projectedSpend).toBeCloseTo((150 / 15) * 31, 1)
    expect(summary.onTrack).toBe(true)
  })

  it('flags off-track when projection exceeds the limit', () => {
    const summary = summarize(makeBudget({ spending_limit: 200 }), [tx('expense', 150)], NOW)
    expect(summary.onTrack).toBe(false)
  })
})
