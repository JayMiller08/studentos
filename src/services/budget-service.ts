import { getDaysInMonth, parseISO } from 'date-fns'
import { byUser, table } from '@/services/db'
import { notificationsService } from '@/services/notifications-service'
import type { Budget, Goal, Transaction, TransactionType } from '@/types/models'

const budgets = () => table<Budget>('budgets')
const transactions = () => table<Transaction>('transactions')
const goals = () => table<Goal>('goals')

/** First-of-month key for a date, e.g. '2026-07-01'. */
export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export interface TransactionInput {
  type: TransactionType
  amount: number
  category: string
  note?: string | null
  occurred_on: string
}

export interface BudgetSummary {
  income: number
  expenses: number
  /** spending_limit − expenses (can be negative). */
  remaining: number
  /** Share of limit used, 0–100+. */
  usedPercent: number
  byCategory: Array<{ category: string; amount: number }>
  /** Straight-line projection of month-end spend from the run rate so far. */
  projectedSpend: number
  onTrack: boolean
}

export function summarize(
  budget: Budget,
  transactionList: Transaction[],
  now = new Date(),
): BudgetSummary {
  let income = 0
  let expenses = 0
  const byCategory = new Map<string, number>()

  for (const transaction of transactionList) {
    if (transaction.type === 'income') income += Number(transaction.amount)
    else {
      expenses += Number(transaction.amount)
      byCategory.set(
        transaction.category,
        (byCategory.get(transaction.category) ?? 0) + Number(transaction.amount),
      )
    }
  }

  const limit = Number(budget.spending_limit)
  const monthDate = parseISO(budget.month)
  const daysInMonth = getDaysInMonth(monthDate)
  const isCurrentMonth = monthKey(now) === budget.month
  const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth
  const projectedSpend = dayOfMonth > 0 ? (expenses / dayOfMonth) * daysInMonth : expenses

  return {
    income,
    expenses,
    remaining: limit - expenses,
    usedPercent: limit > 0 ? Math.round((expenses / limit) * 100) : 0,
    byCategory: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    projectedSpend,
    onTrack: limit <= 0 || projectedSpend <= limit,
  }
}

export const budgetService = {
  /** Fetch (or lazily create) the budget row for a month. */
  async getOrCreate(userId: string, month: string): Promise<Budget> {
    const existing = await budgets().list({
      filters: byUser(userId, [{ column: 'month', op: 'eq', value: month }]),
      limit: 1,
    })
    if (existing[0]) return existing[0]
    return budgets().insert({
      user_id: userId,
      month,
      currency: 'USD',
      planned_income: 0,
      spending_limit: 0,
    })
  },

  async updateBudget(id: string, patch: Partial<Pick<Budget, 'currency' | 'planned_income' | 'spending_limit'>>): Promise<Budget> {
    return budgets().update(id, patch)
  },

  async listTransactions(userId: string, month: string): Promise<Transaction[]> {
    return transactions().list({
      filters: byUser(userId, [{ column: 'budget_month', op: 'eq', value: month }]),
      orderBy: { column: 'occurred_on', ascending: false },
    })
  },

  /**
   * Record a transaction; fires a budget alert notification when spending
   * crosses 80% or 100% of the month's limit (once per threshold per month).
   */
  async addTransaction(
    userId: string,
    budget: Budget,
    input: TransactionInput,
  ): Promise<Transaction> {
    const created = await transactions().insert({
      user_id: userId,
      budget_month: budget.month,
      type: input.type,
      amount: input.amount,
      category: input.category,
      note: input.note ?? null,
      occurred_on: input.occurred_on,
    })

    if (input.type === 'expense' && Number(budget.spending_limit) > 0) {
      const monthTransactions = await budgetService.listTransactions(userId, budget.month)
      const summary = summarize(budget, monthTransactions)
      const before = summary.expenses - input.amount
      const limit = Number(budget.spending_limit)
      for (const threshold of [0.8, 1] as const) {
        if (before < limit * threshold && summary.expenses >= limit * threshold) {
          await notificationsService.push(userId, {
            kind: 'budget',
            title:
              threshold === 1
                ? 'Budget limit reached'
                : `You've used ${Math.round(threshold * 100)}% of this month's budget`,
            body: `Spent so far: ${summary.expenses.toFixed(2)} of ${limit.toFixed(2)}.`,
            action_url: '/app/budget',
          })
        }
      }
    }

    return created
  },

  async removeTransaction(id: string): Promise<void> {
    return transactions().remove(id)
  },

  async listGoals(userId: string): Promise<Goal[]> {
    return goals().list({
      filters: byUser(userId),
      orderBy: { column: 'created_at', ascending: true },
    })
  },

  async createGoal(userId: string, input: { name: string; target_amount: number; deadline?: string | null }): Promise<Goal> {
    return goals().insert({
      user_id: userId,
      name: input.name,
      target_amount: input.target_amount,
      saved_amount: 0,
      deadline: input.deadline ?? null,
      achieved_at: null,
    })
  },

  async addToGoal(goal: Goal, amount: number): Promise<Goal> {
    const saved = Number(goal.saved_amount) + amount
    return goals().update(goal.id, {
      saved_amount: saved,
      achieved_at:
        saved >= Number(goal.target_amount) && !goal.achieved_at
          ? new Date().toISOString()
          : goal.achieved_at,
    })
  },

  async removeGoal(id: string): Promise<void> {
    return goals().remove(id)
  },
}
