import type { ExternalDataFetcher } from './externalDataFetcher.js'
import { NullExternalDataFetcher } from './externalDataFetcher.js'
import type {
  ADRDraft,
  ADROption,
  AuditItem,
  AuditResult,
  MigrationRoadmap,
  Quadrant,
  RadarEntry,
  RadarIndex,
  Ring,
  RiskScore,
  RoadmapItem,
  TrendDirection,
  TrendingEntry,
} from './types.js'

function linearRegressionSlope(scores: number[]): number {
  const n = scores.length
  if (n < 2) return 0
  const sumX = (n * (n - 1)) / 2
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
  const sumY = scores.reduce((a, b) => a + b, 0)
  const sumXY = scores.reduce((sum, y, i) => sum + i * y, 0)
  return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
}

type SearchInput = { query: string; quadrant?: Quadrant; ring?: Ring }
type SearchResult = { results: RadarEntry[]; found: boolean }

type ListInput = { ring?: Ring; quadrant?: Quadrant }

export class RadarService {
  constructor(
    private readonly index: RadarIndex,
    private readonly fetcher: ExternalDataFetcher = new NullExternalDataFetcher(),
  ) {}

  searchTechnology(input: SearchInput): SearchResult {
    const raw = this.index.fuseIndex.search(input.query)
    let entries = raw.map((r) => r.item)

    if (input.quadrant) {
      entries = entries.filter((e) => e.quadrant === input.quadrant)
    }
    if (input.ring) {
      entries = entries.filter((e) => e.ring === input.ring)
    }

    const results = entries.slice(0, 5)
    return { results, found: results.length > 0 }
  }

  listByRingAndQuadrant(input: ListInput): RadarEntry[] {
    const results: RadarEntry[] = []

    for (const [key, entries] of this.index.ringQuadrantMap) {
      const [ring, quadrant] = key.split(':') as [Ring, Quadrant]
      if (input.ring && ring !== input.ring) continue
      if (input.quadrant && quadrant !== input.quadrant) continue
      results.push(...entries)
    }

    return results.sort((a, b) => a.name.localeCompare(b.name))
  }

  getTechnologyHistory(input: { name: string }): {
    name: string
    history: { volume: number; year: number; ring: Ring; status: string; description: string }[]
  } | null {
    const entries = this.index.historyMap.get(input.name.toLowerCase())
    if (!entries || entries.length === 0) return null

    return {
      name: entries[entries.length - 1].name,
      history: entries.map((e) => ({
        volume: e.volume,
        year: e.year,
        ring: e.ring,
        status: e.status,
        description: e.description,
      })),
    }
  }

  findAlternatives(input: { name: string }): {
    input: RadarEntry
    warning?: string
    alternatives: RadarEntry[]
  } | null {
    // Look up in Vol.34 via ringQuadrantMap
    let inputEntry: RadarEntry | undefined
    for (const entries of this.index.ringQuadrantMap.values()) {
      inputEntry = entries.find((e) => e.name.toLowerCase() === input.name.toLowerCase())
      if (inputEntry) break
    }
    if (!inputEntry) {
      // Fall back to historyMap for technologies dropped from the latest volume
      const history = this.index.historyMap.get(input.name.toLowerCase())
      if (!history || history.length === 0) return null
      inputEntry = history[history.length - 1]
    }

    // Bind to a const: `inputEntry` is a `let`, so TypeScript drops the
    // narrowing above inside the closures below.
    const entry = inputEntry

    // Warn if technology is not in the "avoid" rings (hold or caution)
    const avoidRings: Ring[] = ['hold', 'caution']
    const warning = !avoidRings.includes(entry.ring)
      ? `"${entry.name}" is currently in the "${entry.ring}" ring, not "hold" or "caution". Showing Adopt/Trial alternatives in the same quadrant anyway.`
      : undefined

    const alternatives = (this.index.ringQuadrantMap.get(`adopt:${entry.quadrant}`) ?? [])
      .concat(this.index.ringQuadrantMap.get(`trial:${entry.quadrant}`) ?? [])
      .filter((e) => e.name !== entry.name)
      .sort((a, b) => a.name.localeCompare(b.name))

    return { input: entry, warning, alternatives }
  }

  auditTechStack(input: { technologies: string[] }): AuditResult {
    const items: AuditItem[] = []
    const notFound: string[] = []

    for (const tech of input.technologies) {
      // Look up current status (Vol.34) first, fall back to last known entry
      let entry: RadarEntry | undefined
      for (const list of this.index.ringQuadrantMap.values()) {
        entry = list.find((e) => e.name.toLowerCase() === tech.toLowerCase())
        if (entry) break
      }
      if (!entry) {
        const history = this.index.historyMap.get(tech.toLowerCase())
        if (history && history.length > 0) {
          entry = history[history.length - 1]
        }
      }

      if (!entry) {
        notFound.push(tech)
        items.push({ name: tech, ring: 'unknown', status: 'unknown' })
        continue
      }

      const statusMap: Record<Ring, AuditItem['status']> = {
        adopt: 'healthy',
        trial: 'healthy',
        assess: 'monitor',
        hold: 'migrate',
        caution: 'migrate',
      }

      const item: AuditItem = {
        name: entry.name,
        ring: entry.ring,
        quadrant: entry.quadrant,
        status: statusMap[entry.ring],
      }

      if (item.status === 'migrate') {
        const altResult = this.findAlternatives({ name: entry.name })
        if (altResult) item.alternatives = altResult.alternatives
      }

      items.push(item)
    }

    const summary = {
      total: items.length,
      healthy: items.filter((i) => i.status === 'healthy').length,
      monitor: items.filter((i) => i.status === 'monitor').length,
      migrate: items.filter((i) => i.status === 'migrate').length,
      unknown: items.filter((i) => i.status === 'unknown').length,
    }

    return { summary, items, notFound }
  }

