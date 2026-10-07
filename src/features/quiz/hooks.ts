import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/auth-provider'
import { announceStreak } from '@/features/gamification/announce-streak'
import { useSettleXp } from '@/hooks/use-award-xp'
import { usePlan } from '@/hooks/use-plan'
import { useRealtimeTable } from '@/hooks/use-realtime'
import { queryKeys } from '@/lib/query-keys'
import { quizService, type GenerateQuizInput } from '@/services/quiz-service'
import { resourceService } from '@/services/resource-service'
import type { Quiz, QuizGeneration, QuizResult, StudyResource } from '@/types/models'

export function useQuizzes() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('quizzes', userId, userId ? queryKeys.quizzes(userId) : [])
  return useQuery({
    queryKey: queryKeys.quizzes(userId ?? ''),
    queryFn: () => quizService.list(userId!),
    enabled: Boolean(userId),
  })
}

export function useQuiz(id: string | undefined) {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: queryKeys.quiz(userId ?? '', id ?? ''),
    queryFn: () => quizService.get(id!),
    enabled: Boolean(userId && id),
  })
}

export function useQuizQuestions(quizId: string | undefined) {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: queryKeys.quizQuestions(userId ?? '', quizId ?? ''),
    queryFn: () => quizService.questions(quizId!),
    enabled: Boolean(userId && quizId),
    // The question set for a given quiz never changes once generated, and a
    // refetch mid-attempt would reset the runner underneath the student.
    staleTime: Infinity,
  })
}

export function useQuizAttempts(quizId?: string) {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: queryKeys.quizAttempts(userId ?? '', quizId),
    queryFn: () => quizService.attempts(userId!, quizId),
    enabled: Boolean(userId),
  })
}

/** A job still being worked on — what the student is waiting for. */
export function isActiveGeneration(job: Pick<QuizGeneration, 'status'>): boolean {
  return job.status !== 'done' && job.status !== 'failed'
}

/**
 * Start writing a quiz. Resolves to the job's id; the quiz itself arrives
 * through useQuizGenerations when the job is done.
 */
export function useGenerateQuiz() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<GenerateQuizInput, 'userId'>) =>
      quizService.generate({ ...input, userId: user!.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizGenerations(user!.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.aiQuizUsage(user!.id) })
      // Demo mode's job is finished before it is returned.
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes(user!.id) })
    },
  })
}

/**
 * Recent generation jobs, live. Realtime carries each step; while one is
 * running the list is also polled, so a dropped socket can't strand a student
 * watching a spinner.
 */
export function useQuizGenerations() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('quiz_generations', userId, userId ? queryKeys.quizGenerations(userId) : [])
  return useQuery({
    queryKey: queryKeys.quizGenerations(userId ?? ''),
    queryFn: () => quizService.generations(userId!),
    enabled: Boolean(userId),
    refetchInterval: (query) => ((query.state.data ?? []).some(isActiveGeneration) ? 4000 : false),
  })
}

/**
 * Say when a quiz the student started in this session is ready, or why it
 * failed — once, however many times the list refreshes. Jobs that were already
 * finished when the page loaded are history, not news.
 */
export function useGenerationNotices(jobs: QuizGeneration[] | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const watched = React.useRef<Map<string, QuizGeneration['status']> | null>(null)

  React.useEffect(() => {
    if (!jobs || !user) return
    if (watched.current === null) {
      watched.current = new Map(jobs.map((job) => [job.id, job.status]))
      return
    }
    for (const job of jobs) {
      const before = watched.current.get(job.id)
      watched.current.set(job.id, job.status)
      if (before === job.status || (before !== undefined && !isActiveGeneration({ status: before }))) continue
      if (job.status === 'done' && job.quiz_id) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes(user.id) })
        const quizId = job.quiz_id
        toast.success(`Your quiz is ready: ${job.title}`, {
          action: { label: 'Start', onClick: () => navigate(`/app/quiz/${quizId}`) },
        })
      } else if (job.status === 'failed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.aiQuizUsage(user.id) })
        toast.error(job.error ?? "That quiz couldn't be written. Try again.")
      }
    }
  }, [jobs, user, queryClient, navigate])
}

/** This month's AI quizzes against the plan's allowance. */
export function useAiQuizAllowance() {
  const { user } = useAuth()
  const { limits } = usePlan()
  const query = useQuery({
    queryKey: queryKeys.aiQuizUsage(user?.id ?? ''),
    queryFn: () => quizService.usedThisMonth(user!.id),
    enabled: Boolean(user),
  })
  const used = query.data ?? 0
  const limit = limits.aiQuizzesPerMonth
  return { used, limit, remaining: Math.max(0, limit - used), isLoading: query.isLoading }
}

// ── The study library ───────────────────────────────────────────────────────

export function useStudyResources() {
  const { user } = useAuth()
  const userId = user?.id
  useRealtimeTable('study_resources', userId, userId ? queryKeys.studyResources(userId) : [])
  return useQuery({
    queryKey: queryKeys.studyResources(userId ?? ''),
    queryFn: () => resourceService.list(userId!),
    enabled: Boolean(userId),
    // Being read: poll as well as listen, for the same reason as jobs.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((resource) => resource.status === 'uploaded' || resource.status === 'reading')
        ? 4000
        : false,
  })
}

/** Add files to the library, then ask for them to be read. */
export function useUploadResource() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { files: File[]; title?: string; moduleId?: string | null }) => {
      const resource = await resourceService.upload(user!.id, input)
      // The upload is kept even if reading can't start now (the day's cap,
      // a busy service); the library offers to try again.
      resourceService.read(resource.id).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "That file couldn't be read yet. Try again from your files.")
        void queryClient.invalidateQueries({ queryKey: queryKeys.studyResources(user!.id) })
      })
      return resource
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studyResources(user!.id) })
    },
  })
}

/** Try reading a file again. */
export function useReadResource() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (resource: StudyResource) => resourceService.read(resource.id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studyResources(user!.id) })
    },
  })
}

export function useRemoveResource() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (resource: StudyResource) => resourceService.remove(resource),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.studyResources(user!.id) })
    },
  })
}

export interface SubmitQuizInput {
  quiz: Quiz
  chosen: Map<string, number | null>
  durationSeconds: number
}

export function useSubmitQuiz() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const settleXp = useSettleXp()
  return useMutation<QuizResult, Error, SubmitQuizInput>({
    mutationFn: (input) =>
      quizService.grade(user!.id, input.quiz, input.chosen, input.durationSeconds),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizAttempts(user!.id) })
      announceStreak(result.streak ?? null)
      // XP, level and streak were changed server-side, so the cached profile
      // is stale — the header's level chip reads from it. Settling refreshes it,
      // moves the quest board, and catches a level badge the quiz just earned.
      void settleXp(result.level)
    },
  })
}

export function useDeleteQuiz() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => quizService.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.quizzes(user!.id) })
    },
  })
}
