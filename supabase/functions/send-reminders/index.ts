/**
 * Reminder generator — Supabase Edge Function (cron).
 *
 * Mirrors the client-side reminder rules so notifications exist even when a
 * user hasn't opened the app. Schedule it daily, e.g. in `supabase/config.toml`:
 *
 *   [functions.send-reminders]
 *   schedule = "0 6 * * *"
 *
 * Runs with the service role (bypasses RLS) — fails closed if CRON_SECRET is missing
 * or if the `x-cron-secret` header is missing/invalid.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')

const DAY_MS = 24 * 60 * 60 * 1000

Deno.serve(async (req) => {
  // Fail closed if CRON_SECRET is not configured in the environment.
  if (!CRON_SECRET) {
    return jsonResponse({ error: 'CRON_SECRET is not configured' }, 503)
  }

  // Require valid shared secret header on all invocations.
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now = new Date()
  const soon = new Date(now.getTime() + 2 * DAY_MS)
  const todayKey = now.toISOString().slice(0, 10)

  const { data: assignments, error } = await admin
    .from('assignments')
    .select('id, user_id, title, due_at, status')
    .in('status', ['not_started', 'in_progress'])
    .lte('due_at', soon.toISOString())
  if (error) return jsonResponse({ error: error.message }, 500)

  let created = 0
  for (const assignment of assignments ?? []) {
    const due = new Date(assignment.due_at)
    const overdue = due < now
    const title = overdue ? `Overdue: ${assignment.title}` : `Due soon: ${assignment.title}`
    const actionUrl = `/app/assignments#${assignment.id}`

    // One reminder per assignment per day.
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', assignment.user_id)
      .eq('kind', 'assignment_due')
      .eq('action_url', actionUrl)
      .gte('created_at', `${todayKey}T00:00:00Z`)
    if ((count ?? 0) > 0) continue

    // Respect the user's notification preferences.
    const { data: profile } = await admin
      .from('profiles')
      .select('notification_prefs')
      .eq('id', assignment.user_id)
      .single()
    const prefs = profile?.notification_prefs as { assignments?: boolean } | null
    if (prefs && prefs.assignments === false) continue

    const { error: insertError } = await admin.from('notifications').insert({
      user_id: assignment.user_id,
      kind: 'assignment_due',
      title,
      body: overdue
        ? 'This assignment is past its deadline.'
        : `Deadline: ${due.toUTCString()}`,
      action_url: actionUrl,
      sent_at: now.toISOString(),
    })
    if (!insertError) created += 1
  }

  return jsonResponse({ ok: true, created })
})
