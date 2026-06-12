export const rateMap = new Map<string, { count: number; resetAt: number }>()

export function isRateLimited(ip: string, limit = 600, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + windowMs })
    return false
  }
  if (entry.count >= limit) return true
  entry.count++
  return false
}

export function purgeExpired(): void {
  const now = Date.now()
  for (const [ip, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(ip)
  }
}

// Purge expired entries every 5 minutes to prevent unbounded memory growth
setInterval(purgeExpired, 5 * 60_000).unref()
