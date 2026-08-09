import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CircuitOpenError,
  isTransportFailure,
  RequestGuard,
} from '@/lib/request-guard'

/** Deterministic jitter so cooldown assertions are exact. */
function fixedJitter(value = 0.5) {
  vi.spyOn(Math, 'random').mockReturnValue(value)
}

afterEach(() => vi.restoreAllMocks())

function makeClock(start = 0) {
  let t = start
  return { now: () => t, advance: (ms: number) => (t += ms) }
}

const networkError = () => new TypeError('Failed to fetch')
/** A server that answered — wrong answer, but reachable. */
const appError = () => new Error('insert on "habit_logs" failed: duplicate key')

describe('isTransportFailure', () => {
  it('treats fetch rejections as transport failures', () => {
    expect(isTransportFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isTransportFailure(new Error('NetworkError when attempting to fetch'))).toBe(true)
    expect(isTransportFailure(new Error('Load failed'))).toBe(true)
  })

  it('does not treat an answered request as a transport failure', () => {
    // The backend is reachable and healthy; the request was simply wrong.
    expect(isTransportFailure(appError())).toBe(false)
    expect(isTransportFailure(new Error('Unauthorized'))).toBe(false)
  })

  it('never counts its own rejection, which would be self-reinforcing', () => {
    expect(isTransportFailure(new CircuitOpenError(0))).toBe(false)
  })
})

