/**
 * Protects the backend from a struggling client.
 *
 * On a bad connection the failure mode is not one slow request — it is
 * amplification. Pages mount five or six queries at once, each retries, the
 * user reloads because nothing appeared, realtime reconnects and invalidates
 * everything again. One person on bad hotel wifi can generate a sustained
 * stream of doomed requests, and that load is paid for by everybody sharing
 * the backend.
 *
 * Two mechanisms, both deliberately dumb and local:
 *
 *  - a **concurrency limit**, so a page mount queues instead of firing every
 *    query simultaneously down a link that cannot carry them;
 *  - a **circuit breaker**, so once the backend is clearly unreachable the
 *    client stops asking for a while instead of retrying forever.
 *
 * The breaker only counts *transport* failures. A 403 or a constraint
 * violation means the server answered — it is healthy, the request was wrong,
 * and tripping the breaker on those would break the app for everyone whose
 * request was merely invalid.
 */

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface GuardStatus {
  state: CircuitState
  /** Consecutive transport failures since the last success. */
  failures: number
  /** When the breaker will next allow a probe; null while closed. */
  retryAt: number | null
  inFlight: number
  queued: number
}

export interface GuardOptions {
  /** Simultaneous requests allowed through. */
  maxConcurrent?: number
  /** Consecutive transport failures before the circuit opens. */
  failureThreshold?: number
  /** Base cooldown once open; doubles per consecutive failed probe. */
  cooldownMs?: number
  /** Upper bound on the backoff. */
  maxCooldownMs?: number
  now?: () => number
}

/** Thrown instead of issuing a request while the circuit is open. */
export class CircuitOpenError extends Error {
  readonly retryAt: number

  constructor(retryAt: number) {
    super("Can't reach StudentOS right now. Waiting for the connection to come back.")
    this.name = 'CircuitOpenError'
    this.retryAt = retryAt
  }
}

/**
 * Whether a rejection means "the backend never answered".
 *
 * `fetch` rejects with a TypeError for DNS failure, connection reset, CORS and
 * offline. Anything that produced an HTTP response — including 500 — came back
 * from a server that is reachable, so it is the caller's problem, not a reason
 * to stop talking to the backend entirely.
 */
export function isTransportFailure(error: unknown): boolean {
  if (error instanceof CircuitOpenError) return false
  if (error instanceof TypeError) return true
  if (error instanceof DOMException && error.name === 'AbortError') return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed')
  )
}

/** Full jitter — spreads retries so recovering clients don't arrive together. */
function jittered(delay: number): number {
  return Math.round(delay * (0.5 + Math.random() * 0.5))
}

export class RequestGuard {
  private readonly maxConcurrent: number
  private readonly failureThreshold: number
  private readonly cooldownMs: number
  private readonly maxCooldownMs: number
  private readonly now: () => number

  private inFlight = 0
  private failures = 0
  private retryAt: number | null = null
  /** Set while a half-open probe is out, so only one request tests the water. */
  private probing = false
  private readonly queue: Array<() => void> = []
  private readonly listeners = new Set<(status: GuardStatus) => void>()

  constructor(options: GuardOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 4
    this.failureThreshold = options.failureThreshold ?? 4
    this.cooldownMs = options.cooldownMs ?? 5_000
    this.maxCooldownMs = options.maxCooldownMs ?? 60_000
    this.now = options.now ?? (() => Date.now())
  }

  get state(): CircuitState {
    if (this.retryAt === null) return 'closed'
    return this.now() >= this.retryAt ? 'half-open' : 'open'
  }

  getStatus(): GuardStatus {
    return {
      state: this.state,
      failures: this.failures,
      retryAt: this.retryAt,
      inFlight: this.inFlight,
      queued: this.queue.length,
    }
  }

  subscribe(listener: (status: GuardStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Let the next attempt through immediately — used when the browser reports
   * the network is back, so recovery doesn't wait out the cooldown. */
  reset(): void {
    this.failures = 0
    this.retryAt = null
    this.probing = false
    this.emit()
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    const state = this.state
    if (state === 'open') {
      throw new CircuitOpenError(this.retryAt ?? this.now())
    }
    // Half-open: exactly one request is allowed through to test recovery.
    // Everyone else is refused so a burst doesn't hit a still-broken backend.
    if (state === 'half-open') {
      if (this.probing) throw new CircuitOpenError(this.retryAt ?? this.now())
      this.probing = true
    }

    await this.acquire()
    try {
      const result = await task()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure(error)
      throw error
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight += 1
      this.emit()
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.inFlight += 1
        resolve()
      })
      this.emit()
    })
  }

  private release(): void {
    this.inFlight -= 1
    this.queue.shift()?.()
    this.emit()
  }

  private onSuccess(): void {
    this.probing = false
    if (this.failures !== 0 || this.retryAt !== null) {
      this.failures = 0
      this.retryAt = null
      this.emit()
    }
  }

  private onFailure(error: unknown): void {
    this.probing = false
    if (!isTransportFailure(error)) return

    this.failures += 1
    if (this.failures >= this.failureThreshold) {
      // Back off further each time a probe fails, so a long outage settles
      // into occasional checks rather than a steady drip of doomed requests.
      const attempts = this.failures - this.failureThreshold
      const delay = Math.min(this.cooldownMs * 2 ** attempts, this.maxCooldownMs)
      this.retryAt = this.now() + jittered(delay)
    }
    this.emit()
  }

  private emit(): void {
    if (this.listeners.size === 0) return
    const status = this.getStatus()
    for (const listener of this.listeners) listener(status)
  }
}

/**
 * The app-wide guard. Every Supabase call and edge-function request goes
 * through this one instance, so the limits are global rather than per-feature.
 */
export const requestGuard = new RequestGuard()
