import { formatDistanceToNow, parseISO } from 'date-fns'
import { ArrowRight, BrainCircuit, Play, Plus, Swords } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/ui/page-skeleton'
import { ProgressRing } from '@/components/ui/progress-ring'
import { SectionCard } from '@/components/ui/section-card'
import { cn } from '@/lib/utils'
import { QUIZ_XP } from '@/services/gamification-service'
import { gradeLetter, nextDueQuiz, scoreOf } from '@/services/quiz-service'
import type { Quiz, QuizAttempt } from '@/types/models'

/** Rows shown. Enough to see a direction; the library has the rest. */
const RECENT = 3

export interface QuizScoresCardProps {
  quizzes: Quiz[]
  attempts: QuizAttempt[]
  loading: boolean
  className?: string
}

/**
 * Recent quiz results, and the quiz to take next.
 *
 * Every row says what the attempt *earned*, not only what it scored: "+39 XP"
 * on a first pass, "revision" on a re-take. That is the rule that makes quiz
 * XP trustworthy, so the dashboard teaches it at a glance instead of leaving a
 * student to discover it as a confusing zero.
 */
export function QuizScoresCard({ quizzes, attempts, loading, className }: QuizScoresCardProps) {
  const titleById = new Map(quizzes.map((quiz) => [quiz.id, quiz]))
  const recent = [...attempts]
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    // An attempt whose quiz was deleted has nothing to link to or name.
    .filter((attempt) => titleById.has(attempt.quiz_id))
    .slice(0, RECENT)
  const next = nextDueQuiz(quizzes, attempts)

  return (
    <SectionCard
      className={className}
      icon={BrainCircuit}
      title="Quizzes"
      description={
        loading
          ? undefined
          : quizzes.length === 0
            ? `Every correct answer is worth ${QUIZ_XP.correct} XP`
            : `${attempts.length} ${attempts.length === 1 ? 'attempt' : 'attempts'} across ${quizzes.length} ${quizzes.length === 1 ? 'quiz' : 'quizzes'}`
      }
      action={
        quizzes.length > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link to="/app/quiz">
              All quizzes <ArrowRight />
            </Link>
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <ListSkeleton rows={RECENT} />
      ) : quizzes.length === 0 ? (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <p className="text-muted-foreground flex-1 text-sm">
            Turn a note into a quiz. Answers are marked on the server, so this is the one score in
            StudentOS that cannot be faked.
          </p>
          <Button asChild>
            <Link to="/app/quiz">
              <Plus /> Make a quiz
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {recent.length > 0 ? (
            <ul className="space-y-1">
              {recent.map((attempt) => {
                const quiz = titleById.get(attempt.quiz_id)!
                const percent = scoreOf(attempt)
                return (
                  <li key={attempt.id}>
                    <Link
                      to={`/app/quiz/${quiz.id}`}
                      className="hover:bg-accent focus-visible:ring-ring/60 flex items-center gap-3 rounded-lg p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <ProgressRing
                        aria-hidden
                        value={percent / 100}
                        size={40}
                        thickness={4}
                        className="size-10 shrink-0"
                        arcClassName={cn(
                          percent >= 70 ? 'stroke-success' : percent >= 50 ? 'stroke-warning' : 'stroke-destructive',
                        )}
                      >
                        <span className="text-[11px] font-semibold tabular-nums">{percent}</span>
                      </ProgressRing>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {quiz.kind === 'boss' ? (
                            <Swords aria-hidden className="text-quest size-3.5 shrink-0" />
                          ) : null}
                          <span className="truncate text-sm font-medium">{quiz.title}</span>
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {attempt.score}/{attempt.total} &middot; grade {gradeLetter(percent)} &middot;{' '}
                          {formatDistanceToNow(parseISO(attempt.submitted_at), { addSuffix: true })}
                        </span>
                      </span>
                      {attempt.xp_awarded > 0 ? (
                        <span className="text-xp shrink-0 text-sm font-semibold tabular-nums">
                          +{attempt.xp_awarded} XP
                        </span>
                      ) : (
                        // Re-takes pay nothing; say why rather than print "+0".
                        <span className="text-muted-foreground shrink-0 text-xs">revision</span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              {quizzes.length} {quizzes.length === 1 ? 'quiz is' : 'quizzes are'} waiting. Your first
              pass at each one pays XP.
            </p>
          )}

          {next ? (
            // max-w-full: sized to its text from sm, a long quiz title pushed
            // the button out of a two-column tile; capped, the title truncates.
            <Button asChild variant="outline" className="w-full max-w-full justify-between sm:w-auto">
              <Link to={`/app/quiz/${next.id}`}>
                <span className="flex min-w-0 items-center gap-2">
                  {next.kind === 'boss' ? <Swords className="text-quest" /> : <Play />}
                  <span className="truncate">Revise next: {next.title}</span>
                </span>
                <ArrowRight />
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </SectionCard>
  )
}
