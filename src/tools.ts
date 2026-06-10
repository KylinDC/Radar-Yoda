import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { RadarService } from './radarService.js'

const RingSchema = z.enum(['adopt', 'trial', 'assess', 'hold', 'caution'])
const QuadrantSchema = z.enum([
  'techniques',
  'tools',
  'platforms',
  'languages-and-frameworks',
])

export function createSearchTechnologyTool(service: RadarService) {
  const tool = createTool({
    id: 'search_technology',
    description:
      'Fuzzy-search for a technology by name or description. Returns up to 5 matching entries from the Thoughtworks Tech Radar (latest entry per technology). Optionally filter by ring or quadrant.',
    inputSchema: z.object({
      context: z.object({
        query: z.string().describe('Technology name or keyword'),
        quadrant: QuadrantSchema.optional(),
        ring: RingSchema.optional(),
      }),
    }),
    execute: async ({ context }) => {
      return service.searchTechnology(context)
    },
  })
  return tool
}

export function createGetTechnologyHistoryTool(service: RadarService) {
  const tool = createTool({
    id: 'get_technology_history',
    description:
      'Returns the ring-change history of a technology across all 34 Tech Radar volumes (Vol.01 2010 → Vol.34 2026), sorted oldest to newest.',
    inputSchema: z.object({
      context: z.object({
        name: z.string().describe('Exact technology name'),
      }),
    }),
    execute: async ({ context }) => {
      return service.getTechnologyHistory(context)
    },
  })
  return tool
}

export function createFindAlternativesTool(service: RadarService) {
  const tool = createTool({
    id: 'find_alternatives',
    description:
      'Find Adopt/Trial technologies in the same quadrant as the given technology (Vol.34 only). Intended for migrating away from Hold/Caution technologies, but works for any ring.',
    inputSchema: z.object({
      context: z.object({
        name: z.string().describe('Technology name to find alternatives for'),
      }),
    }),
    execute: async ({ context }) => {
      return service.findAlternatives(context)
    },
  })
  return tool
}

export function createListByRingAndQuadrantTool(service: RadarService) {
  const tool = createTool({
    id: 'list_by_ring_and_quadrant',
    description:
      'List all technologies from the latest Tech Radar (Vol.34) matching the given ring and/or quadrant, sorted by name.',
    inputSchema: z.object({
      context: z.object({
        ring: RingSchema.optional(),
        quadrant: QuadrantSchema.optional(),
      }),
    }),
    execute: async ({ context }) => {
      return service.listByRingAndQuadrant(context)
    },
  })
  return tool
}

export function createAuditTechStackTool(service: RadarService) {
  const tool = createTool({
    id: 'audit_tech_stack',
    description:
      'Call this when the user wants to review, assess, or get a health check of their current tech stack. ' +
      'Given a list of technology names, returns a health report: which are Adopt/Trial (healthy), ' +
      'which need monitoring (Assess), which should be replaced (Hold/Caution) with recommended alternatives, ' +
      'and which are unknown. Use this for architecture reviews or migration planning.',
    inputSchema: z.object({
      context: z.object({
        technologies: z
          .array(z.string())
          .describe('List of technology names to audit'),
      }),
    }),
    execute: async ({ context }) => {
      return service.auditTechStack(context)
    },
  })
  return tool
}

export function createCompareTechnologiesTool(service: RadarService) {
  const tool = createTool({
    id: 'compare_technologies',
    description:
      'Side-by-side comparison of exactly two technologies: their current Vol.34 status and full history across all volumes.',
    inputSchema: z.object({
      context: z.object({
        names: z
          .array(z.string())
          .min(2)
          .describe('Two or more technology names to compare'),
      }),
    }),
    execute: async ({ context }) => {
      return service.compareTechnologies(context)
    },
  })
  return tool
}
