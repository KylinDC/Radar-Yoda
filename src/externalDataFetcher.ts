export interface GitHubHealth {
  stars: number
  lastCommitDaysAgo: number
  openIssues: number
}

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

export class HttpExternalDataFetcher implements ExternalDataFetcher {
  private readonly fetch: FetchFn

  constructor(fetchFn: FetchFn = globalThis.fetch) {
    this.fetch = fetchFn
  }

  async fetchGitHubHealth(name: string): Promise<GitHubHealth | null> {
    try {
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
      if (process.env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`

      const res = await this.fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(name)}+in:name&sort=stars&per_page=1`,
        { headers }
      )
      if (!res.ok) return null

      const data = (await res.json()) as { items?: Array<{ stargazers_count: number; open_issues_count: number; pushed_at: string }> }
      const repo = data.items?.[0]
      if (!repo) return null

      const lastCommitDaysAgo = Math.floor(
        (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24)
      )
      return { stars: repo.stargazers_count, lastCommitDaysAgo, openIssues: repo.open_issues_count }
    } catch {
      return null
    }
  }

  async fetchCVECount(name: string): Promise<number | null> {
    try {
      const res = await this.fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: { name } }),
      })
      if (!res.ok) return null

      const data = (await res.json()) as { vulns?: unknown[] }
      return data.vulns?.length ?? 0
    } catch {
      return null
    }
  }
}
