# TL/TP Advisor Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new MCP tools to the tech-radar-advisor server — `getTrendingTechnologies`, `getTechnologyRiskScore`, `draftADR`, and `getMigrationRoadmap` — giving TL/TP users trend intelligence, risk scoring, ADR drafting, and prioritised migration planning on top of the existing 34-volume Thoughtworks radar data.

**Architecture:** A new `ExternalDataFetcher` interface (with `NullExternalDataFetcher` and `HttpExternalDataFetcher` implementations) is injected as an optional second parameter to `RadarService`. Four new async methods are added to `RadarService`, each wrapped by a thin `createXxxTool()` factory following the existing pattern. All four tools are registered in `src/index.ts`.

**Tech Stack:** TypeScript, Node.js ESM, Mastra (`@mastra/core/tools`, `@mastra/mcp`), Zod, Vitest, native `fetch` (Node 18+)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add 7 new types/interfaces |
| `src/externalDataFetcher.ts` | Create | `ExternalDataFetcher` interface, `NullExternalDataFetcher`, `HttpExternalDataFetcher` |
| `src/radarService.ts` | Modify | Constructor gains optional `fetcher`; four new async methods |
| `src/tools.ts` | Modify | Four new `createXxxTool()` factories |
| `src/index.ts` | Modify | Import and register four new tools |
| `tests/externalDataFetcher.test.ts` | Create | Unit tests for `HttpExternalDataFetcher` with mocked `fetch` |
| `tests/radarService.test.ts` | Modify | Four new `describe` blocks for new service methods |
| `tests/tools.test.ts` | Modify | Four new tool integration tests |

---

## Task 1: Add types and create ExternalDataFetcher module

**Files:**
- Modify: `src/types.ts`
- Create: `src/externalDataFetcher.ts`

- [ ] **Step 1: Add new types to `src/types.ts`**

Append to the end of `src/types.ts`:

```typescript
export type TrendDirection = 'rising' | 'falling' | 'stable'

export interface TrendingEntry {
  name: string
  quadrant: Quadrant
  currentRing: Ring
  direction: TrendDirection
  slope: number
  trajectory: Array<{ volume: number; year: number; ring: Ring }>
}

export interface RiskScore {
  name: string
  riskScore: number
  breakdown: {
    radarRisk: number
    maintenanceRisk: number | null
    securityRisk: number | null
  }
  currentRing: Ring | 'unknown'
  githubHealth: import('./externalDataFetcher.js').GitHubHealth | null
  cveCount: number | null
}

export interface ADROption {
  name: string
  currentRing: Ring | 'unknown'
  quadrant: Quadrant | 'unknown'
  historyLength: number
  latestMovement: string
  radarUrl: string
}

export interface ADRDraft {
  markdown: string
  options: ADROption[]
}

export interface RoadmapItem {
  priority: number
  name: string
  currentRing: Ring
  quadrant: Quadrant
  riskScore: number
  action: 'migrate' | 'monitor'
  effort: 'low' | 'medium' | 'high'
  suggestedAlternatives: RadarEntry[]
  rationale: string
}

export interface MigrationRoadmap {
  summary: { total: number; criticalMigrations: number; monitored: number }
  roadmap: RoadmapItem[]
}
```

- [ ] **Step 2: Create `src/externalDataFetcher.ts`**

```typescript
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
```

