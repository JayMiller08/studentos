import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bot,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/auth-provider'
import { PageHeader } from '@/components/page-header'
import { PlanGate } from '@/components/plan-gate'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useAssignments, useModules } from '@/features/assignments/hooks'
import { useCalendarEvents } from '@/features/calendar/hooks'
import { useNotes } from '@/features/notes/hooks'
import { useTasks } from '@/features/planner/hooks'
import { usePlan } from '@/hooks/use-plan'
import {
  type Attachment,
  ATTACHMENT_ACCEPT,
  formatBytes,
  MAX_FILES,
  SUPPORTED_FORMATS,
  toAttachment,
  validateFile,
} from '@/lib/attachments'
import { queryKeys } from '@/lib/query-keys'
import { cn, getInitials } from '@/lib/utils'
import { aiService, COACH_MODES, type CoachMode, type CoachTurn } from '@/services/ai-service'
import { buildStudyContext } from '@/services/study-context'
import type { AIConversation } from '@/types/models'

function useConversations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.aiConversations(user?.id ?? ''),
    queryFn: () => aiService.listConversations(user!.id),
    enabled: Boolean(user),
  })
}

/**
 * What gets written to `ai_messages`. Attachment bytes are deliberately not
 * stored — a semester of lecture PDFs does not belong in Postgres — so the
 * saved row keeps a filename marker and the thread still reads correctly.
 */
function storedContent(text: string, files: Attachment[]): string {
  if (files.length === 0) return text
  const list = files.map((file) => `📎 ${file.name}`).join('\n')
  return text ? `${text}\n\n${list}` : list
}

function useMessages(conversationId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.aiMessages(user?.id ?? '', conversationId ?? ''),
    queryFn: () => aiService.listMessages(user!.id, conversationId!),
    enabled: Boolean(user && conversationId),
  })
}

