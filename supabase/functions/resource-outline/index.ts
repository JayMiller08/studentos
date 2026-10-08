/**
 * Read an uploaded study file's outline — Supabase Edge Function.
 *
 * Called once a student has uploaded a PDF or photos of notes. It reads the
 * file with the AI and stores what it found on the resource: the topics in
 * order, the pages each covers, a one-line summary. The student then picks
 * topics from that outline to aim a quiz at part of the file.
 *
 * Answers at once and does the reading in the background; the student's
 * library row moves from "reading" to "ready" (or "failed") live.
 *
 * Every plan can add files. Reading them is metered at 20 a day per student
 * (`begin_outline`, migration 00018), since each reading costs an AI call.
 *
 * Deploy: `supabase functions deploy resource-outline`
 */
import { requireCaller, serviceRoleClient } from '../_shared/auth.ts'
import { inBackground } from '../_shared/background.ts'
import { corsPreflight, jsonResponse } from '../_shared/cors.ts'
import { GeminiError, isGeminiConfigured } from '../_shared/gemini.ts'
import { loadResource, MaterialError, RESOURCE_COLUMNS, type ResourceRow } from '../_shared/material.ts'
import { readOutline } from '../_shared/outline.ts'

/** A reading still marked as running after this long is assumed lost. */
const STALE_READING_MS = 3 * 60 * 1000

type ServiceClient = ReturnType<typeof serviceRoleClient>

async function read(db: ServiceClient, userId: string, resource: ResourceRow): Promise<void> {
  const update = (patch: Record<string, unknown>) =>
    db.from('study_resources').update(patch).eq('id', resource.id).eq('user_id', userId)

  let release = async () => {}
  try {
    const material = await loadResource(db, userId, resource)
    release = material.release
    const outline = await readOutline(material.files, material.kind)

    if (!outline.isStudyMaterial) {
      await update({
        status: 'failed',
        error: "That doesn't look like study material. Try lecture slides, notes or a textbook page.",
      })
      return
    }
    await update({
      status: 'ready',
      outline: outline.topics,
      summary: outline.summary,
      // Counted from the file where possible; the model's count otherwise.
      page_count: material.pageCount ?? outline.pageCount,
      error: null,
    })
  } catch (error) {
    console.error('[resource-outline] reading failed', resource.id, error)
    await update({
      status: 'failed',
      error:
        error instanceof MaterialError || error instanceof GeminiError
          ? error.message
          : 'That file could not be read. Try uploading it again.',
    })
  } finally {
    await release()
  }
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!isGeminiConfigured) return jsonResponse({ error: 'AI is not configured on this deployment' }, 503)

  const { caller, response } = await requireCaller(req)
  if (!caller) return response

  let payload: { resourceId?: unknown }
  try {
    payload = (await req.json()) as { resourceId?: unknown }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  if (typeof payload.resourceId !== 'string') return jsonResponse({ error: 'No file specified' }, 400)

  const db = serviceRoleClient()

  // Pinned to the caller: this client can read every student's library.
  const { data: resource, error: lookupError } = await db
    .from('study_resources')
    .select(RESOURCE_COLUMNS)
    .eq('id', payload.resourceId)
    .eq('user_id', caller.userId)
    .maybeSingle()
  if (lookupError) {
    console.error('[resource-outline] lookup failed', lookupError)
    return jsonResponse({ error: 'Could not load that file.' }, 502)
  }
  if (!resource) return jsonResponse({ error: 'That file could not be found.' }, 404)

  const row = resource as ResourceRow
  // Already read: asking again changes nothing and costs nothing.
  if (row.status === 'ready') return jsonResponse({ status: 'ready' })
  // Being read right now — unless it has been "reading" for so long that the
  // last attempt must have died.
  if (row.status === 'reading' && Date.now() - Date.parse(row.updated_at) < STALE_READING_MS) {
    return jsonResponse({ status: 'reading' }, 202)
  }

  const { error: meterError } = await db.rpc('begin_outline', {
    p_user_id: caller.userId,
    p_resource_id: row.id,
  })
  if (meterError) {
    if (meterError.code === 'AI001') return jsonResponse({ error: meterError.message }, 429)
    console.error('[resource-outline] meter failed', meterError)
    return jsonResponse({ error: 'Could not start reading that file.' }, 502)
  }

  await db.from('study_resources').update({ status: 'reading', error: null }).eq('id', row.id).eq('user_id', caller.userId)
  await inBackground(() => read(db, caller.userId, row))
  return jsonResponse({ status: 'reading' }, 202)
})
