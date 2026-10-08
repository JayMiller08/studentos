/**
 * Finish work after the response has gone.
 *
 * Reading a 40-page PDF and writing a checked quiz takes tens of seconds. A
 * phone that locks, or a tab that is closed, in that time would lose the quiz
 * if the work were tied to the request — so the function answers at once with
 * the job's id and keeps going under `EdgeRuntime.waitUntil`, which Supabase
 * provides for exactly this. The student follows the job's row instead.
 *
 * Where there is no EdgeRuntime (tests, a plain `deno run`), the work simply
 * runs before the response, which keeps behaviour identical and observable.
 */
export async function inBackground(work: () => Promise<void>): Promise<void> {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void } }).EdgeRuntime
  if (runtime?.waitUntil) {
    runtime.waitUntil(
      work().catch((error: unknown) => {
        console.error('[background] work failed after the response', error)
      }),
    )
    return
  }
  await work()
}
