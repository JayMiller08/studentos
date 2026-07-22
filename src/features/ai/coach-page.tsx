import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Loader2, MessageSquarePlus, Send, Trash2 } from 'lucide-react'
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
import { queryKeys } from '@/lib/query-keys'
import { cn, formatDueDistance, getInitials } from '@/lib/utils'
import { aiService, COACH_MODES, type CoachMode } from '@/services/ai-service'
import { rankAssignments } from '@/services/priority-engine'
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
  const queryClient = useQueryClient()
  const { data: conversationList = [] } = useConversations()
  const { data: assignments = [] } = useAssignments()

  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<CoachMode>('coach')
  const [draft, setDraft] = React.useState('')
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  const activeConversation = conversationList.find((c) => c.id === activeId) ?? null
  const { data: messageList = [] } = useMessages(activeId)

  // Real deadlines only — this is what keeps the coach honest.
  const studyContext = React.useMemo(() => {
    const active = assignments.filter(
      (a) => a.status === 'not_started' || a.status === 'in_progress',
    )
    return rankAssignments(active)
      .slice(0, 6)
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
      await aiService.appendMessage(user!.id, conversation.id, 'user', text)
      const history = [
        ...messageList.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ]
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
    setDraft('')

    let conversation = activeConversation
    if (!conversation) {
      conversation = await aiService.createConversation(user!.id, mode)
      setActiveId(conversation.id)
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiConversations(user!.id) })
    }
    sendMessage.mutate({ text, conversation })
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
          <Card className="hidden gap-2 py-3 lg:flex">
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
              </div>
            </ScrollArea>

            <form
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
