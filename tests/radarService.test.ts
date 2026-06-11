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
    const history = index.historyMap.get('docker')
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
    const result = service.searchTechnology({ query: 'Docker' })
    expect(result.found).toBe(true)
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.results[0].name.toLowerCase()).toContain('docker')
  })

  it('finds results with fuzzy match', () => {
    const result = service.searchTechnology({ query: 'Kubernete' }) // typo
    expect(result.found).toBe(true)
    expect(result.results.length).toBeGreaterThan(0)
  })

  it('filters by quadrant', () => {
    const result = service.searchTechnology({
      query: 'Docker',
      quadrant: 'platforms',
    })
    result.results.forEach((r) => expect(r.quadrant).toBe('platforms'))
  })

  it('filters by ring', () => {
    const result = service.searchTechnology({ query: 'Docker', ring: 'adopt' })
    result.results.forEach((r) => expect(r.ring).toBe('adopt'))
  })

  it('returns at most 5 results', () => {
    const result = service.searchTechnology({ query: 'test' })
    expect(result.results.length).toBeLessThanOrEqual(5)
  })

  it('returns found:false when nothing matches', () => {
    const result = service.searchTechnology({ query: 'xyzzy123notreal' })
    expect(result).toMatchObject({ found: false, results: [] })
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

describe('RadarService.getTechnologyHistory', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns history for Docker sorted by volume ascending', () => {
    const result = service.getTechnologyHistory({ name: 'Docker' })
    expect(result).not.toBeNull()
    expect(result!.history.length).toBeGreaterThan(1)
    for (let i = 1; i < result!.history.length; i++) {
      expect(result!.history[i].volume).toBeGreaterThan(result!.history[i - 1].volume)
    }
  })

  it('includes description in each history entry', () => {
    const result = service.getTechnologyHistory({ name: 'Docker' })
    expect(result).not.toBeNull()
    for (const entry of result!.history) {
      expect(typeof entry.description).toBe('string')
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('is case-insensitive', () => {
    const result = service.getTechnologyHistory({ name: 'docker' })
    expect(result).not.toBeNull()
  })

  it('returns canonical display name regardless of input casing', () => {
    const result = service.getTechnologyHistory({ name: 'docker' })
    expect(result!.name).toBe('Docker')
  })

  it('returns null for unknown technology', () => {
    const result = service.getTechnologyHistory({ name: 'xyzzy123notreal' })
    expect(result).toBeNull()
  })
})

describe('RadarService.findAlternatives', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns adopt/trial entries in the same quadrant as the input', () => {
    // Find a hold/caution technology to test with
    const holdEntries = service.listByRingAndQuadrant({ ring: 'caution' })
    if (holdEntries.length === 0) return // skip if no caution entries in vol34

    const holdTech = holdEntries[0]
    const result = service.findAlternatives({ name: holdTech.name })
    expect(result).not.toBeNull()
    result!.alternatives.forEach((a) => {
      expect(['adopt', 'trial']).toContain(a.ring)
      expect(a.quadrant).toBe(holdTech.quadrant)
    })
  })

  it('returns a warning when input technology is not on Hold/Caution', () => {
    const adoptEntries = service.listByRingAndQuadrant({ ring: 'adopt' })
    const adoptTech = adoptEntries[0]
    const result = service.findAlternatives({ name: adoptTech.name })
    expect(result).not.toBeNull()
    expect(result!.warning).toBeDefined()
  })

  it('falls back to historyMap for technologies dropped from latest volume', () => {
    // Jenkins is not in Vol.34 but has history (last seen as "hold" in tools quadrant)
    const result = service.findAlternatives({ name: 'Jenkins as a deployment pipeline' })
    expect(result).not.toBeNull()
    expect(result!.input.name).toBe('Jenkins as a deployment pipeline')
    expect(result!.alternatives.length).toBeGreaterThan(0)
    result!.alternatives.forEach((a) => {
      expect(['adopt', 'trial']).toContain(a.ring)
      expect(a.quadrant).toBe('tools')
    })
  })

  it('historyMap fallback is case-insensitive', () => {
    const result = service.findAlternatives({ name: 'jenkins as a deployment pipeline' })
    expect(result).not.toBeNull()
  })

  it('returns null for unknown technology', () => {
    const result = service.findAlternatives({ name: 'xyzzy123notreal' })
    expect(result).toBeNull()
  })
})

