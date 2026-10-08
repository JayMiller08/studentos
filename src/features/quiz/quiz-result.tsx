import { ArrowLeft, RotateCcw, Sparkles, Swords } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { HeroCard } from '@/components/ui/hero-card'
import { ProgressRing } from '@/components/ui/progress-ring'
import { RewardBurst } from '@/components/ui/reward-burst'
import { SectionCard } from '@/components/ui/section-card'
import { StatTile } from '@/components/ui/stat-tile'
import { QuestionCard } from '@/features/quiz/question-card'
import { gradeLetter, scoreOf } from '@/services/quiz-service'
import type { Quiz, QuizQuestion, QuizResult as Result } from '@/types/models'

export interface QuizResultProps {
  quiz: Quiz
  questions: QuizQuestion[]
  result: Result
  onRetry: () => void
}

/** Something to say that is about the work, not about the number. */
function verdict(percent: number, defeatedBoss: boolean): string {
  if (defeatedBoss) return 'Boss defeated.'
  if (percent === 100) return 'Every one. Clean sweep.'
  if (percent >= 80) return 'Solid — this material is landing.'
  if (percent >= 60) return 'Getting there. Review the misses below.'
  if (percent >= 40) return 'Worth another pass at the notes first.'
  return 'This one needs real revision, not another attempt.'
}

export function QuizResult({ quiz, questions, result, onRetry }: QuizResultProps) {
  const percent = scoreOf(result)
  const byQuestion = new Map(result.answers.map((answer) => [answer.questionId, answer]))

  return (
    <div className="space-y-4">
      <HeroCard tone={result.defeatedBoss ? 'quest' : 'xp'}>
        <CardContent className="flex flex-col items-center gap-5 py-8 text-center sm:flex-row sm:text-left">
          <RewardBurst active={result.xpAwarded > 0}>
            <ProgressRing
              value={percent / 100}
              className="size-28"
              aria-label={`Scored ${percent} percent`}
            >
              <span className="font-display text-3xl font-semibold tabular-nums">{percent}%</span>
            </ProgressRing>
          </RewardBurst>

          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs font-medium tracking-wide uppercase sm:justify-start">
              {result.defeatedBoss ? (
                <Swords aria-hidden className="text-quest size-3.5" />
              ) : (
                <Sparkles aria-hidden className="text-xp size-3.5" />
              )}
              {quiz.title}
            </p>
            <h2 className="font-display mt-1 text-2xl leading-tight font-semibold">
              {result.score} of {result.total} correct
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {verdict(percent, result.defeatedBoss)}
            </p>
          </div>

          <div className="grid w-full shrink-0 grid-cols-3 gap-2 sm:w-auto sm:grid-cols-1">
            <StatTile label="Grade" value={gradeLetter(percent)} tone="primary" />
            <StatTile
              label="XP earned"
              value={<AnimatedNumber value={result.xpAwarded} format={(n) => `+${n}`} />}
              tone="xp"
            />
            <StatTile label="Level" value={result.level ?? '—'} tone="league" />
          </div>
        </CardContent>
      </HeroCard>

      {/*
        Said plainly rather than hidden: a student who re-takes a quiz and sees
        +0 XP with no explanation assumes it is broken.
      */}
      {result.xpAwarded === 0 ? (
        <p className="text-muted-foreground px-1 text-sm">
          You already earned XP for this quiz — re-takes are for revision, so they don't pay again.
          Your score is still recorded.
        </p>
      ) : null}

      <SectionCard title="Review every question" description="The answer, and why">
        <div className="space-y-8">
          {questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index}
              total={questions.length}
              chosen={byQuestion.get(question.id)?.chosenIndex ?? null}
              onChoose={() => {}}
              graded={byQuestion.get(question.id)}
            />
          ))}
        </div>
      </SectionCard>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onRetry} variant="outline">
          <RotateCcw /> Try again
        </Button>
        <Button asChild>
          <Link to="/app/quiz">
            <ArrowLeft /> Back to quizzes
          </Link>
        </Button>
      </div>
    </div>
  )
}
