import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Bot, Loader2, MessageSquarePlus, RotateCcw, Send, Trash2 } from 'lucide-react'
import * as React from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '@/app/providers/auth-provider'
import { PageHeader } from '@/components/page-header'
import { PlanGate } from '@/components/plan-gate'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useAssignments } from '@/features/assignments/hooks'
import { usePlan } from '@/hooks/use-plan'
import { queryKeys } from '@/lib/query-keys'
import { cn, formatDueDistance, getInitials } from '@/lib/utils'
import { aiService, COACH_MODES, type CoachMode } from '@/services/ai-service'
import { orderAssignments } from '@/services/priority-engine'
import type { AIConversation } from '@/types/models'

function useConversations() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.aiConversations(user?.id ?? ''),
    queryFn: () => aiService.listConversations(user!.id),
    enabled: Boolean(user),
  })
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

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<CoachMode>('coach')
  const [draft, setDraft] = React.useState('')
  /** Last send whose reply failed, kept so the student can retry it. */
  const [failedSend, setFailedSend] = React.useState<{
    text: string
    conversation: AIConversation
  } | null>(null)
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  const activeConversation = conversationList.find((c) => c.id === activeId) ?? null
  const { data: messageList = [] } = useMessages(activeId)

  // Real deadlines only — this is what keeps the coach honest. Ordering goes
  // through the shared helper so the coach agrees with the dashboard about
  // what matters most.
  const studyContext = React.useMemo(() => {
    const active = assignments.filter(
      (a) => a.status === 'not_started' || a.status === 'in_progress',
    )
    return orderAssignments(active, { smart: smartPrioritization })
      .items.slice(0, 6)
      .map(
        (a) =>
          `- "${a.title}" — ${formatDueDistance(a.due_at)}, ${a.progress}% done, weight ${a.weight}%, est ${Math.round(a.estimated_minutes / 60)}h`,
      )
      .join('\n')
  }, [assignments])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messageList.length])

  const sendMessage = useMutation({
    mutationFn: async ({ text, conversation }: { text: string; conversation: AIConversation }) => {
      // Read the thread fresh — the rendered copy lags behind a retry, and
      // sending stale history would ask the model to answer twice.
      const existing = await aiService.listMessages(user!.id, conversation.id)
      const last = existing[existing.length - 1]
      // On a retry the student's message is already stored; don't duplicate it.
      const alreadySaved = last?.role === 'user' && last.content === text

      if (!alreadySaved) {
        await aiService.appendMessage(user!.id, conversation.id, 'user', text)
      }
      const history = existing.map((m) => ({ role: m.role, content: m.content }))
      if (!alreadySaved) history.push({ role: 'user', content: text })

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
    if (!text || sendMessage.isPending) return

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
      await sendMessage.mutateAsync({ text, conversation })
    } catch {
      // Starting the conversation failed, so nothing was saved and there is no
      // thread to retry from — put the draft back. A failure *after* the
      // message was stored is recoverable via the retry bar instead.
      setDraft((current) => current || text)
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
              className="flex items-end gap-2 border-t p-3"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSend()
              }}
            >
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
                    ? 'Paste your notes or material here…'
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
                disabled={!draft.trim() || sendMessage.isPending}
              >
                <Send />
              </Button>
            </form>
          </Card>
        </div>
      </PlanGate>
    </div>
  )
}
