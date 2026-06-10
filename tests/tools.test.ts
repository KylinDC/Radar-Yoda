import { describe, it, expect, beforeAll } from 'vitest'
import { buildRadarIndex } from '../src/dataLoader.js'
import { RadarService } from '../src/radarService.js'
import {
  createSearchTechnologyTool,
  createGetTechnologyHistoryTool,
  createFindAlternativesTool,
  createListByRingAndQuadrantTool,
  createCompareTechnologiesTool,
} from '../src/tools.js'

describe('MCP Tools Integration', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

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
    it('happy path — returns history for Docker', async () => {
      const tool = createGetTechnologyHistoryTool(service)
      const result = await tool.execute({ context: { name: 'Docker' } })
      expect(result).not.toBeNull()
      expect((result as { name: string }).name).toBe('Docker')
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
