import { describe, it, expect, beforeAll } from 'vitest'
import { buildRadarIndex } from '../src/dataLoader.js'
import { RadarService } from '../src/radarService.js'
import {
  createSearchTechnologyTool,
  createGetTechnologyHistoryTool,
  createFindAlternativesTool,
  createListByRingAndQuadrantTool,
  createCompareTechnologiesTool,
  createAuditTechStackTool,
  createGetTrendingTechnologiesTool,
  createGetTechnologyRiskScoreTool,
  createDraftADRTool,
  createGetMigrationRoadmapTool,
} from '../src/tools.js'

let service: RadarService

beforeAll(async () => {
  const index = await buildRadarIndex()
  service = new RadarService(index)
})

describe('MCP Tools Integration', () => {

  describe('searchTechnology tool', () => {
    it('happy path — finds Context engineering (in Vol.34)', async () => {
      const tool = createSearchTechnologyTool(service)
      const result = await tool.execute({ context: { query: 'Context engineering' } })
      expect((result as { found: boolean }).found).toBe(true)
      expect((result as { results: unknown[] }).results.length).toBeGreaterThan(0)
    })

    it('no-result path — returns found:false', async () => {
      const tool = createSearchTechnologyTool(service)
      const result = await tool.execute({ context: { query: 'xyzzy123notreal' } })
      expect(result).toMatchObject({ found: false })
    })
  })

  describe('getTechnologyHistory tool', () => {
    it('happy path — returns history for Docker with description', async () => {
      const tool = createGetTechnologyHistoryTool(service)
      const result = await tool.execute({ context: { name: 'Docker' } })
      expect(result).not.toBeNull()
      expect((result as { name: string }).name).toBe('Docker')
      const history = (result as { history: { description: string }[] }).history
      expect(history.length).toBeGreaterThan(0)
      expect(typeof history[0].description).toBe('string')
      expect(history[0].description.length).toBeGreaterThan(0)
    })

    it('no-result path — returns null for unknown', async () => {
      const tool = createGetTechnologyHistoryTool(service)
      const result = await tool.execute({ context: { name: 'xyzzy123notreal' } })
      expect(result).toBeNull()
    })
  })

  describe('findAlternatives tool', () => {
    it('happy path — returns alternatives for a caution technology', async () => {
      const cautionEntries = service.listByRingAndQuadrant({ ring: 'caution' })
      if (cautionEntries.length === 0) return
      const tool = createFindAlternativesTool(service)
      const result = await tool.execute({ context: { name: cautionEntries[0].name } })
      expect(result).not.toBeNull()
    })

    it('no-result path — returns null for unknown', async () => {
      const tool = createFindAlternativesTool(service)
      const result = await tool.execute({ context: { name: 'xyzzy123notreal' } })
      expect(result).toBeNull()
    })
  })

  describe('listByRingAndQuadrant tool', () => {
    it('happy path — returns adopt entries', async () => {
      const tool = createListByRingAndQuadrantTool(service)
      const result = await tool.execute({ context: { ring: 'adopt' } })
      expect(Array.isArray(result)).toBe(true)
      expect((result as { ring: string }[]).every((r) => r.ring === 'adopt')).toBe(true)
    })

    it('no-result path — assess:tools may be empty but returns array', async () => {
      const tool = createListByRingAndQuadrantTool(service)
      const result = await tool.execute({ context: { ring: 'assess', quadrant: 'tools' } })
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('auditTechStack tool', () => {
    it('happy path — audits a mixed list and returns summary + items', async () => {
      const adoptTech = service.listByRingAndQuadrant({ ring: 'adopt' })[0]
      const tool = createAuditTechStackTool(service)
      const result = await tool.execute({
        context: { technologies: [adoptTech.name, 'xyzzy123notreal'] },
      }) as { summary: { total: number; healthy: number; unknown: number }; items: { status: string }[]; notFound: string[] }
      expect(result.summary.total).toBe(2)
      expect(result.summary.healthy).toBe(1)
      expect(result.summary.unknown).toBe(1)
      expect(result.notFound).toContain('xyzzy123notreal')
    })

    it('migrate path — hold/caution tech gets alternatives in result', async () => {
      const cautionTechs = service.listByRingAndQuadrant({ ring: 'caution' })
      if (cautionTechs.length === 0) return
      const tool = createAuditTechStackTool(service)
      const result = await tool.execute({
        context: { technologies: [cautionTechs[0].name] },
      }) as { items: { status: string; alternatives?: unknown[] }[] }
      expect(result.items[0].status).toBe('migrate')
      expect(result.items[0].alternatives?.length).toBeGreaterThan(0)
    })

    it('empty path — returns empty items for empty list', async () => {
      const tool = createAuditTechStackTool(service)
      const result = await tool.execute({ context: { technologies: [] } }) as {
        summary: { total: number }; items: unknown[]
      }
      expect(result.items).toHaveLength(0)
      expect(result.summary.total).toBe(0)
    })
  })

  describe('compareTechnologies tool', () => {
    it('happy path — compares two Vol.34 technologies', async () => {
      const tool = createCompareTechnologiesTool(service)
      const result = await tool.execute({
        context: { names: ['DORA metrics', 'Passkeys'] },
      })
      expect((result as { entries: unknown[] }).entries).toBeDefined()
      expect((result as { entries: unknown[] }).entries.length).toBeGreaterThan(0)
    })

    it('no-result path — unknown tech listed in notFound', async () => {
      const tool = createCompareTechnologiesTool(service)
      const result = await tool.execute({
        context: { names: ['DORA metrics', 'xyzzy123notreal'] },
      })
      expect((result as { notFound?: string[] }).notFound).toContain(
        'xyzzy123notreal'
      )
    })

    it('accepts more than two names', async () => {
      const tool = createCompareTechnologiesTool(service)
      const result = await tool.execute({
        context: { names: ['DORA metrics', 'Passkeys', 'Context engineering'] },
      })
      expect((result as { entries: unknown[] }).entries.length).toBe(3)
    })
  })
})

describe('getTrendingTechnologies tool', () => {
  it('happy path — returns trending array', async () => {
    const tool = createGetTrendingTechnologiesTool(service)
    const result = await tool.execute({ context: {} })
    expect(result).toHaveProperty('trending')
    expect(Array.isArray((result as { trending: unknown[] }).trending)).toBe(true)
  })

  it('filters by direction=rising', async () => {
    const tool = createGetTrendingTechnologiesTool(service)
    const result = await tool.execute({ context: { direction: 'rising', limit: 5 } })
    const trending = (result as { trending: Array<{ direction: string }> }).trending
    trending.forEach((e) => expect(e.direction).toBe('rising'))
  })
})

describe('getTechnologyRiskScore tool', () => {
  it('happy path — returns risk score for Docker', async () => {
    const tool = createGetTechnologyRiskScoreTool(service)
    const result = await tool.execute({ context: { name: 'Docker' } })
    expect(result).not.toBeNull()
    expect((result as { name: string }).name).toBe('Docker')
    expect(typeof (result as { riskScore: number }).riskScore).toBe('number')
  })

  it('returns null for unknown technology', async () => {
    const tool = createGetTechnologyRiskScoreTool(service)
    const result = await tool.execute({ context: { name: 'xyzzy123notreal' } })
    expect(result).toBeNull()
  })
})

describe('draftADR tool', () => {
  it('happy path — returns markdown and options', async () => {
    const tool = createDraftADRTool(service)
    const result = await tool.execute({
      context: {
        title: 'Select orchestration platform',
        options: [{ name: 'Kubernetes' }, { name: 'Docker' }],
      },
    })
    expect((result as { markdown: string }).markdown).toContain('Select orchestration platform')
    expect((result as { options: unknown[] }).options).toHaveLength(2)
  })
})

describe('getMigrationRoadmap tool', () => {
  it('happy path — returns roadmap with summary', async () => {
    const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
    if (holdEntries.length === 0) return
    const tool = createGetMigrationRoadmapTool(service)
    const result = await tool.execute({
      context: { technologies: [holdEntries[0].name] },
    })
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('roadmap')
  })

  it('returns empty roadmap for all-healthy stack', async () => {
    const adoptEntries = service.listByRingAndQuadrant({ ring: 'adopt' })
    const tool = createGetMigrationRoadmapTool(service)
    const result = await tool.execute({
      context: { technologies: adoptEntries.slice(0, 2).map((e) => e.name) },
    })
    expect((result as { roadmap: unknown[] }).roadmap).toHaveLength(0)
  })
})
