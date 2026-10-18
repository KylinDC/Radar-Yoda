import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudflareRateLimiter, InMemoryRateLimiter } from '../src/rateLimiter.js'

describe('InMemoryRateLimiter', () => {
  let limiter: InMemoryRateLimiter

  beforeEach(() => {
    limiter = new InMemoryRateLimiter(600)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests under the limit', async () => {
    for (let i = 0; i < 600; i++) {
      expect(await limiter.isLimited('1.2.3.4')).toBe(false)
    }
  })

  it('blocks the request that exceeds the limit', async () => {
    for (let i = 0; i < 600; i++) await limiter.isLimited('1.2.3.4')
    expect(await limiter.isLimited('1.2.3.4')).toBe(true)
  })

  it('resets the counter after the window expires', async () => {
    for (let i = 0; i < 600; i++) await limiter.isLimited('1.2.3.4')
    expect(await limiter.isLimited('1.2.3.4')).toBe(true)

    vi.advanceTimersByTime(60_001)

    expect(await limiter.isLimited('1.2.3.4')).toBe(false)
  })

  it('tracks IPs independently', async () => {
    for (let i = 0; i < 600; i++) await limiter.isLimited('1.1.1.1')
    expect(await limiter.isLimited('1.1.1.1')).toBe(true)
    expect(await limiter.isLimited('2.2.2.2')).toBe(false)
  })

  it('purges expired entries when purgeExpired is called', async () => {
    await limiter.isLimited('1.2.3.4')
    expect(limiter.size).toBe(1)

    vi.advanceTimersByTime(60_001)
    limiter.purgeExpired()

    expect(limiter.size).toBe(0)
  })

  it('does not purge entries whose window has not yet expired', async () => {
    await limiter.isLimited('1.2.3.4')
    limiter.purgeExpired()
    expect(limiter.size).toBe(1)
  })

  it('honours a custom window', async () => {
    const short = new InMemoryRateLimiter(2, 10_000)
    await short.isLimited('1.1.1.1')
    await short.isLimited('1.1.1.1')
    expect(await short.isLimited('1.1.1.1')).toBe(true)

    vi.advanceTimersByTime(10_001)
    expect(await short.isLimited('1.1.1.1')).toBe(false)
  })
})

describe('CloudflareRateLimiter', () => {
  it('is not limited while the binding reports success', async () => {
    const limiter = new CloudflareRateLimiter({
      limit: async () => ({ success: true }),
    })
    expect(await limiter.isLimited('1.2.3.4')).toBe(false)
  })

  it('is limited once the binding reports failure', async () => {
    const limiter = new CloudflareRateLimiter({
      limit: async () => ({ success: false }),
    })
    expect(await limiter.isLimited('1.2.3.4')).toBe(true)
  })

  it('passes the key through to the binding', async () => {
    const limit = vi.fn(async () => ({ success: true }))
    const limiter = new CloudflareRateLimiter({ limit })

    await limiter.isLimited('9.9.9.9')

    expect(limit).toHaveBeenCalledWith({ key: '9.9.9.9' })
  })
})
