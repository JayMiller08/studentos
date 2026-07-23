import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, format, parseISO, subMonths } from 'date-fns'
import {
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Plus,
  Settings2,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from 'recharts'
import { useAuth } from '@/app/providers/auth-provider'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { numberField, optionalNumberField } from '@/lib/forms'
import { queryKeys } from '@/lib/query-keys'
import { cn, formatCurrency, percent, todayKey } from '@/lib/utils'
import { budgetService, monthKey, summarize } from '@/services/budget-service'
import { EXPENSE_CATEGORIES } from '@/types/models'
import type { Budget, Goal } from '@/types/models'

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food', transport: 'Transport', housing: 'Housing', books: 'Books',
  tuition: 'Tuition', entertainment: 'Fun', health: 'Health',
  subscriptions: 'Subscriptions', other: 'Other',
}

const PIE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--muted-foreground)']

const transactionSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: numberField(z.number().positive('Enter an amount').max(1_000_000)),
  category: z.string().min(1),
  note: z.string().trim().max(200),
  occurredOn: z.string().min(1, 'Pick a date'),
})

const settingsSchema = z.object({
  currency: z.string().trim().length(3, '3-letter code, e.g. ZAR'),
  plannedIncome: numberField(z.number().min(0).max(10_000_000)),
  spendingLimit: numberField(z.number().min(0).max(10_000_000)),
})

const goalSchema = z.object({
  name: z.string().trim().min(2, 'Name your goal').max(80),
  targetAmount: numberField(z.number().positive().max(10_000_000)),
  deadline: z.string(),
})

const depositSchema = z.object({
  amount: optionalNumberField(z.number().positive().max(10_000_000)),
})