describe('concurrency limiting', () => {
  it('caps simultaneous requests and queues the rest', async () => {
    const guard = new RequestGuard({ maxConcurrent: 2 })
    const release: Array<() => void> = []
    const started: number[] = []

    const tasks = [0, 1, 2, 3].map((i) =>
      guard.run(() => {
        started.push(i)
        return new Promise<void>((resolve) => release.push(resolve))
      }),
    )

    await Promise.resolve()
    // A page mounting six queries must not put six requests on the wire.
    expect(started).toEqual([0, 1])
    expect(guard.getStatus().queued).toBe(2)

    release[0]!()
    release[1]!()
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual([0, 1, 2, 3])

    release.forEach((r) => r())
    await Promise.all(tasks)
    expect(guard.getStatus().inFlight).toBe(0)
  })

  it('frees its slot when a request fails', async () => {
    const guard = new RequestGuard({ maxConcurrent: 1 })
    await expect(guard.run(() => Promise.reject(appError()))).rejects.toThrow()
    expect(guard.getStatus().inFlight).toBe(0)
    await expect(guard.run(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })
})

describe('the circuit breaker', () => {
  it('stays closed while the backend answers, however badly', async () => {
    const guard = new RequestGuard({ failureThreshold: 2 })
    for (let i = 0; i < 5; i += 1) {
      await expect(guard.run(() => Promise.reject(appError()))).rejects.toThrow()
    }
    // Five rejected writes are not an outage — the server replied every time.
    expect(guard.state).toBe('closed')
  })

  it('opens once the backend stops answering', async () => {
    fixedJitter()
    const clock = makeClock()
    const guard = new RequestGuard({ failureThreshold: 3, cooldownMs: 5_000, now: clock.now })

    for (let i = 0; i < 3; i += 1) {
      await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow(TypeError)
    }
    expect(guard.state).toBe('open')
  })

  it('refuses without issuing a request while open', async () => {
    fixedJitter()
    const clock = makeClock()
    const guard = new RequestGuard({ failureThreshold: 1, cooldownMs: 5_000, now: clock.now })
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()

    const task = vi.fn().mockResolvedValue('never runs')
    await expect(guard.run(task)).rejects.toBeInstanceOf(CircuitOpenError)
    // The point of the breaker: the doomed request is never put on the wire.
    expect(task).not.toHaveBeenCalled()
  })

  it('lets exactly one probe through when the cooldown expires', async () => {
    fixedJitter()
    const clock = makeClock()
    const guard = new RequestGuard({ failureThreshold: 1, cooldownMs: 1_000, now: clock.now })
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()

    clock.advance(10_000)
    expect(guard.state).toBe('half-open')

    let releaseProbe: (() => void) | undefined
    const probe = guard.run(() => new Promise<string>((resolve) => {
      releaseProbe = () => resolve('recovered')
    }))
    // A second caller must not tag along behind the probe.
    const second = vi.fn().mockResolvedValue('x')
    await expect(guard.run(second)).rejects.toBeInstanceOf(CircuitOpenError)
    expect(second).not.toHaveBeenCalled()

    releaseProbe!()
    await expect(probe).resolves.toBe('recovered')
    expect(guard.state).toBe('closed')
  })

  it('backs off further each time a probe fails', async () => {
    fixedJitter(1) // no jitter reduction, so delays are exact
    const clock = makeClock()
    const guard = new RequestGuard({
      failureThreshold: 1,
      cooldownMs: 1_000,
      maxCooldownMs: 60_000,
      now: clock.now,
    })

    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    const first = guard.getStatus().retryAt!
    expect(first - clock.now()).toBe(1_000)

    clock.advance(1_000)
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    // A long outage should settle into occasional checks, not a steady drip.
    expect(guard.getStatus().retryAt! - clock.now()).toBe(2_000)

    clock.advance(2_000)
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    expect(guard.getStatus().retryAt! - clock.now()).toBe(4_000)
  })

  it('caps the backoff', async () => {
    fixedJitter(1)
    const clock = makeClock()
    const guard = new RequestGuard({
      failureThreshold: 1,
      cooldownMs: 1_000,
      maxCooldownMs: 5_000,
      now: clock.now,
    })
    for (let i = 0; i < 10; i += 1) {
      clock.advance(60_000)
      await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    }
    expect(guard.getStatus().retryAt! - clock.now()).toBe(5_000)
  })

  it('spreads cooldowns so recovering clients do not return together', async () => {
    const clock = makeClock()
    const delays = new Set<number>()
    for (let i = 0; i < 25; i += 1) {
      const guard = new RequestGuard({ failureThreshold: 1, cooldownMs: 10_000, now: clock.now })
      await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
      delays.add(guard.getStatus().retryAt! - clock.now())
    }
    expect(delays.size).toBeGreaterThan(1)
    for (const d of delays) {
      expect(d).toBeGreaterThanOrEqual(5_000)
      expect(d).toBeLessThanOrEqual(10_000)
    }
  })

  it('recovers immediately on reset, for when the network comes back', async () => {
    fixedJitter()
    const clock = makeClock()
    const guard = new RequestGuard({ failureThreshold: 1, cooldownMs: 30_000, now: clock.now })
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    expect(guard.state).toBe('open')

    guard.reset()

    expect(guard.state).toBe('closed')
    await expect(guard.run(() => Promise.resolve('ok'))).resolves.toBe('ok')
  })

  it('clears the failure count after a success', async () => {
    const clock = makeClock()
    const guard = new RequestGuard({ failureThreshold: 3, now: clock.now })
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    await guard.run(() => Promise.resolve('ok'))
    expect(guard.getStatus().failures).toBe(0)

    // Two more failures must not tip it over — the counter restarted.
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    expect(guard.state).toBe('closed')
  })
})

describe('status subscribers', () => {
  it('reports state changes so the UI can explain the stall', async () => {
    fixedJitter()
    const clock = makeClock()
    const guard = new RequestGuard({ failureThreshold: 1, cooldownMs: 5_000, now: clock.now })
    const seen: string[] = []
    const unsubscribe = guard.subscribe((s) => seen.push(s.state))

    await expect(guard.run(() => Promise.reject(networkError()))).rejects.toThrow()
    expect(seen).toContain('open')

    unsubscribe()
    const before = seen.length
    await expect(guard.run(() => Promise.resolve('x'))).rejects.toBeInstanceOf(CircuitOpenError)
    expect(seen.length).toBe(before)
  })
})
