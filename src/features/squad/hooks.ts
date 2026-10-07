import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/app/providers/auth-provider'
import { queryKeys } from '@/lib/query-keys'
import { squadService } from '@/services/squad-service'

/** How often an open squad table rechecks. There is no realtime for squads. */
export const SQUAD_REFRESH_MS = 60_000

/** The student's squad, or null when they are not in one. */
export function useMySquad() {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: queryKeys.mySquad(userId ?? ''),
    queryFn: () => squadService.mine(userId!),
    enabled: Boolean(userId),
  })
}

/**
 * This week's table. Refetched on focus (the app default) and every minute
 * while open, and whenever the student earns XP (see useAwardXp): squads have
 * no live updates, and a table a minute old is current enough to race on.
 */
export function useSquadBoard(inSquad: boolean) {
  const { user } = useAuth()
  const userId = user?.id
  return useQuery({
    queryKey: queryKeys.squadBoard(userId ?? ''),
    queryFn: () => squadService.board(userId!),
    enabled: Boolean(userId) && inSquad,
    refetchInterval: SQUAD_REFRESH_MS,
  })
}

/** Every squad change refreshes the squad and its table together. */
function useSquadMutation<Args, Result>(run: (userId: string, args: Args) => Promise<Result>, done?: (result: Result) => void) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: Args) => run(user!.id, args),
    onSuccess: (result) => done?.(result),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.squad(user!.id) }),
  })
}

export function useCreateSquad() {
  return useSquadMutation(
    (userId, { name, handle }: { name: string; handle: string }) => squadService.create(userId, name, handle),
    () => toast.success('Squad started. Send the code to two friends and it starts counting.'),
  )
}

export function useJoinSquad() {
  return useSquadMutation(
    (userId, { code, handle }: { code: string; handle: string }) => squadService.join(userId, code, handle),
    (joined) => toast.success(`You're in ${joined.name}.`),
  )
}

export function useLeaveSquad() {
  return useSquadMutation((userId, _: void) => squadService.leave(userId), () => toast('You left the squad.'))
}

export function useRemoveSquadMember() {
  return useSquadMutation(
    (userId, handle: string) => squadService.remove(userId, handle),
    () => toast('Removed from the squad.'),
  )
}

export function useRenameSquad() {
  return useSquadMutation((userId, name: string) => squadService.rename(userId, name))
}

export function useNewSquadCode() {
  return useSquadMutation(
    (userId, _: void) => squadService.newCode(userId),
    () => toast.success('New code made. The old one no longer works.'),
  )
}
