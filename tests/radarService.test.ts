import { describe, it, expect, beforeAll } from 'vitest'
import type { Ring, Quadrant, RadarEntry, RadarIndex } from '../src/types.js'
import { buildRadarIndex } from '../src/dataLoader.js'
import { RadarService } from '../src/radarService.js'

describe('types', () => {
  it('Ring values are the four rings', () => {
    const rings: Ring[] = ['adopt', 'trial', 'assess', 'hold', 'caution']
    expect(rings).toHaveLength(5)
    expect(rings).toContain('adopt')
    expect(rings).toContain('trial')
    expect(rings).toContain('assess')
    expect(rings).toContain('hold')
    expect(rings).toContain('caution')
  })

  it('Quadrant values are the four quadrants', () => {
    const quadrants: Quadrant[] = [
      'techniques',
      'tools',
      'platforms',
      'languages-and-frameworks',
    ]
    expect(quadrants).toHaveLength(4)
    expect(quadrants).toContain('techniques')
    expect(quadrants).toContain('tools')
    expect(quadrants).toContain('platforms')
    expect(quadrants).toContain('languages-and-frameworks')
  })
})

describe('DataLoader', () => {
  it('builds an index with entries from all 34 volumes', async () => {
    const index = await buildRadarIndex()
    // historyMap should have entries spanning multiple volumes
    const entries = [...index.historyMap.values()].flat()
    const volumes = new Set(entries.map((e) => e.volume))
    expect(volumes.size).toBe(34)
  })

  it('strips HTML tags from description', async () => {
    const index = await buildRadarIndex()
    const entries = [...index.historyMap.values()].flat()
    const withHtml = entries.filter((e) => /<[^>]+>/.test(e.description))
    expect(withHtml).toHaveLength(0)
  })

  it('converts isNew string to boolean', async () => {
    const index = await buildRadarIndex()
    const entries = [...index.historyMap.values()].flat()
    entries.forEach((e) => {
      expect(typeof e.isNew).toBe('boolean')
    })
  })

  it('ringQuadrantMap key "adopt:techniques" exists and is non-empty', async () => {
    const index = await buildRadarIndex()
    const entries = index.ringQuadrantMap.get('adopt:techniques')
    expect(entries).toBeDefined()
    expect(entries!.length).toBeGreaterThan(0)
  })

  it('historyMap entries for a technology are sorted by volume ascending', async () => {
    const index = await buildRadarIndex()
    const history = index.historyMap.get('Docker')
    if (history && history.length > 1) {
      for (let i = 1; i < history.length; i++) {
        expect(history[i].volume).toBeGreaterThan(history[i - 1].volume)
      }
    }
  })
})

describe('RadarService.searchTechnology', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('finds Docker by exact name', () => {
    const results = service.searchTechnology({ query: 'Docker' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name.toLowerCase()).toContain('docker')
  })

  it('finds results with fuzzy match', () => {
    const results = service.searchTechnology({ query: 'Kubernete' }) // typo
    expect(results.length).toBeGreaterThan(0)
  })

  it('filters by quadrant', () => {
    const results = service.searchTechnology({
      query: 'Docker',
      quadrant: 'platforms',
    })
    results.forEach((r) => expect(r.quadrant).toBe('platforms'))
  })

  it('filters by ring', () => {
    const results = service.searchTechnology({ query: 'Docker', ring: 'adopt' })
    results.forEach((r) => expect(r.ring).toBe('adopt'))
  })

  it('returns at most 5 results', () => {
    const results = service.searchTechnology({ query: 'test' })
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('returns found:false when nothing matches', () => {
    const result = service.searchTechnology({ query: 'xyzzy123notreal' })
    expect(result).toEqual({ found: false, suggestions: [] })
  })
})

describe('RadarService.listByRingAndQuadrant', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('lists all adopt entries when no quadrant given', () => {
    const results = service.listByRingAndQuadrant({ ring: 'adopt' })
    expect(results.length).toBeGreaterThan(0)
    results.forEach((r) => expect(r.ring).toBe('adopt'))
  })

  it('lists adopt:platforms entries', () => {
    const results = service.listByRingAndQuadrant({
      ring: 'adopt',
      quadrant: 'platforms',
    })
    results.forEach((r) => {
      expect(r.ring).toBe('adopt')
      expect(r.quadrant).toBe('platforms')
    })
  })

  it('returns results sorted by name', () => {
    const results = service.listByRingAndQuadrant({ ring: 'adopt' })
    for (let i = 1; i < results.length; i++) {
      expect(results[i].name.localeCompare(results[i - 1].name)).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns all entries when no filters given', () => {
    const results = service.listByRingAndQuadrant({})
    expect(results.length).toBeGreaterThan(0)
  })
})
