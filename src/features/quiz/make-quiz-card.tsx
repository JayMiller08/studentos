import {
  BrainCircuit,
  FileText,
  Images,
  Library,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Sparkles,
  StickyNote,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import * as React from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useModules } from '@/features/assignments/hooks'
import { useNotes } from '@/features/notes/hooks'
import {
  isActiveGeneration,
  useAiQuizAllowance,
  useGenerateQuiz,
  useGenerationNotices,
  useQuizGenerations,
  useReadResource,
  useRemoveResource,
  useStudyResources,
  useUploadResource,
} from '@/features/quiz/hooks'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ListSkeleton } from '@/components/ui/page-skeleton'
import { SectionCard } from '@/components/ui/section-card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePlan } from '@/hooks/use-plan'
import { PLANS } from '@/lib/plans'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { notePreview } from '@/services/notes-service'
import { DEFAULT_QUIZ_LENGTH, QUIZ_LENGTHS, type QuizMaterial } from '@/services/quiz-service'
import {
  classifyFiles,
  RESOURCE_ACCEPT,
  RESOURCE_MAX_PHOTOS,
  titleFromFile,
} from '@/services/resource-service'
import type { OutlineTopic, QuizDifficulty, QuizGeneration, QuizKind, StudyResource } from '@/types/models'

/** What the student asked for. */
interface Choices {
  count: number
  difficulty: QuizDifficulty
  kind: QuizKind
  topics: string[]
}

const DEFAULT_CHOICES: Choices = { count: DEFAULT_QUIZ_LENGTH, difficulty: 'mixed', kind: 'practice', topics: [] }

const DIFFICULTIES: Array<{ value: QuizDifficulty; label: string; hint: string }> = [
  { value: 'easy', label: 'Easy', hint: 'Key facts, terms and definitions.' },
  { value: 'mixed', label: 'Mixed', hint: 'Mostly understanding, with some recall.' },
  { value: 'exam', label: 'Exam', hint: 'Exam standard: applying and reasoning, with the mistakes students make.' },
]