  async getTrendingTechnologies(input: {
    quadrant?: Quadrant
    direction?: TrendDirection | 'all'
    limit?: number
  }): Promise<{ trending: TrendingEntry[] }> {
    const ringScore: Record<Ring, number> = { adopt: 1, trial: 2, assess: 3, hold: 4, caution: 4 }
    const limit = input.limit ?? 10
    const directionFilter = input.direction ?? 'all'

    const results: TrendingEntry[] = []

    for (const entries of this.index.historyMap.values()) {
      if (entries.length < 2) continue

      const sorted = [...entries].sort((a, b) => a.volume - b.volume)
      const last = sorted[sorted.length - 1]

      if (input.quadrant && last.quadrant !== input.quadrant) continue

      const recent = sorted.slice(-6)
      const scores = recent.map((e) => ringScore[e.ring])
      const slope = linearRegressionSlope(scores)

      const direction: TrendDirection =
        slope <= -0.05 ? 'rising' : slope >= 0.05 ? 'falling' : 'stable'

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

    const radarRiskMap: Record<Ring, number> = {
      adopt: 0,
      trial: 1,
      assess: 2,
      hold: 3,
      caution: 3,
    }
    const radarRisk = radarRiskMap[entry.ring]

    const githubHealth = await this.fetcher.fetchGitHubHealth(input.name)
    let maintenanceScore: number
    if (githubHealth === null) {
      maintenanceScore = 3
    } else if (githubHealth.stars > 10000 && githubHealth.lastCommitDaysAgo < 180) {
      maintenanceScore = 0
    } else if (githubHealth.stars >= 1000 || githubHealth.lastCommitDaysAgo <= 365) {
      maintenanceScore = 1
    } else if (githubHealth.stars >= 100 || githubHealth.lastCommitDaysAgo <= 730) {
      maintenanceScore = 2
    } else {
      maintenanceScore = 3
    }

    const cveCount = await this.fetcher.fetchCVECount(input.name)
    let securityScore: number
    if (cveCount === null) {
      securityScore = 3
    } else if (cveCount === 0) {
      securityScore = 0
    } else if (cveCount <= 5) {
      securityScore = 1
    } else if (cveCount <= 20) {
      securityScore = 2
    } else {
      securityScore = 3
    }

    return {
      name: entry.name,
      riskScore: Math.min(10, radarRisk + maintenanceScore + securityScore),
      breakdown: {
        radarRisk,
        maintenanceRisk: githubHealth === null ? null : maintenanceScore,
        securityRisk: cveCount === null ? null : securityScore,
      },
      currentRing: entry.ring,
      githubHealth,
      cveCount,
    }
  }

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

      // Fall back to historyMap last entry
      if (!entry) {
        const history = this.index.historyMap.get(opt.name.toLowerCase())
        if (history && history.length > 0) {
          entry = history[history.length - 1]
        }
      }

      const history = this.getTechnologyHistory({ name: opt.name })

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

      const ringDisplay =
        currentRing === 'unknown' ? 'not in radar' : `${currentRing} — ${quadrant}`
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

  compareTechnologies(input: { names: string[] }): {
    entries: RadarEntry[]
    histories: {
      name: string
      history: { volume: number; year: number; ring: Ring; status: string }[]
    }[]
    notFound?: string[]
  } {
    const entries: RadarEntry[] = []
    const histories: NonNullable<ReturnType<RadarService['getTechnologyHistory']>>[] = []
    const notFound: string[] = []

    for (const name of input.names) {
      // Find in Vol.34 (ringQuadrantMap)
      let found: RadarEntry | undefined
      for (const list of this.index.ringQuadrantMap.values()) {
        found = list.find((e) => e.name.toLowerCase() === name.toLowerCase())
        if (found) break
      }

      if (found) {
        entries.push(found)
      } else {
        notFound.push(name)
      }

      const historyName = found ? found.name : name
      const history = this.getTechnologyHistory({ name: historyName })
      if (history) histories.push(history)
    }

    return {
      entries,
      histories,
      ...(notFound.length > 0 ? { notFound } : {}),
    }
  }

  async getMigrationRoadmap(input: { technologies: string[] }): Promise<MigrationRoadmap> {
    const audit = this.auditTechStack({ technologies: input.technologies })
    const actionItems = audit.items.filter((i) => i.status === 'migrate' || i.status === 'monitor')

    // Compute risk scores with concurrency limit to avoid GitHub API rate limits.
    // Fallback 6/10 = conservative "medium-high, assume caution" for the theoretical case
    // where a technology passes auditTechStack but getTechnologyRiskScore can't find it.
    const CONCURRENCY = 5
    const scored: { item: AuditItem; riskScore: number }[] = []
    for (let i = 0; i < actionItems.length; i += CONCURRENCY) {
      const batch = actionItems.slice(i, i + CONCURRENCY)
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          const risk = await this.getTechnologyRiskScore({ name: item.name })
          return { item, riskScore: risk?.riskScore ?? 6 }
        }),
      )
      scored.push(...batchResults)
    }

    // Sort by riskScore desc, then by ring severity (caution > hold > assess)
    const ringSeverity: Partial<Record<string, number>> = { caution: 3, hold: 2, assess: 1 }
    scored.sort((a, b) => {
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore
      return (ringSeverity[b.item.ring as string] ?? 0) - (ringSeverity[a.item.ring as string] ?? 0)
    })

    const roadmap: RoadmapItem[] = scored.map(({ item, riskScore }, idx) => {
      const action: 'migrate' | 'monitor' = item.status === 'migrate' ? 'migrate' : 'monitor'
      const quadrant = item.quadrant ?? 'unknown'

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
}
