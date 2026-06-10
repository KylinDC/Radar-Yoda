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

  getTechnologyHistory(input: { name: string }): {
    name: string
    history: { volume: number; year: number; ring: Ring; status: string }[]
  } | null {
    const entries = this.index.historyMap.get(input.name)
    if (!entries || entries.length === 0) return null

    return {
      name: input.name,
      history: entries.map((e) => ({
        volume: e.volume,
        year: e.year,
        ring: e.ring,
        status: e.status,
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
    if (!inputEntry) return null

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

  compareTechnologies(input: { names: [string, string] }): {
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