export function CoachPage() {
  const { user } = useAuth()
  const { has } = usePlan()
  const smartPrioritization = has('smartPrioritization')
  const queryClient = useQueryClient()
  const { data: conversationList = [] } = useConversations()
  const { data: assignments = [] } = useAssignments()
  const { data: modules = [] } = useModules()
  const { data: tasks = [] } = useTasks()
  const { data: events = [] } = useCalendarEvents()
  const { data: notes = [] } = useNotes()

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<CoachMode>('coach')
  const [draft, setDraft] = React.useState('')
  /** Last send whose reply failed, kept so the student can retry it. */
  const [failedSend, setFailedSend] = React.useState<{
    text: string
    conversation: AIConversation
    files: Attachment[]
  } | null>(null)
  /** Files staged for the next message; cleared once it is sent. */
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return
    // Validate against the running total so four small files and one huge one
    // are judged the same way.
    let staged = attachments
    for (const file of Array.from(fileList)) {
      const problem = validateFile(file, staged)
      if (problem) {
        toast.error(problem)
        continue
      }
      try {
        staged = [...staged, await toAttachment(file)]
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `Could not read ${file.name}.`)
      }
    }
    setAttachments(staged)
  }

  const activeConversation = conversationList.find((c) => c.id === activeId) ?? null
  const { data: messageList = [] } = useMessages(activeId)

  // A live, bounded snapshot of everything the student is actually juggling.
  // Real data only — this is what keeps the coach honest.
  const studyContext = React.useMemo(
    () =>
      buildStudyContext({
        assignments,
        tasks,
        events,
        notes,
        modules,
        smart: smartPrioritization,
      }),
    [assignments, tasks, events, notes, modules, smartPrioritization],
  )

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messageList.length])

  const sendMessage = useMutation({
    mutationFn: async ({
      text,
      conversation,
      files,
    }: {
      text: string
      conversation: AIConversation
      files: Attachment[]
    }) => {
      // Read the thread fresh — the rendered copy lags behind a retry, and
      // sending stale history would ask the model to answer twice.
      const existing = await aiService.listMessages(user!.id, conversation.id)
      const last = existing[existing.length - 1]
      // Attachments are not stored, so the saved message carries a filename
      // marker; match on that to recognise an already-saved retry.
      const stored = storedContent(text, files)
      const alreadySaved = last?.role === 'user' && last.content === stored

      if (!alreadySaved) {
        await aiService.appendMessage(user!.id, conversation.id, 'user', stored)
      }
      const history: CoachTurn[] = existing.map((m) => ({ role: m.role, content: m.content }))
      // Swap the stored marker row for the live turn, which is the only one
      // carrying the actual file bytes.
      if (alreadySaved) history.pop()
      history.push({ role: 'user', content: text, files })

      const reply = await aiService.getReply({
        mode: conversation.mode,
        history,
        studyContext,
      })
      await aiService.appendMessage(user!.id, conversation.id, 'assistant', reply)
      if (conversation.title === 'New conversation') {
        await aiService.renameConversation(conversation.id, text.slice(0, 48))
      }
    },
    onSuccess: () => setFailedSend(null),
    onError: (_error, variables) => setFailedSend(variables),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.aiMessages(user!.id, variables.conversation.id),
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiConversations(user!.id) })
    },
  })

  async function handleSend() {
    const text = draft.trim()
    const files = attachments
    // A bare attachment with no question is a legitimate send ("here, quiz me").
    if ((!text && files.length === 0) || sendMessage.isPending) return

    try {
      let conversation = activeConversation
      if (!conversation) {
        conversation = await aiService.createConversation(user!.id, mode)
        setActiveId(conversation.id)
        void queryClient.invalidateQueries({ queryKey: queryKeys.aiConversations(user!.id) })
      }
      // Clear only once the message is on its way to a real conversation, so a
      // failure to even start one hands the words back.
      setDraft('')
      setAttachments([])
      await sendMessage.mutateAsync({ text, conversation, files })
    } catch {
      // Starting the conversation failed, so nothing was saved and there is no
      // thread to retry from — put the draft and files back. A failure *after*
      // the message was stored is recoverable via the retry bar instead.
      setDraft((current) => current || text)
      setAttachments((current) => (current.length > 0 ? current : files))
      // The reason surfaces through the global mutation toast.
    }
  }

  async function removeConversation(id: string) {
    await aiService.removeConversation(id)
    if (activeId === id) setActiveId(null)
    void queryClient.invalidateQueries({ queryKey: queryKeys.aiConversations(user!.id) })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Study Coach"
        description="Explain concepts, build quizzes and flashcards, plan your studying"
      />

      <PlanGate
        feature="aiCoach"
        title="The AI coach is a Student Pro feature"
        description="Upgrade for explanations, quiz generation, flashcards, summaries, essay feedback and programming help — grounded in your real deadlines."
      >
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          {/* Conversations */}
          <Card data-tour="coach-conversations" className="hidden gap-2 py-3 lg:flex">
            <CardContent className="flex flex-col gap-1.5 px-3">
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => setActiveId(null)}
              >
                <MessageSquarePlus /> New conversation
              </Button>
              <ul className="mt-1 space-y-0.5">
                {conversationList.map((conversation) => (
                  <li key={conversation.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(conversation.id)
                        setMode(conversation.mode)
                      }}
                      className={cn(
                        'hover:bg-accent w-full truncate rounded-md px-2.5 py-1.5 pr-8 text-left text-sm transition-colors',
                        activeId === conversation.id && 'bg-accent font-medium',
                      )}
                    >
                      {conversation.title}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete conversation ${conversation.title}`}
                      onClick={() => void removeConversation(conversation.id)}
                      className="text-muted-foreground hover:text-destructive absolute top-1/2 right-2 hidden -translate-y-1/2 group-hover:block"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Chat pane */}
          <Card className="flex min-h-[60vh] flex-col gap-0 py-0">
            <div className="flex flex-wrap gap-1.5 border-b p-3">
              {COACH_MODES.map((coachMode) => (
                <button
                  key={coachMode.id}
                  type="button"
                  title={coachMode.hint}
                  aria-pressed={mode === coachMode.id}
                  disabled={Boolean(activeConversation)}
                  onClick={() => setMode(coachMode.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                    mode === coachMode.id
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {coachMode.label}
                </button>
              ))}
            </div>

            <ScrollArea className="flex-1">
              <div ref={scrollRef} className="space-y-4 p-4">
                {messageList.length === 0 ? (
                  <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
                    <Bot aria-hidden className="text-primary size-8" />
                    <p className="max-w-sm">
                      {COACH_MODES.find((m) => m.id === mode)?.hint}. The coach knows your real
                      deadlines and never invents new ones.
                    </p>
                  </div>
                ) : (
                  messageList.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        'flex gap-2.5',
                        message.role === 'user' ? 'flex-row-reverse' : '',
                      )}
                    >
                      <Avatar className="size-7">
                        <AvatarFallback
                          className={
                            message.role === 'assistant'
                              ? 'bg-primary text-primary-foreground'
                              : undefined
                          }
                        >
                          {message.role === 'assistant' ? (
                            <Bot className="size-4" />
                          ) : (
                            getInitials(user?.email ?? 'You')
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={cn(
                          'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm',
                          message.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted',
                        )}
                      >
                        <div className="prose prose-sm dark:prose-invert [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 max-w-none [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-black/10 [&_pre]:p-2">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {sendMessage.isPending ? (
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" /> Thinking…
                  </div>
                ) : null}
                {failedSend && !sendMessage.isPending ? (
                  <div
                    role="alert"
                    className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-2 rounded-xl border p-3 text-sm sm:flex-row sm:items-center"
                  >
                    <AlertTriangle aria-hidden className="text-destructive size-4 shrink-0" />
                    <p className="flex-1">
                      The coach couldn’t reply. Your message was saved — try again.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => sendMessage.mutate(failedSend)}
                    >
                      <RotateCcw /> Retry
                    </Button>
                  </div>
                ) : null}
              </div>
            </ScrollArea>

            <form
              data-tour="coach-composer"
              className="border-t p-3"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSend()
              }}
            >
              {attachments.length > 0 ? (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((file) => (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="bg-muted flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs"
                    >
                      <Paperclip aria-hidden className="size-3 shrink-0" />
                      <span className="max-w-40 truncate">{file.name}</span>
                      <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setAttachments((current) => current.filter((f) => f !== file))
                        }
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ATTACHMENT_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    void addFiles(event.target.files)
                    // Reset so picking the same file twice still fires onChange.
                    event.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label="Attach a file"
                  title={`Attach a ${SUPPORTED_FORMATS}`}
                  disabled={sendMessage.isPending || attachments.length >= MAX_FILES}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip />
                </Button>
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder={
                    mode === 'quiz' || mode === 'flashcards' || mode === 'summary'
                      ? 'Paste or attach your notes…'
                      : 'Ask anything about your studies…'
                  }
                  aria-label="Message the study coach"
                  className="max-h-40 min-h-11"
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  disabled={(!draft.trim() && attachments.length === 0) || sendMessage.isPending}
                >
                  <Send />
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </PlanGate>
    </div>
  )
}
