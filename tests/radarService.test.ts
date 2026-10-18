import { beforeAll, describe, expect, it } from 'vitest'
import { buildRadarIndex } from '../src/dataLoader.js'
import { RadarService } from '../src/radarService.js'
import type { Quadrant, Ring } from '../src/types.js'

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
    const quadrants: Quadrant[] = ['techniques', 'tools', 'platforms', 'languages-and-frameworks']
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
    result.results.forEach((r) => {
      expect(r.quadrant).toBe('platforms')
    })
  })

  it('filters by ring', () => {
    const result = service.searchTechnology({ query: 'Docker', ring: 'adopt' })
    result.results.forEach((r) => {
      expect(r.ring).toBe('adopt')
    })
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
    results.forEach((r) => {
      expect(r.ring).toBe('adopt')
    })
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
    item.alternatives!.forEach((a) => {
      expect(['adopt', 'trial']).toContain(a.ring)
    })
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
    const technologies =
      trialTechs.length > 0 ? [adoptTech.name, trialTechs[0].name] : [adoptTech.name]
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

  it('returns null for an unknown technology', async () => {
    const result = await service.getTechnologyRiskScore({ name: 'xyzzy123notreal' })
    expect(result).toBeNull()
  })

  it('riskScore increases when CVE count is high', async () => {
    const { NullExternalDataFetcher } = await import('../src/externalDataFetcher.js')
    class HighCVEFetcher extends NullExternalDataFetcher {
      override async fetchCVECount(_name: string) {
        return 25
      } // > 20 → securityRisk=3
    }
    const index = await buildRadarIndex()
    const svc = new RadarService(index, new HighCVEFetcher())
    const adoptEntries = svc.listByRingAndQuadrant({ ring: 'adopt' })
    const result = await svc.getTechnologyRiskScore({ name: adoptEntries[0].name })
    expect(result!.breakdown.securityRisk).toBe(3)
    expect(result!.cveCount).toBe(25)
  })
})

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

  it('roadmap items have 1-based priority ranking starting at 1', async () => {
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
