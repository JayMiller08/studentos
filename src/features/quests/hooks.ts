import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/auth-provider'
import { useQuizzes } from '@/features/quiz/hooks'
import { useSettleXp } from '@/hooks/use-award-xp'
import { usePlan } from '@/hooks/use-plan'
import { QUIZ_SLOT } from '@/lib/quests'
import { queryKeys } from '@/lib/query-keys'
import { type QuestBoardEntry, questService } from '@/services/quest-service'

/** This week's board. Refetched whenever anything pays XP (see useAwardXp). */
export function useQuestBoard() {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: queryKeys.questBoard(userId ?? ''),
    queryFn: () => questService.board(userId!),
    enabled: Boolean(userId),
  })
}

/** Quests claimed in earlier weeks. */
export function useQuestHistory() {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: queryKeys.questHistory(userId ?? ''),
    queryFn: () => questService.history(userId!),
    enabled: Boolean(userId),
  })
}

/**
 * Claim a finished quest.
 *
 * The board is marked claimed straight away, because the button that was just
 * pressed should not stay pressable while the request is in flight. A refusal
 * ("Not done yet: 4 of 5.") is the server's sentence, shown by the global
 * mutation handler, and the board is put back.
 */
export function useClaimQuest() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const settleXp = useSettleXp()
  return useMutation({
    mutationFn: (quest: QuestBoardEntry) => questService.claim(user!.id, quest.id),
    onMutate: async (quest) => {
      const key = queryKeys.questBoard(user!.id)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<QuestBoardEntry[]>(key)
      queryClient.setQueryData<QuestBoardEntry[]>(key, (board) =>
        board?.map((entry) => (entry.id === quest.id ? { ...entry, claimed: true } : entry)),
      )
      return { previous }
    },
    onError: (_error, _quest, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.questBoard(user!.id), context.previous)
    },
    onSuccess: (claim, quest) => {
      if (claim.claimed) {
        // Named as a bonus: it comes on top of the XP earned doing the quest,
        // and a bare "+50 XP" under "Reach 150 XP this week" reads as short pay.
        toast.success(`Quest complete: ${quest.title}`, {
          description: `+${claim.awarded} XP bonus, on top of the XP you earned along the way.`,
        })
      }
      // Refreshes the profile and the board, and catches a level badge the
      // reward just tipped over.
      void settleXp(claim.level)
    },
  })
}

/**
 * What a surface showing the board needs: the board, a claim action that
 * remembers which quest to celebrate, and whether the quiz quest is out of
 * reach — no quizzes, and a plan that cannot generate one.
 */
export function useQuestActions() {
  const board = useQuestBoard()
  const claim = useClaimQuest()
  const { has } = usePlan()
  const { data: quizzes } = useQuizzes()
  const [celebrating, setCelebrating] = React.useState<string | null>(null)

  const onClaim = React.useCallback(
    (quest: QuestBoardEntry) =>
      claim.mutate(quest, {
        onSuccess: (result) => {
          if (result.claimed) setCelebrating(quest.id)
        },
      }),
    [claim],
  )

  const quizLocked = !has('aiQuiz') && (quizzes?.length ?? 0) === 0
  const isLocked = React.useCallback(
    (quest: QuestBoardEntry) => quest.slot === QUIZ_SLOT && quizLocked && !quest.claimed,
    [quizLocked],
  )

  return {
    board,
    onClaim,
    claimingId: claim.isPending ? (claim.variables?.id ?? null) : null,
    celebrating,
    isLocked,
  }
}
