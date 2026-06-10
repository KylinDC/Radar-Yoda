import type { RadarEntry, RadarIndex, Ring, Quadrant, AuditItem, AuditResult } from './types.js'

type SearchInput = { query: string; quadrant?: Quadrant; ring?: Ring }
type SearchResult = { results: RadarEntry[]; found: boolean }

type ListInput = { ring?: Ring; quadrant?: Quadrant }

export class RadarService {
  constructor(private readonly index: RadarIndex) {}

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
      inputEntry = entries.find(
        (e) => e.name.toLowerCase() === input.name.toLowerCase()
      )
      if (inputEntry) break
    }
    if (!inputEntry) {
      // Fall back to historyMap for technologies dropped from the latest volume
      const history = this.index.historyMap.get(input.name.toLowerCase())
      if (!history || history.length === 0) return null
      inputEntry = history[history.length - 1]
    }

    // Warn if technology is not in the "avoid" rings (hold or caution)
    const avoidRings: Ring[] = ['hold', 'caution']
    const warning = !avoidRings.includes(inputEntry.ring)
      ? `"${inputEntry.name}" is currently in the "${inputEntry.ring}" ring, not "hold" or "caution". Showing Adopt/Trial alternatives in the same quadrant anyway.`
      : undefined

    const alternatives = (
      this.index.ringQuadrantMap.get(`adopt:${inputEntry.quadrant}`) ?? []
    )
      .concat(
        this.index.ringQuadrantMap.get(`trial:${inputEntry.quadrant}`) ?? []
      )
      .filter((e) => e.name !== inputEntry!.name)
      .sort((a, b) => a.name.localeCompare(b.name))

    return { input: inputEntry, warning, alternatives }
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
}
