# TL/TP Tech Advisor — Four New MCP Tools Design Spec

**Date:** 2026-06-11  
**Status:** Implemented  
**Author:** KylinDC

---

## Background

The existing MCP server exposes six tools backed by 34 volumes of Thoughtworks Tech Radar data. These cover search, history, alternatives, listing, stack audit, and head-to-head comparison.

A TL or TP acting as a tech advisor needs three additional capabilities not yet covered:

1. **Trend intelligence** — proactively knowing which technologies are rising or falling across radar volumes, without manually comparing entries
2. **Decision documentation** — generating ADR drafts with radar evidence already embedded, so TLs spend time deciding, not documenting
3. **Prioritised migration planning** — converting an audit result into an ordered roadmap that accounts for both radar severity and real-world health signals (GitHub activity, known CVEs)

The fourth tool (`getTechnologyRiskScore`) is a prerequisite enrichment primitive that the roadmap tool depends on, and is also useful standalone.

---

## Goals

- Add four new MCP tools following existing patterns (`createTool` factory → thin wrapper → `RadarService` method)
- Introduce an `ExternalDataFetcher` helper for GitHub and OSV.dev calls, with full graceful degradation (external failures return `null`, never break the primary response)
- All new tool outputs are structured JSON; Markdown ADR text is returned as a string field, not raw output
- No changes to existing tool interfaces or `RadarIndex` structure

---

## Architecture

```
DataLoader → RadarIndex ← RadarService ← MCP Tools (src/index.ts)
                              ↑
                    ExternalDataFetcher        ← new
                    (GitHub API, OSV.dev)
```

### New files

| File | Purpose |
|------|---------|
| `src/externalDataFetcher.ts` | Async helpers for GitHub stats and OSV CVE count; injectable via constructor for testing |

### Modified files

| File | Changes |
|------|---------|
| `src/types.ts` | New types: `GitHubHealth`, `TrendDirection`, `TrendingEntry`, `RiskScore`, `ADRDraft`, `ADROption`, `MigrationRoadmap`, `RoadmapItem` |
| `src/radarService.ts` | Constructor gains optional second parameter `fetcher: ExternalDataFetcher` (defaults to `NullExternalDataFetcher`); four new async methods |
| `src/tools.ts` | Four new `createXxxTool()` factory functions |
| `src/index.ts` | Wire new tools into `MCPServer` |

---

## ExternalDataFetcher

```typescript
// src/externalDataFetcher.ts
export interface ExternalDataFetcher {
  fetchGitHubHealth(name: string): Promise<GitHubHealth | null>
  fetchCVECount(name: string): Promise<number | null>
}
```

`GitHubHealth` is defined in `src/types.ts` (not `externalDataFetcher.ts`) since it is a shared data type used by `RiskScore`.

**Implementation notes:**
- GitHub: `GET https://api.github.com/search/repositories?q="{name}"+in:name&stars:>1000&sort=stars&per_page=1` — quote the name and filter to repos with >1000 stars to reduce noise from low-quality matches. Takes the first result. Requires `GITHUB_TOKEN` env var if set (raises rate limit from 60 to 5000 req/hr). On any error, return `null`.
- CVE: `POST https://api.osv.dev/v1/query` with `{ package: { name } }` — return `response.vulns.length`. On any error, return `null`.
- Both calls use a 5-second `AbortSignal` timeout. Timeout is treated as an error → returns `null`.
- A `NullExternalDataFetcher` implementation returns `null` for all calls; used in tests and as the default.
- **Known limitation:** GitHub health data is name-based search. Radar names like "Go language" or "React JS" may not match canonical repo names exactly. `maintenanceRisk` is only 0–3 out of 10, so inaccuracy has bounded impact. A caveat is included in the `get_technology_risk_score` tool description.

---

## Tool 1: `getTrendingTechnologies`

### Purpose
Identify technologies whose radar ring has changed meaningfully across recent volumes — rising toward Adopt, falling toward Hold/Caution, or stable.

### Input
```typescript
{
  quadrant?: Quadrant          // filter to one quadrant
  direction?: 'rising' | 'falling' | 'stable' | 'all'  // default: 'all'
  limit?: number               // max results per direction, default 10
}
```

