import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpExternalDataFetcher } from '../src/externalDataFetcher.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeFetch(status: number, body: unknown): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

describe('HttpExternalDataFetcher.fetchGitHubHealth', () => {
  it('returns GitHubHealth on successful response', async () => {
    const mockFetch = makeFetch(200, {
      items: [
        {
          stargazers_count: 50000,
          open_issues_count: 120,
          pushed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
        },
      ],
    })
    const fetcher = new HttpExternalDataFetcher(mockFetch)
    const result = await fetcher.fetchGitHubHealth('kubernetes')
    expect(result).not.toBeNull()
    expect(result!.stars).toBe(50000)
    expect(result!.openIssues).toBe(120)
    expect(result!.lastCommitDaysAgo).toBeGreaterThanOrEqual(29)
    expect(result!.lastCommitDaysAgo).toBeLessThanOrEqual(31)
  })

  it('returns null when response is not ok (403)', async () => {
    const mockFetch = makeFetch(403, {})
    const fetcher = new HttpExternalDataFetcher(mockFetch)
    const result = await fetcher.fetchGitHubHealth('kubernetes')
    expect(result).toBeNull()
  })

  it('returns null when items array is empty', async () => {
    const mockFetch = makeFetch(200, { items: [] })
    const fetcher = new HttpExternalDataFetcher(mockFetch)
    const result = await fetcher.fetchGitHubHealth('unknownxyz')
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
    const fetcher = new HttpExternalDataFetcher(mockFetch as unknown as typeof globalThis.fetch)
    const result = await fetcher.fetchGitHubHealth('kubernetes')
    expect(result).toBeNull()
  })
})

describe('HttpExternalDataFetcher GitHub token', () => {
  function requestInit(mockFetch: unknown): {
    headers: Record<string, string>
  } {
    return (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
  }

  it('omits the Authorization header when no token is configured', async () => {
    const mockFetch = makeFetch(200, { items: [] })
    await new HttpExternalDataFetcher(mockFetch).fetchGitHubHealth('kubernetes')
    expect(requestInit(mockFetch).headers).not.toHaveProperty('Authorization')
  })

  it('sends a Bearer token when one is configured', async () => {
    const mockFetch = makeFetch(200, { items: [] })
    const fetcher = new HttpExternalDataFetcher(mockFetch, {
      githubToken: 'ghp_secret',
    })
    await fetcher.fetchGitHubHealth('kubernetes')
    expect(requestInit(mockFetch).headers.Authorization).toBe('Bearer ghp_secret')
  })
})

describe('HttpExternalDataFetcher.fetchCVECount', () => {
  it('returns count from vulns array', async () => {
    const mockFetch = makeFetch(200, { vulns: [{}, {}, {}] })
    const fetcher = new HttpExternalDataFetcher(mockFetch)
    const result = await fetcher.fetchCVECount('log4j')
    expect(result).toBe(3)
  })

  it('returns 0 when vulns array is absent', async () => {
    const mockFetch = makeFetch(200, {})
    const fetcher = new HttpExternalDataFetcher(mockFetch)
    const result = await fetcher.fetchCVECount('some-safe-lib')
    expect(result).toBe(0)
  })

  it('returns null when response is not ok (500)', async () => {
    const mockFetch = makeFetch(500, {})
    const fetcher = new HttpExternalDataFetcher(mockFetch)
    const result = await fetcher.fetchCVECount('anything')
    expect(result).toBeNull()
  })

  it('returns null on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('timeout'))
    const fetcher = new HttpExternalDataFetcher(mockFetch as unknown as typeof globalThis.fetch)
    const result = await fetcher.fetchCVECount('anything')
    expect(result).toBeNull()
  })
})