export function BudgetPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [monthAnchor, setMonthAnchor] = React.useState(() => new Date())
  const month = monthKey(monthAnchor)

  const budgetQuery = useQuery({
    queryKey: [...queryKeys.budgets(user?.id ?? ''), month],
    queryFn: () => budgetService.getOrCreate(user!.id, month),
    enabled: Boolean(user),
  })
  const transactionsQuery = useQuery({
    queryKey: queryKeys.transactions(user?.id ?? '', month),
    queryFn: () => budgetService.listTransactions(user!.id, month),
    enabled: Boolean(user),
  })
  const goalsQuery = useQuery({
    queryKey: queryKeys.savingsGoals(user?.id ?? ''),
    queryFn: () => budgetService.listGoals(user!.id),
    enabled: Boolean(user),
  })

  const budget = budgetQuery.data
  const transactions = transactionsQuery.data ?? []
  const goals = goalsQuery.data ?? []
  const currency = budget?.currency ?? 'ZAR'

  const summary = React.useMemo(
    () => (budget ? summarize(budget, transactions) : null),
    [budget, transactions],
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.transactions(user!.id, month) })
    void queryClient.invalidateQueries({ queryKey: [...queryKeys.budgets(user!.id), month] })
    void queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals(user!.id) })
  }

  const [txOpen, setTxOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [goalOpen, setGoalOpen] = React.useState(false)
  const [depositGoal, setDepositGoal] = React.useState<Goal | null>(null)

  const removeTransaction = useMutation({
    mutationFn: (id: string) => budgetService.removeTransaction(id),
    onSuccess: invalidate,
  })

  const summaryCards = summary && budget
    ? [
        { label: 'Income', value: formatCurrency(summary.income, currency), icon: TrendingUp },
        { label: 'Spent', value: formatCurrency(summary.expenses, currency), icon: TrendingDown },
        {
          label: 'Remaining',
          value:
            Number(budget.spending_limit) > 0
              ? formatCurrency(summary.remaining, currency)
              : '—',
          icon: Wallet,
          danger: Number(budget.spending_limit) > 0 && summary.remaining < 0,
        },
        {
          label: 'Saved toward goals',
          value: formatCurrency(
            goals.reduce((sum, goal) => sum + Number(goal.saved_amount), 0),
            currency,
          ),
          icon: PiggyBank,
        },
      ]
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description="Know where your money goes — before it's gone"
        actions={
          <>
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings2 /> Monthly budget
            </Button>
            <Button onClick={() => setTxOpen(true)}>
              <Plus /> Add transaction
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonthAnchor(subMonths(monthAnchor, 1))}>
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMonthAnchor(new Date())}>
          This month
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonthAnchor(addMonths(monthAnchor, 1))}>
          <ChevronRight />
        </Button>
        <span className="text-muted-foreground ml-2 text-sm font-medium">
          {format(monthAnchor, 'MMMM yyyy')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="gap-1 py-4">
            <CardContent className="space-y-1">
              <card.icon aria-hidden className={cn('size-4', card.danger ? 'text-destructive' : 'text-primary')} />
              <p className={cn('text-xl font-semibold', card.danger && 'text-destructive')}>{card.value}</p>
              <p className="text-muted-foreground text-xs">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {budget && summary && Number(budget.spending_limit) > 0 ? (
        <Card className="gap-3 py-4">
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {summary.usedPercent}% of {formatCurrency(Number(budget.spending_limit), currency)} used
              </span>
              <Badge variant={summary.onTrack ? 'success' : 'destructive'}>
                {summary.onTrack ? 'On track' : 'Over pace'}
              </Badge>
            </div>
            <Progress
              value={Math.min(100, summary.usedPercent)}
              indicatorClassName={summary.usedPercent >= 100 ? 'bg-destructive' : summary.usedPercent >= 80 ? 'bg-warning' : undefined}
            />
            <p className="text-muted-foreground text-xs">
              Projected month-end spend at the current pace:{' '}
              <span className={cn('font-medium', !summary.onTrack && 'text-destructive')}>
                {formatCurrency(summary.projectedSpend, currency)}
              </span>
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Spending by category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spending by category</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {summary && summary.byCategory.length > 0 ? (
              <div className="flex h-full items-center gap-4">
                <ResponsiveContainer width="55%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.byCategory}
                      dataKey="amount"
                      nameKey="category"
                      innerRadius="52%"
                      outerRadius="82%"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {summary.byCategory.map((entry, index) => (
                        <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      formatter={(value) => formatCurrency(Number(value), currency)}
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: '0.5rem',
                        color: 'var(--popover-foreground)',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-1.5 text-sm">
                  {summary.byCategory.slice(0, 6).map((entry, index) => (
                    <li key={entry.category} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                      />
                      <span className="text-muted-foreground flex-1">
                        {CATEGORY_LABELS[entry.category] ?? entry.category}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(entry.amount, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
                Add expenses to see the breakdown.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Savings goals */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Savings goals</CardTitle>
                <CardDescription>Put something aside every month</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setGoalOpen(true)}>
                <Plus /> Goal
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {goals.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                No goals yet — a laptop fund, an emergency cushion, a trip.
              </p>
            ) : (
              goals.map((goal) => {
                const pct = percent(Number(goal.saved_amount), Number(goal.target_amount))
                return (
                  <div key={goal.id} className="space-y-1.5 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Target aria-hidden className="text-primary size-3.5" /> {goal.name}
                        {goal.achieved_at ? <Badge variant="success">Achieved</Badge> : null}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDepositGoal(goal)}>
                          <Plus className="size-3" /> Add savings
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete goal ${goal.name}`}
                          onClick={() =>
                            budgetService.removeGoal(goal.id).then(invalidate)
                          }
                        >
                          <Trash2 className="text-muted-foreground size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} />
                    <p className="text-muted-foreground text-xs">
                      {formatCurrency(Number(goal.saved_amount), currency)} of{' '}
                      {formatCurrency(Number(goal.target_amount), currency)} ({pct}%)
                      {goal.deadline ? ` · by ${format(parseISO(goal.deadline), 'd MMM yyyy')}` : ''}
                    </p>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
          <CardDescription>{transactions.length} this month</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              No transactions yet this month.
            </p>
          ) : (
            <ul className="divide-y">
              {transactions.map((transaction) => (
                <li key={transaction.id} className="group flex items-center gap-3 py-2.5">
                  <Badge variant={transaction.type === 'income' ? 'success' : 'muted'}>
                    {CATEGORY_LABELS[transaction.category] ?? transaction.category}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {transaction.note || (transaction.type === 'income' ? 'Income' : 'Expense')}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {format(parseISO(transaction.occurred_on), 'd MMM')}
                  </span>
                  <span
                    className={cn(
                      'w-24 text-right text-sm font-semibold tabular-nums',
                      transaction.type === 'income' ? 'text-success' : '',
                    )}
                  >
                    {transaction.type === 'income' ? '+' : '−'}
                    {formatCurrency(Number(transaction.amount), currency)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete transaction"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => removeTransaction.mutate(transaction.id)}
                  >
                    <Trash2 className="text-muted-foreground size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {budget ? (
        <>
          <TransactionDialog
            open={txOpen}
            onOpenChange={setTxOpen}
            budget={budget}
            onSaved={invalidate}
          />
          <BudgetSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            budget={budget}
            onSaved={invalidate}
          />
        </>
      ) : null}
      <GoalDialog open={goalOpen} onOpenChange={setGoalOpen} onSaved={invalidate} />
      <DepositDialog goal={depositGoal} onClose={() => setDepositGoal(null)} onSaved={invalidate} />
    </div>
  )
}

function TransactionDialog({
  open,
  onOpenChange,
  budget,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: Budget
  onSaved: () => void
}) {
  const { user } = useAuth()
  const form = useForm({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'expense' as const,
      amount: '' as string | number,
      category: 'food',
      note: '',
      occurredOn: todayKey(),
    },
  })

  async function onSubmit(values: z.output<typeof transactionSchema>) {
    await budgetService.addTransaction(user!.id, budget, {
      type: values.type,
      amount: values.amount,
      category: values.type === 'income' ? 'other' : values.category,
      note: values.note || null,
      occurred_on: values.occurredOn,
    })
    onSaved()
    toast.success(values.type === 'income' ? 'Income recorded' : 'Expense recorded')
    form.reset({ type: values.type, amount: '', category: values.category, note: '', occurredOn: todayKey() })
    onOpenChange(false)
  }

  const type = form.watch('type')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>Track it while you remember it.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormControl>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Transaction type">
                      {(['expense', 'income'] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="radio"
                          aria-checked={field.value === option}
                          onClick={() => field.onChange(option)}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors',
                            field.value === option ? 'border-primary bg-primary/5 text-primary' : 'hover:bg-accent',
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="occurredOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {type === 'expense' ? (
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {CATEGORY_LABELS[category]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem className={type === 'expense' ? '' : 'sm:col-span-1'}>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Input placeholder="Groceries" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function BudgetSettingsDialog({
  open,
  onOpenChange,
  budget,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: Budget
  onSaved: () => void
}) {
  const form = useForm({
    resolver: zodResolver(settingsSchema),
    values: {
      currency: budget.currency,
      plannedIncome: Number(budget.planned_income),
      spendingLimit: Number(budget.spending_limit),
    },
  })

  async function onSubmit(values: z.output<typeof settingsSchema>) {
    await budgetService.updateBudget(budget.id, {
      currency: values.currency.toUpperCase(),
      planned_income: values.plannedIncome,
      spending_limit: values.spendingLimit,
    })
    onSaved()
    toast.success('Budget updated')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monthly budget</DialogTitle>
          <DialogDescription>Set the guardrails for this month.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="spendingLimit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Spending limit</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="plannedIncome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected income</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <Input maxLength={3} placeholder="ZAR" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Save budget
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function GoalDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { user } = useAuth()
  const form = useForm({
    resolver: zodResolver(goalSchema),
    defaultValues: { name: '', targetAmount: '' as string | number, deadline: '' },
  })

  async function onSubmit(values: z.output<typeof goalSchema>) {
    await budgetService.createGoal(user!.id, {
      name: values.name,
      target_amount: values.targetAmount,
      deadline: values.deadline || null,
    })
    onSaved()
    toast.success('Goal created')
    form.reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New savings goal</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Goal</FormLabel>
                  <FormControl>
                    <Input placeholder="New laptop fund" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="targetAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target amount</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} step="0.01" inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deadline (optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Create goal
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function DepositDialog({
  goal,
  onClose,
  onSaved,
}: {
  goal: Goal | null
  onClose: () => void
  onSaved: () => void
}) {
  const form = useForm({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: '' as string | number },
  })

  async function onSubmit(values: z.output<typeof depositSchema>) {
    if (!goal || values.amount === null) return
    const updated = await budgetService.addToGoal(goal, values.amount)
    onSaved()
    if (updated.achieved_at && !goal.achieved_at) {
      toast.success(`🎉 Goal achieved: ${goal.name}!`)
    } else {
      toast.success('Savings added')
    }
    form.reset()
    onClose()
  }

  return (
    <Dialog open={goal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add savings{goal ? ` — ${goal.name}` : ''}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Add
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
