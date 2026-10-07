import { ArrowLeft, ArrowRight, Loader2, Send, Swords } from 'lucide-react'
import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/ui/page-skeleton'
import { Progress } from '@/components/ui/progress'
import { Surface } from '@/components/ui/surface'
import { QuestionCard } from '@/features/quiz/question-card'
import { QuizResult } from '@/features/quiz/quiz-result'
import { useQuiz, useQuizQuestions, useSubmitQuiz } from '@/features/quiz/hooks'
import { cn } from '@/lib/utils'
import type { QuizResult as Result } from '@/types/models'

export function QuizRunnerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: quiz, isLoading: quizLoading } = useQuiz(id)
  const { data: questions = [], isLoading: questionsLoading } = useQuizQuestions(id)
  const submit = useSubmitQuiz()

  const [current, setCurrent] = React.useState(0)
  const [chosen, setChosen] = React.useState<Map<string, number | null>>(new Map())
  const [result, setResult] = React.useState<Result | null>(null)
  // Set once when the questions land, so time spent waiting on the network
  // is not counted as time spent thinking.
  const startedAt = React.useRef<number | null>(null)
  if (startedAt.current === null && questions.length > 0) startedAt.current = Date.now()

  const answered = chosen.size
  const total = questions.length
  const question = questions[current]

  function choose(optionIndex: number) {
    if (!question) return
    setChosen((previous) => new Map(previous).set(question.id, optionIndex))
  }

  function onSubmit() {
    if (!quiz) return
    submit.mutate(
      {
        quiz,
        chosen,
        durationSeconds: startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0,
      },
      {
        onSuccess: (graded) => {
          setResult(graded)
          window.scrollTo({ top: 0 })
          if (graded.xpAwarded > 0) toast.success(`+${graded.xpAwarded} XP`)
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  function retry() {
    setResult(null)
    setChosen(new Map())
    setCurrent(0)
    startedAt.current = Date.now()
    window.scrollTo({ top: 0 })
  }

  if (quizLoading || questionsLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Quiz" description="Loading your questions" />
        <PageSkeleton cards={2} />
      </div>
    )
  }

  if (!quiz) {
    return (
      <div className="space-y-6">
        <PageHeader title="Quiz not found" description="This quiz may have been deleted" />
        <Button asChild>
          <Link to="/app/quiz">
            <ArrowLeft /> Back to quizzes
          </Link>
        </Button>
      </div>
    )
  }

  if (result) {
    return (
      <div className="space-y-6">
        <PageHeader title={quiz.title} description="Your result" />
        <QuizResult quiz={quiz} questions={questions} result={result} onRetry={retry} />
      </div>
    )
  }

  if (total === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={quiz.title} description="This quiz has no questions" />
        <Button asChild variant="outline">
          <Link to="/app/quiz">
            <ArrowLeft /> Back to quizzes
          </Link>
        </Button>
      </div>
    )
  }

  const isLast = current === total - 1

  return (
    <div className="space-y-6">
      <PageHeader
        title={quiz.title}
        description={
          quiz.kind === 'boss'
            ? 'Boss quiz — 80% to defeat it'
            : 'Take your time; there is no clock'
        }
        actions={
          quiz.kind === 'boss' ? (
            <span className="border-quest/25 bg-quest/10 text-quest inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium">
              <Swords aria-hidden className="size-3.5" /> Boss
            </span>
          ) : undefined
        }
      />

      <div className="space-y-2">
        <Progress
          value={(answered / total) * 100}
          aria-label={`${answered} of ${total} questions answered`}
          className="h-1.5"
        />
        <p className="text-muted-foreground text-xs tabular-nums">
          {answered} of {total} answered
        </p>
      </div>

      {/* A bare surface, not a SectionCard: the card's title would repeat the
          question number that QuestionCard already prints. */}
      <Surface tier={2} className="p-5 sm:p-6">
        <QuestionCard
          question={question!}
          index={current}
          total={total}
          chosen={chosen.get(question!.id) ?? null}
          onChoose={choose}
        />
      </Surface>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => setCurrent((index) => Math.max(0, index - 1))}
          disabled={current === 0}
        >
          <ArrowLeft /> Previous
        </Button>
        {isLast ? (
          <Button onClick={onSubmit} disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            Submit {answered < total ? `(${total - answered} unanswered)` : ''}
          </Button>
        ) : (
          <Button onClick={() => setCurrent((index) => Math.min(total - 1, index + 1))}>
            Next <ArrowRight />
          </Button>
        )}
        <Button variant="ghost" onClick={() => navigate('/app/quiz')}>
          Save and exit
        </Button>
      </div>

      {/* Jump straight to any question — faster than paging back through ten. */}
      <Surface tier={1} className="p-3">
        <p className="text-muted-foreground mb-2 text-xs">Jump to a question</p>
        <div className="flex flex-wrap gap-1.5">
          {questions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCurrent(index)}
              aria-label={`Question ${index + 1}${chosen.has(item.id) ? ', answered' : ', not answered'}`}
              aria-current={index === current ? 'true' : undefined}
              className={cn(
                'size-8 rounded-md border text-xs font-medium tabular-nums transition-colors',
                index === current && 'border-primary bg-primary text-primary-foreground',
                index !== current && chosen.has(item.id) && 'border-success/40 bg-success/10',
                index !== current && !chosen.has(item.id) && 'hover:bg-accent',
              )}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </Surface>
    </div>
  )
}
