import type { RadarEntry, RadarIndex, Ring, Quadrant } from './types.js'

type SearchInput = { query: string; quadrant?: Quadrant; ring?: Ring }
type SearchResult = RadarEntry[] | { found: false; suggestions: RadarEntry[] }

type ListInput = { ring?: Ring; quadrant?: Quadrant }

export class RadarService {
  constructor(private readonly index: RadarIndex) {}

  searchTechnology(input: SearchInput): SearchResult {
    const raw = this.index.fuseIndex.search(input.query)

    // No match at all — return not-found sentinel
    if (raw.length === 0) {
      return { found: false, suggestions: [] }
    }

    let entries = raw.map((r) => r.item)

    if (input.quadrant) {
      entries = entries.filter((e) => e.quadrant === input.quadrant)
    }
    if (input.ring) {
      entries = entries.filter((e) => e.ring === input.ring)
    }

    return entries.slice(0, 5)
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
}