### Logic (in `RadarService.getTrendingTechnologies`)
1. Iterate `historyMap` (all technologies, all 34 volumes)
2. For each technology with ≥ 2 appearances, map ring to numeric score: `adopt=1, trial=2, assess=3, hold=4, caution=4`
3. Take the last 6 *appearances* (entries in `historyMap`, sorted by volume) for slope calculation, or all appearances if fewer than 6. Compute linear regression slope over the ring scores.
4. Classify: slope ≤ −0.05 → `rising` (moving toward adopt); slope ≥ +0.05 → `falling`; otherwise `stable`. The threshold is ±0.05 (not ±0.1) because radar data is sparse — most technologies appear only 2–6 times — making slopes rarely steep.
5. Quadrant filter is applied against the technology's most recent appearance (canonical quadrant).
6. Apply direction filter; sort by |slope| descending; trim to `limit`

### Output
```typescript
{
  trending: Array<{
    name: string
    quadrant: Quadrant
    currentRing: Ring
    direction: 'rising' | 'falling' | 'stable'
    slope: number                        // raw slope value for sorting
    trajectory: Array<{ volume: number; year: number; ring: Ring }>
  }>
}
```

---

## Tool 2: `getTechnologyRiskScore`

### Purpose
Return a composite 0–10 risk score for a single technology, combining radar ring position, GitHub maintenance health, and known CVE count. Used standalone and as an internal dependency of `getMigrationRoadmap`.

### Input
```typescript
{ name: string }
```

### Logic (in `RadarService.getTechnologyRiskScore`)
1. Look up technology in `ringQuadrantMap` (Vol.34), fall back to `historyMap` last entry
2. Radar risk component (0–4): `adopt=0, trial=1, assess=2, hold=3, caution=3`
3. Maintenance risk component (0–3): call `fetcher.fetchGitHubHealth(name)`
   - stars > 10k AND lastCommitDaysAgo < 180 → 0 (healthy)
   - stars 1k–10k OR lastCommitDaysAgo 180–365 → 1
   - stars < 1k OR lastCommitDaysAgo 365–730 → 2
   - lastCommitDaysAgo > 730 OR fetch returned null → 3 (unknown/risky)
4. Security risk component (0–3): call `fetcher.fetchCVECount(name)`
   - 0 CVEs → 0; 1–5 → 1; 6–20 → 2; > 20 → 3
5. Total = radarRisk + maintenanceRisk + securityRisk (max 10, min 0)
6. `breakdown.maintenanceRisk` and `breakdown.securityRisk` are `null` when the fetcher returned `null` (data unavailable), even though the score still uses 3 (worst-case) for those components.

### Output
```typescript
{
  name: string
  riskScore: number            // 0–10
  breakdown: {
    radarRisk: number          // 0–4
    maintenanceRisk: number | null   // null if GitHub data unavailable
    securityRisk: number | null      // null if CVE data unavailable
  }
  currentRing: Ring | 'unknown'
  githubHealth: GitHubHealth | null
  cveCount: number | null
}
```

---

## Tool 3: `draftADR`

### Purpose
Given a decision title and candidate options (technologies), produce a Markdown ADR draft with radar evidence already filled in for each option. Removes the TL's burden of manually looking up radar status while writing decision docs.

### Input
```typescript
{
  title: string                           // e.g. "Select container orchestration platform"
  options: Array<{
    name: string                          // technology name
    description?: string                 // brief note from the TL
  }>                                      // minimum 2 options (ADR semantics require comparison)
  context?: string                        // optional free-text problem statement
}
```

### Logic (in `RadarService.draftADR`)
1. For each option: call `getTechnologyHistory({ name })` and look up current ring in `ringQuadrantMap`
2. For unknown technologies: `currentRing = 'unknown'`, ring display shows "not in radar"
3. Render to Markdown using a fixed template — pure string interpolation, no LLM call

### Output
```typescript
{
  markdown: string    // complete ADR Markdown
  options: Array<{    // structured data for agent post-processing
    name: string
    currentRing: Ring | 'unknown'
    quadrant: Quadrant | 'unknown'
    historyLength: number
    latestMovement: string       // e.g. "moved in (Vol.28)"
    radarUrl: string             // https://www.thoughtworks.com/radar
  }>
}
```

