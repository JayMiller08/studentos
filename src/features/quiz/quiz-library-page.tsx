import { format, parseISO } from 'date-fns'
import { BrainCircuit, MoreHorizontal, Play, Sparkles, Swords, Trash2 } from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import { StatTile } from '@/components/ui/stat-tile'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDeleteQuiz, useQuizAttempts, useQuizzes } from '@/features/quiz/hooks'
import { MakeQuizCard } from '@/features/quiz/make-quiz-card'
import { gradeLetter, nextDueQuiz, scoreOf } from '@/services/quiz-service'
import type { Quiz } from '@/types/models'

/** Where a quiz came from, in the student's terms. */
function sourceLabel(quiz: Quiz): string {
  if (quiz.resource_id) return 'From a file'
  if (quiz.note_id || quiz.source === 'note') return 'From a note'
  if (quiz.source === 'manual') return 'Written by you'
  return 'AI'
}

export function QuizLibraryPage() {
  const { data: quizzes = [], isLoading } = useQuizzes()
  const { data: attempts = [] } = useQuizAttempts()
  const remove = useDeleteQuiz()

  const bestByQuiz = React.useMemo(() => {
    const best = new Map<string, number>()
    for (const attempt of attempts) {
      const percent = scoreOf(attempt)
      if (percent > (best.get(attempt.quiz_id) ?? -1)) best.set(attempt.quiz_id, percent)
    }
    return best
  }, [attempts])

  const attemptCount = attempts.length
  const averageScore =
    attemptCount === 0
      ? 0
      : Math.round(attempts.reduce((sum, attempt) => sum + scoreOf(attempt), 0) / attemptCount)
  const xpFromQuizzes = attempts.reduce((sum, attempt) => sum + attempt.xp_awarded, 0)
  const dueNext = nextDueQuiz(quizzes, attempts)

  const header = (
    <PageHeader
      title="Quizzes"
      description="The only XP you can't get by clocking in"
      actions={
        dueNext ? (
          <Button asChild>
            <Link to={`/app/quiz/${dueNext.id}`}>
              <Play /> Revise {dueNext.title.slice(0, 24)}
            </Link>
          </Button>
        ) : undefined
      }
    />
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <PageSkeleton cards={3} stats={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {header}

      <div data-tour="quiz-stats" className="grid grid-cols-3 gap-3">
        <StatTile label="Quizzes" value={quizzes.length} icon={BrainCircuit} tone="primary" />
        <StatTile
          label="Average score"
          value={attemptCount === 0 ? '—' : `${averageScore}%`}
          hint={attemptCount === 0 ? 'No attempts yet' : `${attemptCount} attempts`}
          tone="success"
        />
        <StatTile label="XP from quizzes" value={xpFromQuizzes} icon={Sparkles} tone="xp" />
      </div>

      <MakeQuizCard />

      <SectionCard
        data-tour="quiz-library"
        icon={BrainCircuit}
        title="Your quizzes"
        description={quizzes.length === 0 ? undefined : `${quizzes.length} saved`}
        flush={quizzes.length > 0}
      >
        {quizzes.length === 0 ? (
          <EmptyState
            icon={BrainCircuit}
            title="No quizzes yet"
            art="reading"
            description="Upload a lecture or pick a note above. Answering its questions correctly is worth far more XP than a timer ever was."
            className="border-0"
          />
        ) : (
          <Table className="min-w-140">
            <TableHeader>
              <TableRow>
                <TableHead>Quiz</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Questions</TableHead>
                <TableHead className="text-right">Best</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {quizzes.map((quiz) => {
                const best = bestByQuiz.get(quiz.id)
                return (
                  <TableRow key={quiz.id}>
                    <TableCell>
                      <Link
                        to={`/app/quiz/${quiz.id}`}
                        className="hover:text-primary flex items-center gap-2 font-medium"
                      >
                        {quiz.kind === 'boss' ? (
                          <Swords aria-hidden className="text-quest size-4 shrink-0" />
                        ) : null}
                        <span className="truncate">{quiz.title}</span>
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {format(parseISO(quiz.created_at), 'd MMM yyyy')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{sourceLabel(quiz)}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{quiz.question_count}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {best === undefined ? (
                        <span className="text-muted-foreground">Not tried</span>
                      ) : (
                        <span className="font-medium">
                          {best}% · {gradeLetter(best)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Options for ${quiz.title}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => remove.mutate(quiz.id)}
                          >
                            <Trash2 /> Delete quiz
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  )
}
