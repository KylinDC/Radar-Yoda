import Fuse from 'fuse.js'
import { VOLUMES } from './generated/volumes.js'
import type { Quadrant, RadarEntry, RadarIndex, RawEntry, Ring } from './types.js'

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .trim()
}

export function parseVolumeAndYear(filename: string): {
  volume: number
  year: number
} {
  const volMatch = filename.match(/Volume\s+(\d+)/i)
  const yearMatch = filename.match(/\(.*?(\d{4})\)/)
  if (!volMatch) throw new Error(`Cannot parse volume from filename: ${filename}`)
  return {
    volume: parseInt(volMatch[1], 10),
    year: yearMatch ? parseInt(yearMatch[1], 10) : 0,
  }
}

export function normalizeEntries(raw: RawEntry[], volume: number, year: number): RadarEntry[] {
  return raw.map((r) => ({
    name: r.name,
    ring: r.ring.toLowerCase() as Ring,
    quadrant: r.quadrant.toLowerCase() as Quadrant,
    isNew: r.isNew === 'TRUE',
    status: r.status as RadarEntry['status'],
    description: stripHtml(r.description ?? ''),
    relatedBlips: r.relatedBlips ?? [],
    volume,
    year,
  }))
}

/** Builds the Maps and Fuse index from an already-normalised set of entries. */
function buildIndex(allEntries: RadarEntry[]): RadarIndex {
  // Dynamically detect the latest volume
  const maxVolume = allEntries.reduce((max, e) => Math.max(max, e.volume), 0)
  const latestVolumeEntries = allEntries.filter((e) => e.volume === maxVolume)

  if (latestVolumeEntries.length === 0) {
    throw new Error(
      'Failed to find latest radar volume data. Check tech-radar-json-data/ directory.',
    )
  }

  // historyMap — all volumes, sorted by volume ascending
  const historyMap = new Map<string, RadarEntry[]>()
  for (const entry of allEntries) {
    const key = entry.name.toLowerCase()
    const existing = historyMap.get(key) ?? []
    existing.push(entry)
    historyMap.set(key, existing)
  }
  for (const [key, entries] of historyMap) {
    historyMap.set(
      key,
      entries.sort((a, b) => a.volume - b.volume),
    )
  }

  // Fuse.js index — search over latest entry per technology (covers all volumes)
  const latestEntries = [...historyMap.values()].map((entries) => entries[entries.length - 1])
  const fuseIndex = new Fuse(latestEntries, {
    keys: ['name', 'description'],
    threshold: 0.3,
    includeScore: true,
  })

  // ringQuadrantMap — latest volume only, key = "ring:quadrant"
  const ringQuadrantMap = new Map<string, RadarEntry[]>()
  for (const entry of latestVolumeEntries) {
    const key = `${entry.ring}:${entry.quadrant}`
    const existing = ringQuadrantMap.get(key) ?? []
    existing.push(entry)
    ringQuadrantMap.set(key, existing)
  }

  return { fuseIndex, historyMap, ringQuadrantMap }
}

/**
 * Builds the radar index from an explicit list of volumes. Pure and
 * filesystem-free, so it runs unchanged in Node and in a Cloudflare Worker.
 */
export function buildRadarIndexFromVolumes(
  volumes: Array<{ filename: string; entries: RawEntry[] }>,
): RadarIndex {
  const allEntries: RadarEntry[] = []

  for (const { filename, entries: raw } of volumes) {
    const { volume, year } = parseVolumeAndYear(filename)
    allEntries.push(...normalizeEntries(raw, volume, year))
  }

  return buildIndex(allEntries)
}

/**
 * Builds the index from the bundled volumes in `src/generated/volumes.ts`.
 *
 * The volumes are statically imported rather than read with fs, because
 * Workers have no filesystem. Run `npm run gen:volumes` after adding a volume.
 *
 * The work is ~30ms, so call this at module scope (startup budget is 1s) —
 * never inside a request handler, where the free plan's 10ms CPU limit applies.
 */
export async function buildRadarIndex(): Promise<RadarIndex> {
  return buildRadarIndexFromVolumes(VOLUMES)
}
