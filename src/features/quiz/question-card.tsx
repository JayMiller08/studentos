import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GradedAnswer, QuizQuestion } from '@/types/models'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

export interface QuestionCardProps {
  question: QuizQuestion
  index: number
  total: number
  chosen: number | null
  onChoose: (index: number) => void
  /** Present only after grading — switches the card into review mode. */
  graded?: GradedAnswer
}

/**
 * One question, answerable then reviewable.
 *
 * Native radios in a `fieldset` rather than buttons: arrow keys move between
 * options and the whole set is one tab stop, which is what a screen reader
 * expects of a single-choice question, and the `legend` is what names the
 * group. No `role="radiogroup"` on top of that — the fieldset already is one,
 * and naming it twice makes assistive tech say the position twice.
 */
export function QuestionCard({
  question,
  index,
  total,
  chosen,
  onChoose,
  graded,
}: QuestionCardProps) {
  const reviewing = Boolean(graded)

  return (
    <fieldset disabled={reviewing} className="min-w-0">
      <legend className="sr-only">
        Question {index + 1} of {total}
      </legend>
      {/* aria-hidden: the legend above already announces this to a reader. */}
      <p aria-hidden className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Question {index + 1} of {total}
      </p>
      <p className="font-display mt-2 text-xl leading-snug font-semibold text-balance">
        {question.prompt}
      </p>

      <div className="mt-5 space-y-2.5">
        {question.options.map((option, optionIndex) => {
          const selected = chosen === optionIndex
          const isCorrect = graded?.correctIndex === optionIndex
          const isWrongPick = reviewing && selected && !graded?.correct

          return (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
                !reviewing && 'hover:bg-accent has-checked:border-primary has-checked:bg-primary/8',
                // In review the right answer is always marked, whether or not
                // it was picked — otherwise a student learns only that they
                // were wrong, not what was right.
                reviewing && isCorrect && 'border-success/50 bg-success/10',
                isWrongPick && 'border-destructive/50 bg-destructive/10',
                reviewing && !isCorrect && !isWrongPick && 'opacity-60',
              )}
            >
              <input
                type="radio"
                name={question.id}
                value={optionIndex}
                checked={selected}
                onChange={() => onChoose(optionIndex)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  selected && !reviewing && 'border-primary bg-primary text-primary-foreground',
                  reviewing && isCorrect && 'border-success bg-success text-white',
                  isWrongPick && 'border-destructive bg-destructive text-white',
                )}
              >
                {reviewing && isCorrect ? (
                  <Check className="size-3.5" strokeWidth={3} />
                ) : isWrongPick ? (
                  <X className="size-3.5" strokeWidth={3} />
                ) : (
                  LETTERS[optionIndex]
                )}
              </span>
              <span className="min-w-0 flex-1 text-sm">{option}</span>
            </label>
          )
        })}
      </div>

      {graded?.explanation ? (
        <p className="bg-muted text-muted-foreground mt-4 rounded-lg p-3 text-sm">
          {graded.explanation}
        </p>
      ) : null}
    </fieldset>
  )
}
