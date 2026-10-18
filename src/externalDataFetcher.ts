import type { GitHubHealth } from './types.js'

export type { GitHubHealth }

export interface ExternalDataFetcher {
  fetchGitHubHealth(name: string): Promise<GitHubHealth | null>
  fetchCVECount(name: string): Promise<number | null>
}

export class NullExternalDataFetcher implements ExternalDataFetcher {
  async fetchGitHubHealth(_name: string): Promise<GitHubHealth | null> {
    return null
  }
  async fetchCVECount(_name: string): Promise<number | null> {
    return null
  }
}

type FetchFn = typeof globalThis.fetch

export interface HttpExternalDataFetcherOptions {
  /**
   * Optional GitHub token. Read from `env.GITHUB_TOKEN` on Workers (set it with
   * `wrangler secret put GITHUB_TOKEN`); unauthenticated requests are rate
   * limited to 10 search calls per minute per IP.
   */
  githubToken?: string
}

export class HttpExternalDataFetcher implements ExternalDataFetcher {
  private readonly fetch: FetchFn
  private readonly githubToken: string | undefined

  constructor(fetchFn: FetchFn = globalThis.fetch, options: HttpExternalDataFetcherOptions = {}) {
    this.fetch = fetchFn
    this.githubToken = options.githubToken
  }

  async fetchGitHubHealth(name: string): Promise<GitHubHealth | null> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
      }
      if (this.githubToken) headers.Authorization = `Bearer ${this.githubToken}`

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await this.fetch(
          `https://api.github.com/search/repositories?q="${encodeURIComponent(name)}"+in:name&stars:>1000&sort=stars&per_page=1`,
          { headers, signal: controller.signal },
        )
        if (!res.ok) return null

        const data = (await res.json()) as {
          items?: Array<{
            stargazers_count: number
            open_issues_count: number
            pushed_at: string
          }>
        }
        const repo = data.items?.[0]
        if (!repo) return null

        const lastCommitDaysAgo = Math.floor(
          (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24),
        )
        return {
          stars: repo.stargazers_count,
          lastCommitDaysAgo,
          openIssues: repo.open_issues_count,
        }
      } finally {
        clearTimeout(timeoutId)
      }
    } catch {
      return null
    }
  }

  async fetchCVECount(name: string): Promise<number | null> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await this.fetch('https://api.osv.dev/v1/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package: { name } }),
          signal: controller.signal,
        })
        if (!res.ok) return null

        const data = (await res.json()) as { vulns?: unknown[] }
        return data.vulns?.length ?? 0
      } finally {
        clearTimeout(timeoutId)
      }
    } catch {
      return null
    }
  }
}