const STEP: Record<Exclude<QuizGeneration['status'], 'done' | 'failed'>, string> = {
  queued: 'Starting…',
  reading: 'Reading the material…',
  writing: 'Writing the questions…',
  checking: 'Checking every answer against the material…',
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

// ── Shared pieces ───────────────────────────────────────────────────────────

/** "2 of 3 left this month", and what Pro would give a Free student at zero. */
function Allowance() {
  const { remaining, limit, isLoading } = useAiQuizAllowance()
  const { plan } = usePlan()
  if (isLoading) return null
  return (
    <p className={cn('text-xs tabular-nums', remaining === 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
      {remaining} of {limit} AI quizzes left this month
      {remaining === 0 && plan === 'free' ? (
        <>
          {' · '}
          <Link to="/app/billing" className="text-primary underline-offset-4 hover:underline">
            Get {PLANS.pro.limits.aiQuizzesPerMonth} with Pro
          </Link>
        </>
      ) : null}
    </p>
  )
}

/** Length, difficulty, type and — for a file — the topics to aim at. */
function ChoicesForm({
  idPrefix,
  choices,
  onChange,
  outline,
  outlinePending,
}: {
  idPrefix: string
  choices: Choices
  onChange: (next: Choices) => void
  outline?: OutlineTopic[]
  outlinePending?: boolean
}) {
  const toggleTopic = (name: string) =>
    onChange({
      ...choices,
      topics: choices.topics.includes(name) ? choices.topics.filter((topic) => topic !== name) : [...choices.topics, name],
    })

  return (
    <div className="space-y-4">
      {outline !== undefined ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Topics</legend>
          {outlinePending ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 aria-hidden className="size-3.5 animate-spin" /> Reading the file for its topics. You can
              quiz the whole file now, or wait to pick.
            </p>
          ) : outline.length === 0 ? (
            <p className="text-muted-foreground text-sm">The whole file.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {outline.map((topic) => {
                  const on = choices.topics.includes(topic.name)
                  return (
                    <button
                      key={topic.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleTopic(topic.name)}
                      className={cn(
                        'focus-visible:ring-ring/60 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none',
                        on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {topic.name}
                      {topic.pages ? <span className="text-muted-foreground"> · p. {topic.pages}</span> : null}
                    </button>
                  )
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                {choices.topics.length === 0 ? 'None picked: the whole file.' : `${choices.topics.length} picked.`}
              </p>
            </>
          )}
        </fieldset>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[8rem_1fr_9rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-count`}>Questions</Label>
          <Select value={String(choices.count)} onValueChange={(value) => onChange({ ...choices, count: Number(value) })}>
            <SelectTrigger id={`${idPrefix}-count`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUIZ_LENGTHS.map((length) => (
                <SelectItem key={length} value={String(length)}>
                  {length}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="space-y-1.5" aria-describedby={`${idPrefix}-difficulty-hint`}>
          <legend className="text-sm leading-none font-medium">Difficulty</legend>
          <div className="bg-muted shadow-track grid h-10 grid-cols-3 gap-1 rounded-xl border p-1">
            {DIFFICULTIES.map((difficulty) => (
              <button
                key={difficulty.value}
                type="button"
                aria-pressed={choices.difficulty === difficulty.value}
                onClick={() => onChange({ ...choices, difficulty: difficulty.value })}
                className={cn(
                  'focus-visible:ring-ring/60 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  choices.difficulty === difficulty.value
                    ? 'bg-card text-foreground shadow-e1 border-border border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {difficulty.label}
              </button>
            ))}
          </div>
          {/* Visible rather than a tooltip: tooltips never appear on a phone. */}
          <p id={`${idPrefix}-difficulty-hint`} className="text-muted-foreground text-xs">
            {DIFFICULTIES.find((difficulty) => difficulty.value === choices.difficulty)?.hint}
          </p>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-kind`}>Type</Label>
          <Select value={choices.kind} onValueChange={(value) => onChange({ ...choices, kind: value as QuizKind })}>
            <SelectTrigger id={`${idPrefix}-kind`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="practice">Practice</SelectItem>
              <SelectItem value="boss">Boss</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

/** Start a quiz from some material with the student's choices. */
function useStart() {
  const generate = useGenerateQuiz()
  const { remaining } = useAiQuizAllowance()
  const start = (source: QuizMaterial, choices: Choices) =>
    generate.mutate(
      { source, count: choices.count, difficulty: choices.difficulty, kind: choices.kind, topics: choices.topics },
      {
        // Demo mode builds the quiz on the spot, and its "ready" notice says so.
        onSuccess: () => {
          if (supabase) toast('Writing your quiz. It takes about a minute — you can keep working.')
        },
      },
    )
  return { start, pending: generate.isPending, blocked: remaining === 0 }
}

// ── Upload ──────────────────────────────────────────────────────────────────

function UploadPanel({ onUploaded }: { onUploaded: (resource: StudyResource) => void }) {
  const upload = useUploadResource()
  const { data: modules = [] } = useModules()
  const [files, setFiles] = React.useState<File[]>([])
  const [title, setTitle] = React.useState('')
  const [moduleId, setModuleId] = React.useState('none')
  const [problem, setProblem] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const inputId = React.useId()

  function choose(list: FileList | File[] | null) {
    const picked = Array.from(list ?? [])
    if (picked.length === 0) return
    try {
      classifyFiles(picked)
      setProblem(null)
      setFiles(picked)
      setTitle(titleFromFile(picked[0]!.name))
    } catch (error) {
      setFiles([])
      setProblem(error instanceof Error ? error.message : String(error))
    }
  }

  function submit() {
    upload.mutate(
      { files, title, moduleId: moduleId === 'none' ? null : moduleId },
      {
        onSuccess: (resource) => {
          setFiles([])
          setTitle('')
          onUploaded(resource)
        },
      },
    )
  }

  const isPdf = files.length === 1 && files[0]!.type === 'application/pdf'

  return (
    <div className="space-y-4">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          choose(event.dataTransfer.files)
        }}
        className={cn(
          'focus-within:ring-ring/60 flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors focus-within:ring-2',
          dragging ? 'border-primary bg-primary/5' : 'hover:bg-accent/40',
        )}
      >
        <Upload aria-hidden className="text-primary size-6" />
        <span className="text-sm font-medium">Drop a lecture PDF or photos of your notes</span>
        <span className="text-muted-foreground text-xs">
          or <span className="text-primary underline underline-offset-4">choose files</span> · a PDF up to 20 MB, or up to{' '}
          {RESOURCE_MAX_PHOTOS} photos
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={RESOURCE_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            choose(event.target.files)
            event.target.value = ''
          }}
        />
      </label>

      {problem ? (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="space-y-3">
          <div className="bg-muted/50 flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
            {isPdf ? <FileText aria-hidden className="size-4 shrink-0" /> : <Images aria-hidden className="size-4 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">
              {isPdf ? files[0]!.name : `${files.length} photo${files.length === 1 ? '' : 's'}`}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {formatSize(files.reduce((sum, file) => sum + file.size, 0))}
            </span>
            <Button variant="ghost" size="icon-sm" aria-label="Remove the chosen files" onClick={() => setFiles([])}>
              <X />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <div className="space-y-1.5">
              <Label htmlFor={`${inputId}-title`}>Name</Label>
              <Input id={`${inputId}-title`} value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${inputId}-module`}>Module</Label>
              <Select value={moduleId} onValueChange={setModuleId}>
                <SelectTrigger id={`${inputId}-module`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No module</SelectItem>
                  {modules.map((module) => (
                    <SelectItem key={module.id} value={module.id}>
                      {module.code ? `${module.code} — ${module.name}` : module.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={submit} disabled={upload.isPending || !title.trim()}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Library />}
            Add to my files
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          Word or PowerPoint? Save it as a PDF first. Your files stay private to you.
        </p>
      )}
    </div>
  )
}

// ── Library ─────────────────────────────────────────────────────────────────

function statusLine(resource: StudyResource): string {
  if (resource.status === 'failed') return resource.error ?? "Couldn't be read"
  if (resource.status !== 'ready') return 'Reading…'
  const length =
    resource.kind === 'photos'
      ? `${resource.storage_paths.length} photo${resource.storage_paths.length === 1 ? '' : 's'}`
      : resource.page_count
        ? `${resource.page_count} page${resource.page_count === 1 ? '' : 's'}`
        : 'PDF'
  return resource.outline.length > 0 ? `${length} · ${resource.outline.length} topics` : length
}

function LibraryPanel({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { data: resources = [], isLoading } = useStudyResources()
  const remove = useRemoveResource()
  const read = useReadResource()
  const { start, pending, blocked } = useStart()
  const [choices, setChoices] = React.useState<Choices>(DEFAULT_CHOICES)

  const selected = resources.find((resource) => resource.id === selectedId) ?? resources[0] ?? null

  // Topics belong to a file: switching files starts the picking afresh.
  React.useEffect(() => {
    setChoices((current) => ({ ...current, topics: [] }))
  }, [selected?.id])

  if (isLoading) return <ListSkeleton rows={2} />
  if (resources.length === 0) {
    return <p className="text-muted-foreground py-4 text-sm">Nothing here yet. Upload a lecture PDF or photos of your notes to start your library.</p>
  }

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label="Your files" className="space-y-2">
        {resources.map((resource) => {
          const isSelected = resource.id === selected?.id
          const busy = resource.status === 'uploaded' || resource.status === 'reading'
          return (
            <div
              key={resource.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-2 transition-colors',
                isSelected ? 'border-primary/50 bg-primary/5' : 'hover:bg-accent/40',
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${resource.title}: ${statusLine(resource)}`}
                onClick={() => onSelect(resource.id)}
                className="focus-visible:ring-ring/60 flex min-w-0 flex-1 items-center gap-3 rounded-md p-1 text-left focus-visible:ring-2 focus-visible:outline-none"
              >
                {resource.kind === 'pdf' ? (
                  <FileText aria-hidden className="text-primary size-4 shrink-0" />
                ) : (
                  <Images aria-hidden className="text-primary size-4 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{resource.title}</span>
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      resource.status === 'failed' ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {busy ? <Loader2 aria-hidden className="size-3 animate-spin" /> : null}
                    {statusLine(resource)}
                  </span>
                </span>
              </button>
              {resource.status === 'failed' ? (
                <Button variant="ghost" size="sm" onClick={() => read.mutate(resource)} disabled={read.isPending}>
                  <RotateCcw /> Try again
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Options for ${resource.title}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem variant="destructive" onSelect={() => remove.mutate(resource)}>
                    <Trash2 /> Delete file
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>

      {selected && selected.status !== 'failed' ? (
        <div className="space-y-4">
          <ChoicesForm
            idPrefix="library"
            choices={choices}
            onChange={setChoices}
            outline={selected.outline}
            outlinePending={selected.status !== 'ready'}
          />
          <Button onClick={() => start({ type: 'resource', id: selected.id }, choices)} disabled={pending || blocked}>
            {pending ? <Loader2 className="animate-spin" /> : <BrainCircuit />}
            Write my quiz
          </Button>
        </div>
      ) : null}
    </div>
  )
}

// ── Note ────────────────────────────────────────────────────────────────────

function NotePanel() {
  const { data: notes = [] } = useNotes()
  const { start, pending, blocked } = useStart()
  const [noteId, setNoteId] = React.useState('')
  const [choices, setChoices] = React.useState<Choices>(DEFAULT_CHOICES)
  const note = notes.find((candidate) => candidate.id === noteId)

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-muted-foreground text-sm">No notes yet. Write one, then turn it into questions here.</p>
        <Button asChild variant="outline">
          <Link to="/app/notes">
            <StickyNote /> Go to notes
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="quiz-note">Note</Label>
        <Select value={noteId} onValueChange={setNoteId}>
          <SelectTrigger id="quiz-note" className="w-full">
            <SelectValue placeholder="Choose a note…" />
          </SelectTrigger>
          <SelectContent>
            {notes.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.title || 'Untitled'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {note ? <p className="text-muted-foreground line-clamp-2 text-xs">{notePreview(note) || 'This note is empty.'}</p> : null}
      </div>
      <ChoicesForm idPrefix="note" choices={choices} onChange={setChoices} />
      <Button onClick={() => note && start({ type: 'note', id: note.id }, choices)} disabled={!note || pending || blocked}>
        {pending ? <Loader2 className="animate-spin" /> : <BrainCircuit />}
        Write my quiz
      </Button>
    </div>
  )
}

// ── In progress ─────────────────────────────────────────────────────────────

function InProgress({ jobs }: { jobs: QuizGeneration[] }) {
  const active = jobs.filter(isActiveGeneration)
  return (
    <div aria-live="polite" className="empty:hidden">
      {active.length > 0 ? (
        <ul className="border-border mt-5 space-y-2 border-t pt-4">
          {active.map((job) => (
            <li key={job.id} className="flex items-center gap-3 text-sm">
              <Loader2 aria-hidden className="text-primary size-4 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{job.title}</span>
                <span className="text-muted-foreground text-xs">{STEP[job.status as keyof typeof STEP]}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

// ── The card ────────────────────────────────────────────────────────────────

export function MakeQuizCard() {
  const { data: resources = [] } = useStudyResources()
  const { data: jobs = [] } = useQuizGenerations()
  useGenerationNotices(jobs)
  const [tab, setTab] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  // Students with a library land on it; everyone else on the upload.
  const current = tab ?? (resources.length > 0 ? 'library' : 'upload')

  return (
    <SectionCard
      data-tour="quiz-generate"
      icon={Sparkles}
      title="Make a quiz"
      description="From your lecture slides, photos of your notes, or a note"
      action={<Allowance />}
    >
      <Tabs value={current} onValueChange={setTab}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="upload">
            <Upload /> Upload
          </TabsTrigger>
          <TabsTrigger value="library">
            <Library /> My files{resources.length > 0 ? ` (${resources.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="note">
            <StickyNote /> A note
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="pt-3">
          <UploadPanel
            onUploaded={(resource) => {
              setSelectedId(resource.id)
              setTab('library')
            }}
          />
        </TabsContent>
        <TabsContent value="library" className="pt-3">
          <LibraryPanel selectedId={selectedId} onSelect={setSelectedId} />
        </TabsContent>
        <TabsContent value="note" className="pt-3">
          <NotePanel />
        </TabsContent>
      </Tabs>
      <InProgress jobs={jobs} />
    </SectionCard>
  )
}