### Markdown template
```
# ADR: {title}

**Date:** {today}  
**Status:** Proposed

## Context

{context or placeholder}

## Options Considered

### Option {N}: {name}
- **Radar status (Vol.34):** {ring} — {quadrant}
- **History:** {N} appearances across {first year}–{last year}
- **Recent movement:** {status from latest entry}
- **Description:** {description from latest radar entry}
{TL's description if provided}

...

## Decision

[To be filled]

## Consequences

[To be filled]

---
*Radar evidence sourced from Thoughtworks Tech Radar Vol.01–34 via tech-radar-advisor MCP.*
```

---

## Tool 4: `getMigrationRoadmap`

### Purpose
Convert a list of technologies into a prioritised migration plan. Goes beyond `auditTechStack` by ordering items, computing risk scores, and suggesting concrete replacements with rationale.

### Input
```typescript
{
  technologies: string[]   // list of technology names to assess
}
```

### Logic (in `RadarService.getMigrationRoadmap`)
1. Run `auditTechStack` internally to classify each technology
2. Filter to `migrate` (hold/caution) and `monitor` (assess) items — skip `healthy` and `unknown`
3. For each filtered item: call `getTechnologyRiskScore` to get composite risk. Alternatives are taken from `item.alternatives` already embedded in the `AuditItem` by `auditTechStack` (which calls `findAlternatives` internally) — no second lookup needed.
4. Concurrency: process in batches of 5 to avoid hitting GitHub API rate limits (60 req/hr unauthenticated × 2 calls per technology = exhausted at ~30 technologies without batching).
5. Sort descending by `riskScore`; nulls sort last (technology found in radar but all external fetches failed); tiebreak by ring severity (`caution` before `hold` before `assess`)
6. `RoadmapItem.riskScore` is always `number`. Fallback value is `6/10` (conservative "medium-high, assume caution") for the theoretical edge case where a technology passes `auditTechStack` but `getTechnologyRiskScore` can't resolve it. In practice this can't occur — both methods use the same radar lookup path.
7. Estimate migration effort heuristic (quadrant-based, adjusted by riskScore):
   - `high`: quadrant is `platforms` or `tools`, OR riskScore ≥ 7
   - `medium`: riskScore is null OR riskScore 4–6
   - `low`: riskScore ≤ 3

### Output
```typescript
{
  summary: {
    total: number
    criticalMigrations: number   // ring = hold/caution
    monitored: number            // ring = assess
  }
  roadmap: Array<{
    priority: number             // 1-based ranking
    name: string
    currentRing: Ring
    quadrant: Quadrant
    riskScore: number            // 6 fallback if lookup fails (conservative)
    action: 'migrate' | 'monitor'
    effort: 'low' | 'medium' | 'high'
    suggestedAlternatives: RadarEntry[]   // empty for 'monitor' items
    rationale: string            // templated string summarising why
  }>
}
```

---

## Types in `types.ts`

```typescript
export interface GitHubHealth {
  stars: number
  lastCommitDaysAgo: number
  openIssues: number
}

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
  breakdown: { radarRisk: number; maintenanceRisk: number | null; securityRisk: number | null }
  currentRing: Ring | 'unknown'
  githubHealth: GitHubHealth | null
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

---

## Testing strategy

Tests follow the existing pattern: real JSON data, no mocks for `RadarService` logic. External API calls are isolated via `ExternalDataFetcher` interface.

| Test file | Coverage |
|-----------|---------|
| `tests/radarService.test.ts` (extended) | `getTrendingTechnologies`, `getTechnologyRiskScore` (with `NullExternalDataFetcher`), `draftADR`, `getMigrationRoadmap` |
| `tests/tools.test.ts` (extended) | All four new `createXxxTool()` wrappers via `tool.execute()` |
| `tests/externalDataFetcher.test.ts` (new) | HTTP fetch logic using `vi.fn()` to mock fetch; verify graceful degradation on 4xx/5xx/timeout |

---

## Out of scope (this spec)

- Team custom radar (CRUD for internal tech entries) — separate feature
- Visualisation data format (ECharts/Mermaid) — can be added as an output mode later
- LLM-generated ADR text — the template approach keeps the tool deterministic and testable; callers can post-process with an LLM
- GitHub API authentication UI — `GITHUB_TOKEN` env var only; no OAuth flow
