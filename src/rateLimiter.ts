export interface RateLimiter {
  /** Resolves true when `key` has exhausted its budget for the current window. */
  isLimited(key: string): Promise<boolean>
}

/** The subset of Cloudflare's rate limiting binding that we depend on. */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/**
 * Cloudflare's native rate limiting binding (see `ratelimits` in wrangler.jsonc).
 *
 * Preferred on Workers: counters live in the Cloudflare network, so they are
 * shared across isolates. Counters are per Cloudflare location, not global, so
 * the effective limit is roughly `limit` per location.
 */
export class CloudflareRateLimiter implements RateLimiter {
  constructor(private readonly binding: RateLimitBinding) {}

  async isLimited(key: string): Promise<boolean> {
    const { success } = await this.binding.limit({ key })
    return !success
  }
}

/**
 * Fallback limiter backed by an in-process Map.
 *
 * Only correct for a single long-lived process. On Workers each isolate keeps
 * its own memory and is recycled freely, so this under-counts badly — it exists
 * for local development without bindings, and for tests.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit = 600,
    private readonly windowMs = 60_000,
  ) {}

  async isLimited(key: string): Promise<boolean> {
    const now = Date.now()
    const entry = this.counts.get(key)

    if (!entry || now > entry.resetAt) {
      // Prune lazily rather than on a timer: Workers have no setInterval, and a
      // timer would keep the process alive.
      if (this.counts.size >= 10_000) this.purgeExpired(now)
      this.counts.set(key, { count: 1, resetAt: now + this.windowMs })
      return false
    }

    if (entry.count >= this.limit) return true
    entry.count++
    return false
  }

  purgeExpired(now = Date.now()): void {
    for (const [key, entry] of this.counts) {
      if (now > entry.resetAt) this.counts.delete(key)
    }
  }

  /** Number of tracked keys, including expired ones not yet purged. */
  get size(): number {
    return this.counts.size
  }
}
