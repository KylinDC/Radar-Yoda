import { readFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import Fuse from 'fuse.js'
import type { RadarEntry, RadarIndex, Ring, Quadrant } from './types.js'

const DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tech-radar-json-data'
)

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').trim()
}

function parseVolumeAndYear(filename: string): { volume: number; year: number } {
  const volMatch = filename.match(/Volume\s+(\d+)/i)
  const yearMatch = filename.match(/\(.*?(\d{4})\)/)
  return {
    volume: volMatch ? parseInt(volMatch[1], 10) : 0,
    year: yearMatch ? parseInt(yearMatch[1], 10) : 0,
  }
}

type RawEntry = {
  name: string
  ring: string
  quadrant: string
  isNew: string
  status: string
  description: string
  relatedBlips: string[]
}

export async function buildRadarIndex(): Promise<RadarIndex> {
  const files = (await readdir(DATA_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()

  const allEntries: RadarEntry[] = []
  let vol34Entries: RadarEntry[] = []

  for (const filename of files) {
    const { volume, year } = parseVolumeAndYear(filename)
    const raw: RawEntry[] = JSON.parse(
      await readFile(join(DATA_DIR, filename), 'utf-8')
    )

    const entries: RadarEntry[] = raw.map((r) => ({
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

    allEntries.push(...entries)
    if (volume === 34) vol34Entries = entries
  }

  // historyMap — all volumes, sorted by volume ascending
  const historyMap = new Map<string, RadarEntry[]>()
  for (const entry of allEntries) {
    const key = entry.name
    const existing = historyMap.get(key) ?? []
    existing.push(entry)
    historyMap.set(key, existing)
  }
  for (const [key, entries] of historyMap) {
    historyMap.set(key, entries.sort((a, b) => a.volume - b.volume))
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
  for (const entry of vol34Entries) {
    const key = `${entry.ring}:${entry.quadrant}`
    const existing = ringQuadrantMap.get(key) ?? []
    existing.push(entry)
    ringQuadrantMap.set(key, existing)
  }

  return { fuseIndex, historyMap, ringQuadrantMap }
}
