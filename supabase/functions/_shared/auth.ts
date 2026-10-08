import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

export interface Caller {
  userId: string
  plan: string
}

export interface PaidCaller {
  userId: string
  plan: 'pro' | 'elite'
}

/**
 * Verify the caller's JWT and nothing else.
 *
 * The sibling of `requirePaidCaller` for features every plan gets. Taking a
 * quiz is free; only generating one with AI is not, so grading must not check
 * the plan or a Free student could never be marked.
 */
export async function requireCaller(
  req: Request,
): Promise<{ caller: Caller; response?: never } | { caller?: never; response: Response }> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { response: jsonResponse({ error: 'Unauthorized' }, 401) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  return { caller: { userId: user.id, plan: profile?.plan ?? 'free' } }
}

/**
 * A client that bypasses RLS.
 *
 * The only writer of `quiz_attempts`, `quiz_answers` and `xp_ledger` — those
 * tables have no insert policy precisely so that nothing else can be. Never
 * build one of these from a value the caller supplied: every query made with
 * it must pin `user_id` to an id that came from a verified JWT.
 */
export function serviceRoleClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Verify the caller's JWT and confirm their plan includes AI.
 *
 * Returns either the caller or a ready-to-send Response, so every AI function
 * enforces entitlements the same way. This is the real boundary — the client's
 * PlanGate is only UX, and a request can always be replayed by hand.
 */
export async function requirePaidCaller(
  req: Request,
): Promise<{ caller: PaidCaller; response?: never } | { caller?: never; response: Response }> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { response: jsonResponse({ error: 'Unauthorized' }, 401) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.plan !== 'pro' && profile.plan !== 'elite')) {
    return { response: jsonResponse({ error: 'This feature requires Student Pro.' }, 403) }
  }

  return { caller: { userId: user.id, plan: profile.plan } }
}