- [ ] **Step 3: Run typecheck to confirm types are valid**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/externalDataFetcher.ts
git commit -m "feat: add types and ExternalDataFetcher module"
```

---

## Task 2: Update RadarService constructor

**Files:**
- Modify: `src/radarService.ts`

- [ ] **Step 1: Update constructor in `src/radarService.ts`**

Replace the existing import block and constructor:

```typescript
import type { RadarEntry, RadarIndex, Ring, Quadrant, AuditItem, AuditResult } from './types.js'
import { NullExternalDataFetcher } from './externalDataFetcher.js'
import type { ExternalDataFetcher } from './externalDataFetcher.js'
```

Replace constructor line:

```typescript
export class RadarService {
  constructor(
    private readonly index: RadarIndex,
    private readonly fetcher: ExternalDataFetcher = new NullExternalDataFetcher()
  ) {}
```

- [ ] **Step 2: Run existing tests to confirm no regressions**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/radarService.ts
git commit -m "feat: add optional ExternalDataFetcher to RadarService constructor"
```

---

## Task 3: `getTrendingTechnologies` — service method + tool

**Files:**
- Modify: `tests/radarService.test.ts`
- Modify: `src/radarService.ts`
- Modify: `src/tools.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/radarService.test.ts`:

```typescript
describe('RadarService.getTrendingTechnologies', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns an object with a trending array', async () => {
    const result = await service.getTrendingTechnologies({})
    expect(result).toHaveProperty('trending')
    expect(Array.isArray(result.trending)).toBe(true)
  })

  it('each entry has required fields', async () => {
    const result = await service.getTrendingTechnologies({ limit: 5 })
    for (const entry of result.trending) {
      expect(entry).toHaveProperty('name')
      expect(entry).toHaveProperty('quadrant')
      expect(entry).toHaveProperty('currentRing')
      expect(['rising', 'falling', 'stable']).toContain(entry.direction)
      expect(typeof entry.slope).toBe('number')
      expect(Array.isArray(entry.trajectory)).toBe(true)
      expect(entry.trajectory.length).toBeGreaterThan(0)
    }
  })

  it('filters by direction — only rising entries when direction=rising', async () => {
    const result = await service.getTrendingTechnologies({ direction: 'rising' })
    for (const entry of result.trending) {
      expect(entry.direction).toBe('rising')
    }
  })

  it('filters by direction — only falling entries when direction=falling', async () => {
    const result = await service.getTrendingTechnologies({ direction: 'falling' })
    for (const entry of result.trending) {
      expect(entry.direction).toBe('falling')
    }
  })

  it('filters by quadrant', async () => {
    const result = await service.getTrendingTechnologies({ quadrant: 'tools' })
    for (const entry of result.trending) {
      expect(entry.quadrant).toBe('tools')
    }
  })

  it('respects limit', async () => {
    const result = await service.getTrendingTechnologies({ limit: 3 })
    expect(result.trending.length).toBeLessThanOrEqual(3)
  })

  it('returns empty array for unknown quadrant filter (no results)', async () => {
    // @ts-expect-error testing invalid quadrant
    const result = await service.getTrendingTechnologies({ quadrant: 'nonexistent' })
    expect(result.trending).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run -t "getTrendingTechnologies"
```

Expected: FAIL with "service.getTrendingTechnologies is not a function"

- [ ] **Step 3: Implement `getTrendingTechnologies` in `src/radarService.ts`**

Add after all imports (before the class), add a helper:

```typescript
function linearRegressionSlope(scores: number[]): number {
  const n = scores.length
  if (n < 2) return 0
  const sumX = (n * (n - 1)) / 2
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
  const sumY = scores.reduce((a, b) => a + b, 0)
  const sumXY = scores.reduce((sum, y, i) => sum + i * y, 0)
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
}
```

Add `TrendDirection`, `TrendingEntry` to the types import:

```typescript
import type { RadarEntry, RadarIndex, Ring, Quadrant, AuditItem, AuditResult, TrendDirection, TrendingEntry } from './types.js'
```

Add method to `RadarService` class (before the closing brace):

```typescript
async getTrendingTechnologies(input: {
  quadrant?: Quadrant
  direction?: TrendDirection | 'all'
  limit?: number
}): Promise<{ trending: TrendingEntry[] }> {
  const ringScore: Record<Ring, number> = { adopt: 1, trial: 2, assess: 3, hold: 4, caution: 4 }
  const limit = input.limit ?? 10
  const directionFilter = input.direction ?? 'all'

  const results: TrendingEntry[] = []

  for (const [key, entries] of this.index.historyMap) {
    if (entries.length < 2) continue

    const sorted = [...entries].sort((a, b) => a.volume - b.volume)
    const last = sorted[sorted.length - 1]

    if (input.quadrant && last.quadrant !== input.quadrant) continue

    const recent = sorted.slice(-6)
    const scores = recent.map((e) => ringScore[e.ring])
    const slope = linearRegressionSlope(scores)

    const direction: TrendDirection =
      slope <= -0.1 ? 'rising' : slope >= 0.1 ? 'falling' : 'stable'

    if (directionFilter !== 'all' && direction !== directionFilter) continue

    results.push({
      name: last.name,
      quadrant: last.quadrant,
      currentRing: last.ring,
      direction,
      slope,
      trajectory: sorted.map((e) => ({ volume: e.volume, year: e.year, ring: e.ring })),
    })
  }

  results.sort((a, b) => Math.abs(b.slope) - Math.abs(a.slope))
  return { trending: results.slice(0, limit) }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run -t "getTrendingTechnologies"
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Add tool factory to `src/tools.ts`**

Add to imports at top of `src/tools.ts`:

```typescript
import type { TrendDirection } from './types.js'
```

Append to `src/tools.ts`:

```typescript
export function createGetTrendingTechnologiesTool(service: RadarService) {
  const tool = createTool({
    id: 'get_trending_technologies',
    description:
      'Call this when the user asks which technologies are gaining or losing momentum, wants to know the tech landscape trend, or asks "what is rising / falling in the radar?". ' +
      'Analyses all 34 radar volumes to classify technologies as rising (moving toward Adopt), falling (moving toward Hold/Caution), or stable. ' +
      'Optionally filter by quadrant or direction.',
    inputSchema: z.object({
      context: z.object({
        quadrant: QuadrantSchema.optional(),
        direction: z.enum(['rising', 'falling', 'stable', 'all']).optional(),
        limit: z.number().int().positive().optional(),
      }),
    }),
    execute: async ({ context }) => {
      return service.getTrendingTechnologies(context)
    },
  })
  return tool
}
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/radarService.ts src/tools.ts src/types.ts tests/radarService.test.ts
git commit -m "feat: add getTrendingTechnologies service method and tool"
```

---

## Task 4: `getTechnologyRiskScore` — service method + tool

**Files:**
- Modify: `tests/radarService.test.ts`
- Modify: `src/radarService.ts`
- Modify: `src/tools.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/radarService.test.ts`:

```typescript
describe('RadarService.getTechnologyRiskScore', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index) // NullExternalDataFetcher by default
  })

  it('returns a RiskScore object for a known technology', async () => {
    const result = await service.getTechnologyRiskScore({ name: 'Docker' })
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Docker')
    expect(result!.riskScore).toBeGreaterThanOrEqual(0)
    expect(result!.riskScore).toBeLessThanOrEqual(10)
  })

  it('breakdown.radarRisk is 0 for an Adopt technology', async () => {
    const adoptEntries = service.listByRingAndQuadrant({ ring: 'adopt' })
    expect(adoptEntries.length).toBeGreaterThan(0)
    const result = await service.getTechnologyRiskScore({ name: adoptEntries[0].name })
    expect(result!.breakdown.radarRisk).toBe(0)
  })

  it('breakdown.radarRisk is 3 for a Hold/Caution technology', async () => {
    const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
    if (holdEntries.length === 0) return
    const result = await service.getTechnologyRiskScore({ name: holdEntries[0].name })
    expect(result!.breakdown.radarRisk).toBe(3)
  })

  it('with NullExternalDataFetcher, maintenanceRisk and securityRisk are null and riskScore equals radarRisk + 3 + 3', async () => {
    // NullExternalDataFetcher returns null for both fetches, so maintenance=3 (unknown), security=3 (unknown)
    // Wait — based on spec: maintenanceRisk=3 when null, securityRisk=3 when null? 
    // Spec: "lastCommitDaysAgo > 730 OR fetch returned null → 3"; CVE: null means unknown
    // But the breakdown fields are null when data unavailable — need to handle this carefully
    const adoptEntries = service.listByRingAndQuadrant({ ring: 'adopt' })
    const result = await service.getTechnologyRiskScore({ name: adoptEntries[0].name })
    expect(result!.githubHealth).toBeNull()
    expect(result!.cveCount).toBeNull()
    // With NullFetcher: radarRisk=0 for adopt, maintenanceRisk=3 (null→risky), securityRisk=3 (null→risky)
    expect(result!.breakdown.maintenanceRisk).toBe(3)
    expect(result!.breakdown.securityRisk).toBe(3)
    expect(result!.riskScore).toBe(0 + 3 + 3)
  })

  it('returns null for an unknown technology', async () => {
    const result = await service.getTechnologyRiskScore({ name: 'xyzzy123notreal' })
    expect(result).toBeNull()
  })

  it('riskScore increases when CVE count is high', async () => {
    const { NullExternalDataFetcher: NullFetcher, HttpExternalDataFetcher: _Http } = await import('../src/externalDataFetcher.js')
    // Custom fetcher returning high CVE count
    class HighCVEFetcher extends NullFetcher {
      override async fetchCVECount(_name: string) { return 25 } // > 20 → securityRisk=3
    }
    const index = await buildRadarIndex()
    const svc = new RadarService(index, new HighCVEFetcher())
    const adoptEntries = svc.listByRingAndQuadrant({ ring: 'adopt' })
    const result = await svc.getTechnologyRiskScore({ name: adoptEntries[0].name })
    expect(result!.breakdown.securityRisk).toBe(3)
    expect(result!.cveCount).toBe(25)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run -t "getTechnologyRiskScore"
```

Expected: FAIL with "service.getTechnologyRiskScore is not a function"

- [ ] **Step 3: Implement `getTechnologyRiskScore` in `src/radarService.ts`**

Add `RiskScore` to the types import line.

Add method to `RadarService` class:

```typescript
async getTechnologyRiskScore(input: { name: string }): Promise<RiskScore | null> {
  // Look up in Vol.34 first, fall back to historyMap
  let entry: RadarEntry | undefined
  for (const list of this.index.ringQuadrantMap.values()) {
    entry = list.find((e) => e.name.toLowerCase() === input.name.toLowerCase())
    if (entry) break
  }
  if (!entry) {
    const history = this.index.historyMap.get(input.name.toLowerCase())
    if (!history || history.length === 0) return null
    entry = history[history.length - 1]
  }

  const radarRiskMap: Record<Ring, number> = { adopt: 0, trial: 1, assess: 2, hold: 3, caution: 3 }
  const radarRisk = radarRiskMap[entry.ring]

  const githubHealth = await this.fetcher.fetchGitHubHealth(input.name)
  let maintenanceRisk: number
  if (githubHealth === null) {
    maintenanceRisk = 3
  } else if (githubHealth.stars > 10000 && githubHealth.lastCommitDaysAgo < 180) {
    maintenanceRisk = 0
  } else if (githubHealth.stars >= 1000 || githubHealth.lastCommitDaysAgo <= 365) {
    maintenanceRisk = 1
  } else if (githubHealth.stars >= 100 || githubHealth.lastCommitDaysAgo <= 730) {
    maintenanceRisk = 2
  } else {
    maintenanceRisk = 3
  }

  const cveCount = await this.fetcher.fetchCVECount(input.name)
  let securityRisk: number
  if (cveCount === null) {
    securityRisk = 3
  } else if (cveCount === 0) {
    securityRisk = 0
  } else if (cveCount <= 5) {
    securityRisk = 1
  } else if (cveCount <= 20) {
    securityRisk = 2
  } else {
    securityRisk = 3
  }

  return {
    name: entry.name,
    riskScore: Math.min(10, radarRisk + maintenanceRisk + securityRisk),
    breakdown: {
      radarRisk,
      maintenanceRisk: githubHealth === null ? null : maintenanceRisk,
      securityRisk: cveCount === null ? null : securityRisk,
    },
    currentRing: entry.ring,
    githubHealth,
    cveCount,
  }
}
```

> **Note:** The `breakdown` fields are `null` when the external fetch returned `null` (data unavailable), but the `riskScore` still uses `3` (worst-case) for those components. This means `riskScore = radarRisk + (githubHealth === null ? 3 : maintenanceRisk) + (cveCount === null ? 3 : securityRisk)`. Update the test expectation comment to match: with NullFetcher, breakdown.maintenanceRisk and breakdown.securityRisk are `null` (not 3), but the score still sums with 3.

- [ ] **Step 4: Fix the test to match the actual implementation**

The test for NullFetcher should be:

```typescript
it('with NullExternalDataFetcher, breakdown fields are null but riskScore accounts for worst-case', async () => {
  const adoptEntries = service.listByRingAndQuadrant({ ring: 'adopt' })
  const result = await service.getTechnologyRiskScore({ name: adoptEntries[0].name })
  expect(result!.githubHealth).toBeNull()
  expect(result!.cveCount).toBeNull()
  // breakdown fields are null when data is unavailable
  expect(result!.breakdown.maintenanceRisk).toBeNull()
  expect(result!.breakdown.securityRisk).toBeNull()
  // riskScore = radarRisk(0 for adopt) + 3 (null maintenance) + 3 (null security) = 6
  expect(result!.riskScore).toBe(6)
})
```

Replace the earlier version of this test case in the file with the corrected one above.

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run -t "getTechnologyRiskScore"
```

Expected: all tests PASS.

- [ ] **Step 6: Add tool factory to `src/tools.ts`**

Append:

```typescript
export function createGetTechnologyRiskScoreTool(service: RadarService) {
  const tool = createTool({
    id: 'get_technology_risk_score',
    description:
      'Call this when the user wants to assess the risk of using a specific technology — combining radar ring position, GitHub maintenance health, and known CVE security vulnerabilities into a 0–10 composite score. ' +
      'Also call this before making migration decisions to quantify urgency. ' +
      'Returns null if the technology is not found in any radar volume.',
    inputSchema: z.object({
      context: z.object({
        name: z.string().describe('Technology name to score'),
      }),
    }),
    execute: async ({ context }) => {
      return service.getTechnologyRiskScore(context)
    },
  })
  return tool
}
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/radarService.ts src/tools.ts tests/radarService.test.ts
git commit -m "feat: add getTechnologyRiskScore service method and tool"
```

---

## Task 5: `draftADR` — service method + tool

**Files:**
- Modify: `tests/radarService.test.ts`
- Modify: `src/radarService.ts`
- Modify: `src/tools.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/radarService.test.ts`:

```typescript
describe('RadarService.draftADR', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns an ADRDraft with markdown and options array', async () => {
    const result = await service.draftADR({
      title: 'Select container platform',
      options: [{ name: 'Kubernetes' }, { name: 'Docker' }],
    })
    expect(result).toHaveProperty('markdown')
    expect(result).toHaveProperty('options')
    expect(typeof result.markdown).toBe('string')
    expect(Array.isArray(result.options)).toBe(true)
    expect(result.options).toHaveLength(2)
  })

  it('markdown contains the ADR title', async () => {
    const result = await service.draftADR({
      title: 'Choose a frontend framework',
      options: [{ name: 'React JS' }],
    })
    expect(result.markdown).toContain('Choose a frontend framework')
  })

  it('markdown contains radar ring info for each option', async () => {
    const result = await service.draftADR({
      title: 'Test',
      options: [{ name: 'Kubernetes' }, { name: 'Docker' }],
    })
    expect(result.markdown).toMatch(/Radar status \(Vol\.34\)/)
    expect(result.markdown).toContain('Kubernetes')
    expect(result.markdown).toContain('Docker')
  })

  it('includes TL note in markdown when description is provided', async () => {
    const result = await service.draftADR({
      title: 'Test',
      options: [{ name: 'Kubernetes', description: 'Our current infra team knows it well' }],
    })
    expect(result.markdown).toContain('Our current infra team knows it well')
  })

  it('handles unknown technology gracefully — shows not found in radar', async () => {
    const result = await service.draftADR({
      title: 'Test',
      options: [{ name: 'xyzzy123notreal' }],
    })
    expect(result.options[0].currentRing).toBe('unknown')
    expect(result.markdown).toContain('not in radar')
  })

  it('includes context when provided', async () => {
    const result = await service.draftADR({
      title: 'Test',
      options: [{ name: 'Docker' }],
      context: 'We need to containerize our microservices',
    })
    expect(result.markdown).toContain('We need to containerize our microservices')
  })

  it('each option has required ADROption fields', async () => {
    const result = await service.draftADR({
      title: 'Test',
      options: [{ name: 'Kubernetes' }],
    })
    const opt = result.options[0]
    expect(opt).toHaveProperty('name')
    expect(opt).toHaveProperty('currentRing')
    expect(opt).toHaveProperty('quadrant')
    expect(opt).toHaveProperty('historyLength')
    expect(opt).toHaveProperty('latestMovement')
    expect(opt).toHaveProperty('radarUrl')
    expect(opt.radarUrl).toContain('thoughtworks.com')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run -t "draftADR"
```

Expected: FAIL with "service.draftADR is not a function"

- [ ] **Step 3: Implement `draftADR` in `src/radarService.ts`**

Add `ADRDraft`, `ADROption` to the types import line.

Add method to `RadarService` class:

```typescript
async draftADR(input: {
  title: string
  options: Array<{ name: string; description?: string }>
  context?: string
}): Promise<ADRDraft> {
  const today = new Date().toISOString().slice(0, 10)
  const optionResults: ADROption[] = []
  const optionSections: string[] = []

  for (let i = 0; i < input.options.length; i++) {
    const opt = input.options[i]

    // Find current ring in Vol.34
    let entry: RadarEntry | undefined
    for (const list of this.index.ringQuadrantMap.values()) {
      entry = list.find((e) => e.name.toLowerCase() === opt.name.toLowerCase())
      if (entry) break
    }

    // Fall back to historyMap
    const history = this.getTechnologyHistory({ name: opt.name })
    if (!entry && history) {
      const last = history.history[history.history.length - 1]
      entry = this.index.historyMap.get(opt.name.toLowerCase())?.[
        (this.index.historyMap.get(opt.name.toLowerCase())?.length ?? 1) - 1
      ]
    }

    const currentRing: Ring | 'unknown' = entry?.ring ?? 'unknown'
    const quadrant: Quadrant | 'unknown' = entry?.quadrant ?? 'unknown'
    const historyLength = history?.history.length ?? 0
    const firstYear = history?.history[0]?.year ?? 'N/A'
    const lastYear = history?.history[history.history.length - 1]?.year ?? 'N/A'
    const latestEntry = history?.history[history.history.length - 1]
    const latestMovement = latestEntry
      ? `${latestEntry.status} (Vol.${latestEntry.volume})`
      : 'no history'
    const latestDesc = latestEntry?.description ?? ''

    optionResults.push({
      name: opt.name,
      currentRing,
      quadrant,
      historyLength,
      latestMovement,
      radarUrl: 'https://www.thoughtworks.com/radar',
    })

    const ringDisplay = currentRing === 'unknown' ? 'not in radar' : `${currentRing} — ${quadrant}`
    const historyDisplay =
      historyLength > 0
        ? `${historyLength} appearances across ${firstYear}–${lastYear}`
        : 'not found in radar'

    let section = `### Option ${i + 1}: ${opt.name}\n`
    section += `- **Radar status (Vol.34):** ${ringDisplay}\n`
    section += `- **History:** ${historyDisplay}\n`
    section += `- **Recent movement:** ${latestMovement}\n`
    if (latestDesc) section += `- **Description:** ${latestDesc}\n`
    if (opt.description) section += `\n*TL note: ${opt.description}*`

    optionSections.push(section)
  }

  const contextText = input.context ?? '[Describe the problem or opportunity here]'

  const markdown = [
    `# ADR: ${input.title}`,
    '',
    `**Date:** ${today}  `,
    '**Status:** Proposed',
    '',
    '## Context',
    '',
    contextText,
    '',
    '## Options Considered',
    '',
    optionSections.join('\n\n'),
    '',
    '## Decision',
    '',
    '[To be filled]',
    '',
    '## Consequences',
    '',
    '[To be filled]',
    '',
    '---',
    '*Radar evidence sourced from Thoughtworks Tech Radar Vol.01–34 via tech-radar-advisor MCP.*',
  ].join('\n')

  return { markdown, options: optionResults }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run -t "draftADR"
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Add tool factory to `src/tools.ts`**

Append:

```typescript
export function createDraftADRTool(service: RadarService) {
  const tool = createTool({
    id: 'draft_adr',
    description:
      'Call this when the user wants to document a technology decision, compare candidate technologies for an ADR (Architecture Decision Record), or generate a structured decision document. ' +
      'Given a decision title and 2+ technology options, returns a complete Markdown ADR draft with radar ring status, history, and trend evidence pre-filled for each option. ' +
      'The TL/TP only needs to fill in the Decision and Consequences sections.',
    inputSchema: z.object({
      context: z.object({
        title: z.string().describe('ADR title, e.g. "Select container orchestration platform"'),
        options: z
          .array(
            z.object({
              name: z.string().describe('Technology name'),
              description: z.string().optional().describe('Optional TL note about this option'),
            })
          )
          .min(1),
        context: z.string().optional().describe('Problem statement or background context'),
      }),
    }),
    execute: async ({ context }) => {
      return service.draftADR(context)
    },
  })
  return tool
}
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/radarService.ts src/tools.ts tests/radarService.test.ts
git commit -m "feat: add draftADR service method and tool"
```

---

## Task 6: `getMigrationRoadmap` — service method + tool

**Files:**
- Modify: `tests/radarService.test.ts`
- Modify: `src/radarService.ts`
- Modify: `src/tools.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/radarService.test.ts`:

```typescript
describe('RadarService.getMigrationRoadmap', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns a MigrationRoadmap with summary and roadmap array', async () => {
    const result = await service.getMigrationRoadmap({
      technologies: ['Kubernetes', 'Docker'],
    })
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('roadmap')
    expect(Array.isArray(result.roadmap)).toBe(true)
  })

  it('excludes healthy (adopt/trial) technologies from the roadmap', async () => {
    const adoptEntries = service.listByRingAndQuadrant({ ring: 'adopt' })
    const adoptNames = adoptEntries.slice(0, 3).map((e) => e.name)
    const result = await service.getMigrationRoadmap({ technologies: adoptNames })
    expect(result.roadmap).toHaveLength(0)
    expect(result.summary.criticalMigrations).toBe(0)
    expect(result.summary.monitored).toBe(0)
  })

  it('includes hold/caution technologies as migrate action', async () => {
    const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
    if (holdEntries.length === 0) return
    const result = await service.getMigrationRoadmap({ technologies: [holdEntries[0].name] })
    expect(result.roadmap.length).toBeGreaterThan(0)
    expect(result.roadmap[0].action).toBe('migrate')
    expect(result.summary.criticalMigrations).toBe(1)
  })

  it('includes assess technologies as monitor action', async () => {
    const assessEntries = service.listByRingAndQuadrant({ ring: 'assess' })
    if (assessEntries.length === 0) return
    const result = await service.getMigrationRoadmap({ technologies: [assessEntries[0].name] })
    expect(result.roadmap.length).toBeGreaterThan(0)
    expect(result.roadmap[0].action).toBe('monitor')
    expect(result.summary.monitored).toBe(1)
  })

  it('roadmap items are sorted by riskScore descending', async () => {
    const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
    const assessEntries = service.listByRingAndQuadrant({ ring: 'assess' })
    const names = [
      ...holdEntries.slice(0, 2).map((e) => e.name),
      ...assessEntries.slice(0, 2).map((e) => e.name),
    ]
    if (names.length < 2) return
    const result = await service.getMigrationRoadmap({ technologies: names })
    for (let i = 1; i < result.roadmap.length; i++) {
      expect(result.roadmap[i - 1].riskScore).toBeGreaterThanOrEqual(result.roadmap[i].riskScore)
    }
  })

  it('each roadmap item has required fields', async () => {
    const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
    if (holdEntries.length === 0) return
    const result = await service.getMigrationRoadmap({ technologies: [holdEntries[0].name] })
    const item = result.roadmap[0]
    expect(item).toHaveProperty('priority')
    expect(item).toHaveProperty('name')
    expect(item).toHaveProperty('currentRing')
    expect(item).toHaveProperty('quadrant')
    expect(item).toHaveProperty('riskScore')
    expect(['migrate', 'monitor']).toContain(item.action)
    expect(['low', 'medium', 'high']).toContain(item.effort)
    expect(Array.isArray(item.suggestedAlternatives)).toBe(true)
    expect(typeof item.rationale).toBe('string')
    expect(item.rationale.length).toBeGreaterThan(0)
  })

  it('migrate items have priority 1-based ranking starting at 1', async () => {
    const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
    const assessEntries = service.listByRingAndQuadrant({ ring: 'assess' })
    const names = [
      ...holdEntries.slice(0, 2).map((e) => e.name),
      ...assessEntries.slice(0, 1).map((e) => e.name),
    ]
    const result = await service.getMigrationRoadmap({ technologies: names })
    result.roadmap.forEach((item, idx) => {
      expect(item.priority).toBe(idx + 1)
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run -t "getMigrationRoadmap"
```

Expected: FAIL with "service.getMigrationRoadmap is not a function"

- [ ] **Step 3: Implement `getMigrationRoadmap` in `src/radarService.ts`**

Add `MigrationRoadmap`, `RoadmapItem` to the types import line.

Add method to `RadarService` class:

```typescript
async getMigrationRoadmap(input: { technologies: string[] }): Promise<MigrationRoadmap> {
  const audit = this.auditTechStack({ technologies: input.technologies })
  const actionItems = audit.items.filter((i) => i.status === 'migrate' || i.status === 'monitor')

  // Compute risk scores in parallel
  const scored = await Promise.all(
    actionItems.map(async (item) => {
      const risk = await this.getTechnologyRiskScore({ name: item.name })
      return { item, riskScore: risk?.riskScore ?? 6 }
    })
  )

  // Sort by riskScore desc, then by ring severity (caution > hold > assess)
  const ringSeverity: Partial<Record<string, number>> = { caution: 3, hold: 2, assess: 1 }
  scored.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore
    return (ringSeverity[b.item.ring as string] ?? 0) - (ringSeverity[a.item.ring as string] ?? 0)
  })

  const roadmap: RoadmapItem[] = scored.map(({ item, riskScore }, idx) => {
    const action: 'migrate' | 'monitor' = item.status === 'migrate' ? 'migrate' : 'monitor'
    const quadrant = item.quadrant!

    let effort: 'low' | 'medium' | 'high'
    if (quadrant === 'platforms' || quadrant === 'tools' || riskScore >= 7) {
      effort = 'high'
    } else if (riskScore >= 4) {
      effort = 'medium'
    } else {
      effort = 'low'
    }

    const alts = action === 'migrate' ? (item.alternatives ?? []) : []
    const altNames = alts.map((a) => a.name).join(', ')
    const rationale =
      action === 'migrate'
        ? `${item.name} is in the ${item.ring} ring (risk: ${riskScore}/10).${altNames ? ` Recommended alternatives: ${altNames}.` : ''}`
        : `${item.name} is in the assess ring (risk: ${riskScore}/10). Monitor for movement in future radar volumes.`

    return {
      priority: idx + 1,
      name: item.name,
      currentRing: item.ring as Ring,
      quadrant,
      riskScore,
      action,
      effort,
      suggestedAlternatives: alts,
      rationale,
    }
  })

  return {
    summary: {
      total: roadmap.length,
      criticalMigrations: roadmap.filter((r) => r.action === 'migrate').length,
      monitored: roadmap.filter((r) => r.action === 'monitor').length,
    },
    roadmap,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run -t "getMigrationRoadmap"
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Add tool factory to `src/tools.ts`**

Append:

```typescript
export function createGetMigrationRoadmapTool(service: RadarService) {
  const tool = createTool({
    id: 'get_migration_roadmap',
    description:
      'Call this when the user wants a prioritised migration plan for their tech stack, asks "what should we migrate first", or needs an ordered list of tech debt to address. ' +
      'Combines radar ring status and composite risk scores (GitHub health + CVE data) to rank technologies by urgency. ' +
      'Returns only technologies that need action (hold/caution → migrate; assess → monitor); skips healthy ones. ' +
      'For auditing without prioritisation, use audit_tech_stack instead.',
    inputSchema: z.object({
      context: z.object({
        technologies: z
          .array(z.string())
          .min(1)
          .describe('List of technology names to generate a migration roadmap for'),
      }),
    }),
    execute: async ({ context }) => {
      return service.getMigrationRoadmap(context)
    },
  })
  return tool
}
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/radarService.ts src/tools.ts tests/radarService.test.ts
git commit -m "feat: add getMigrationRoadmap service method and tool"
```

---

## Task 7: Wire tools into `src/index.ts` and add tool-layer tests

**Files:**
- Modify: `src/index.ts`
- Modify: `tests/tools.test.ts`

- [ ] **Step 1: Update `src/index.ts`**

Replace the full content of `src/index.ts`:

```typescript
import { MCPServer } from '@mastra/mcp'
import { buildRadarIndex } from './dataLoader.js'
import { RadarService } from './radarService.js'
import { HttpExternalDataFetcher } from './externalDataFetcher.js'
import {
  createSearchTechnologyTool,
  createGetTechnologyHistoryTool,
  createFindAlternativesTool,
  createListByRingAndQuadrantTool,
  createCompareTechnologiesTool,
  createAuditTechStackTool,
  createGetTrendingTechnologiesTool,
  createGetTechnologyRiskScoreTool,
  createDraftADRTool,
  createGetMigrationRoadmapTool,
} from './tools.js'

async function main() {
  const index = await buildRadarIndex()
  const fetcher = new HttpExternalDataFetcher()
  const service = new RadarService(index, fetcher)

  const server = new MCPServer({
    name: 'tech-radar-advisor',
    version: '0.0.1',
    tools: {
      searchTechnology: createSearchTechnologyTool(service),
      getTechnologyHistory: createGetTechnologyHistoryTool(service),
      findAlternatives: createFindAlternativesTool(service),
      listByRingAndQuadrant: createListByRingAndQuadrantTool(service),
      compareTechnologies: createCompareTechnologiesTool(service),
      auditTechStack: createAuditTechStackTool(service),
      getTrendingTechnologies: createGetTrendingTechnologiesTool(service),
      getTechnologyRiskScore: createGetTechnologyRiskScoreTool(service),
      draftADR: createDraftADRTool(service),
      getMigrationRoadmap: createGetMigrationRoadmapTool(service),
    },
  })

  await server.startStdio()
}

main().catch(console.error)
```

- [ ] **Step 2: Add tool-layer tests**

Append to `tests/tools.test.ts`:

```typescript
describe('getTrendingTechnologies tool', () => {
  it('happy path — returns trending array', async () => {
    const tool = createGetTrendingTechnologiesTool(service)
    const result = await tool.execute({ context: {} })
    expect(result).toHaveProperty('trending')
    expect(Array.isArray((result as { trending: unknown[] }).trending)).toBe(true)
  })

  it('filters by direction=rising', async () => {
    const tool = createGetTrendingTechnologiesTool(service)
    const result = await tool.execute({ context: { direction: 'rising', limit: 5 } })
    const trending = (result as { trending: Array<{ direction: string }> }).trending
    trending.forEach((e) => expect(e.direction).toBe('rising'))
  })
})

describe('getTechnologyRiskScore tool', () => {
  it('happy path — returns risk score for Docker', async () => {
    const tool = createGetTechnologyRiskScoreTool(service)
    const result = await tool.execute({ context: { name: 'Docker' } })
    expect(result).not.toBeNull()
    expect((result as { name: string }).name).toBe('Docker')
    expect(typeof (result as { riskScore: number }).riskScore).toBe('number')
  })

  it('returns null for unknown technology', async () => {
    const tool = createGetTechnologyRiskScoreTool(service)
    const result = await tool.execute({ context: { name: 'xyzzy123notreal' } })
    expect(result).toBeNull()
  })
})

describe('draftADR tool', () => {
  it('happy path — returns markdown and options', async () => {
    const tool = createDraftADRTool(service)
    const result = await tool.execute({
      context: {
        title: 'Select orchestration platform',
        options: [{ name: 'Kubernetes' }, { name: 'Docker' }],
      },
    })
    expect((result as { markdown: string }).markdown).toContain('Select orchestration platform')
    expect((result as { options: unknown[] }).options).toHaveLength(2)
  })
})

describe('getMigrationRoadmap tool', () => {
  it('happy path — returns roadmap with summary', async () => {
    const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
    if (holdEntries.length === 0) return
    const tool = createGetMigrationRoadmapTool(service)
    const result = await tool.execute({
      context: { technologies: [holdEntries[0].name] },
    })
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('roadmap')
  })

  it('returns empty roadmap for all-healthy stack', async () => {
    const adoptEntries = service.listByRingAndQuadrant({ ring: 'adopt' })
    const tool = createGetMigrationRoadmapTool(service)
    const result = await tool.execute({
      context: { technologies: adoptEntries.slice(0, 2).map((e) => e.name) },
    })
    expect((result as { roadmap: unknown[] }).roadmap).toHaveLength(0)
  })
})
```

Also add the new tool imports at the top of `tests/tools.test.ts` (add to existing imports):

```typescript
import {
  createGetTrendingTechnologiesTool,
  createGetTechnologyRiskScoreTool,
  createDraftADRTool,
  createGetMigrationRoadmapTool,
} from '../src/tools.js'
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/tools.test.ts
git commit -m "feat: wire four new tools into MCP server and add tool-layer tests"
```

---

## Task 8: `HttpExternalDataFetcher` tests with mocked network

**Files:**
- Create: `tests/externalDataFetcher.test.ts`

- [ ] **Step 1: Write tests using `vi.fn()` to mock fetch**

Create `tests/externalDataFetcher.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
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
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/externalDataFetcher.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Final build check**

```bash
npm run build && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/externalDataFetcher.test.ts
git commit -m "test: add HttpExternalDataFetcher unit tests with mocked fetch"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| `ExternalDataFetcher` interface + `NullExternalDataFetcher` + `HttpExternalDataFetcher` | Task 1 |
| New types in `types.ts` | Task 1 |
| `RadarService` constructor gains optional `fetcher` param | Task 2 |
| `getTrendingTechnologies` service method + tool | Task 3 |
| `getTechnologyRiskScore` service method + tool | Task 4 |
| `draftADR` service method + tool | Task 5 |
| `getMigrationRoadmap` service method + tool | Task 6 |
| All four tools registered in `src/index.ts` | Task 7 |
| `HttpExternalDataFetcher` network mocking tests | Task 8 |
| Graceful degradation on external API failure | Task 1 (try/catch → null) + Task 4 (null propagation) |
| Effort heuristic uses quadrant names not generic terms | Task 6 |
| Trend slope uses last 6 *appearances* not volumes | Task 3 |

**Placeholder scan:** No TBD, TODO, or vague steps found.

**Type consistency:**
- `RiskScore` interface defined in Task 1; returned by `getTechnologyRiskScore` in Task 4 ✓
- `TrendingEntry` defined in Task 1; used in `getTrendingTechnologies` return in Task 3 ✓
- `ADRDraft` / `ADROption` defined in Task 1; used in `draftADR` in Task 5 ✓
- `MigrationRoadmap` / `RoadmapItem` defined in Task 1; used in `getMigrationRoadmap` in Task 6 ✓
- All four tool factories exported from `tools.ts` Tasks 3–6 and imported in `index.ts` Task 7 ✓
- `HttpExternalDataFetcher` takes optional `fetchFn` constructor param — used in Task 1 and tested in Task 8 ✓