describe('RadarService.auditTechStack', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns healthy status for adopt technologies', () => {
    const adoptTech = service.listByRingAndQuadrant({ ring: 'adopt' })[0]
    const result = service.auditTechStack({ technologies: [adoptTech.name] })
    const item = result.items.find((i) => i.name === adoptTech.name)
    expect(item?.status).toBe('healthy')
    expect(item?.ring).toBe('adopt')
  })

  it('returns healthy status for trial technologies', () => {
    const trialTechs = service.listByRingAndQuadrant({ ring: 'trial' })
    if (trialTechs.length === 0) return
    const result = service.auditTechStack({ technologies: [trialTechs[0].name] })
    const item = result.items[0]
    expect(item.status).toBe('healthy')
    expect(item.ring).toBe('trial')
  })

  it('returns monitor status for assess technologies', () => {
    const assessTechs = service.listByRingAndQuadrant({ ring: 'assess' })
    if (assessTechs.length === 0) return
    const result = service.auditTechStack({ technologies: [assessTechs[0].name] })
    const item = result.items[0]
    expect(item.status).toBe('monitor')
  })

  it('returns migrate status for hold/caution technologies and includes alternatives', () => {
    const cautionTechs = service.listByRingAndQuadrant({ ring: 'caution' })
    if (cautionTechs.length === 0) return
    const result = service.auditTechStack({ technologies: [cautionTechs[0].name] })
    const item = result.items[0]
    expect(item.status).toBe('migrate')
    expect(item.alternatives).toBeDefined()
    expect(item.alternatives!.length).toBeGreaterThan(0)
    item.alternatives!.forEach((a) => expect(['adopt', 'trial']).toContain(a.ring))
  })

  it('marks unknown technology as unknown status and adds to notFound', () => {
    const result = service.auditTechStack({ technologies: ['xyzzy123notreal'] })
    expect(result.notFound).toContain('xyzzy123notreal')
    const item = result.items.find((i) => i.name === 'xyzzy123notreal')
    expect(item?.status).toBe('unknown')
    expect(item?.ring).toBe('unknown')
  })

  it('summary counts add up to total', () => {
    const adoptTech = service.listByRingAndQuadrant({ ring: 'adopt' })[0]
    const result = service.auditTechStack({
      technologies: [adoptTech.name, 'xyzzy123notreal'],
    })
    expect(result.summary.total).toBe(2)
    const { healthy, monitor, migrate, unknown } = result.summary
    expect(healthy + monitor + migrate + unknown).toBe(result.summary.total)
  })

  it('summary healthy count equals adopt + trial items', () => {
    const adoptTech = service.listByRingAndQuadrant({ ring: 'adopt' })[0]
    const trialTechs = service.listByRingAndQuadrant({ ring: 'trial' })
    const technologies = trialTechs.length > 0
      ? [adoptTech.name, trialTechs[0].name]
      : [adoptTech.name]
    const result = service.auditTechStack({ technologies })
    expect(result.summary.healthy).toBe(technologies.length)
  })

  it('is case-insensitive', () => {
    const result = service.auditTechStack({ technologies: ['react js'] })
    expect(result.notFound).not.toContain('react js')
    expect(result.items[0].status).not.toBe('unknown')
  })

  it('returns empty results for empty input', () => {
    const result = service.auditTechStack({ technologies: [] })
    expect(result.items).toHaveLength(0)
    expect(result.summary.total).toBe(0)
  })
})

describe('RadarService.compareTechnologies', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns entries and histories for two known technologies', () => {
    const result = service.compareTechnologies({
      names: ['DORA metrics', 'React JS'],
    })
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.histories.length).toBeGreaterThan(0)
  })

  it('lists missing names in notFound for unknown technology', () => {
    const result = service.compareTechnologies({
      names: ['DORA metrics', 'xyzzy123notreal'],
    })
    expect(result.notFound).toContain('xyzzy123notreal')
    expect(result.entries.some((e) => e.name === 'DORA metrics')).toBe(true)
  })

  it('accepts more than two names', () => {
    const result = service.compareTechnologies({
      names: ['DORA metrics', 'Passkeys', 'Context engineering'],
    })
    expect(result.entries.length).toBe(3)
    expect(result.histories.length).toBe(3)
  })
})

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
