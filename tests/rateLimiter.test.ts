import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { isRateLimited, purgeExpired, rateMap } from '../src/rateLimiter.js'

beforeEach(() => {
  rateMap.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isRateLimited', () => {
  it('allows requests under the limit', () => {
    for (let i = 0; i < 600; i++) {
      expect(isRateLimited('1.2.3.4', 600)).toBe(false)
    }
  })

  it('blocks the request that exceeds the limit', () => {
    for (let i = 0; i < 600; i++) isRateLimited('1.2.3.4', 600)
    expect(isRateLimited('1.2.3.4', 600)).toBe(true)
  })

  it('resets the counter after the window expires', () => {
    for (let i = 0; i < 600; i++) isRateLimited('1.2.3.4', 600)
    expect(isRateLimited('1.2.3.4', 600)).toBe(true)

    vi.advanceTimersByTime(60_001)

    expect(isRateLimited('1.2.3.4', 600)).toBe(false)
  })

  it('tracks IPs independently', () => {
    for (let i = 0; i < 600; i++) isRateLimited('1.1.1.1', 600)
    expect(isRateLimited('1.1.1.1', 600)).toBe(true)
    expect(isRateLimited('2.2.2.2', 600)).toBe(false)
  })

  it('purges expired entries when purgeExpired is called', () => {
    isRateLimited('1.2.3.4', 600)
    expect(rateMap.size).toBe(1)

    vi.advanceTimersByTime(60_001)
    purgeExpired()

    expect(rateMap.size).toBe(0)
  })

  it('does not purge entries whose window has not yet expired', () => {
    isRateLimited('1.2.3.4', 600)
    purgeExpired()
    expect(rateMap.size).toBe(1)
  })
})
