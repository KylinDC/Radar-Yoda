import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import type { RadarService } from './radarService.js'
import type { TrendDirection } from './types.js'

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
      'Call this when the user asks about a specific technology, wants to know its current Thoughtworks Tech Radar status, or mentions a technology name you need to look up. ' +
      'Fuzzy-searches the latest radar (Vol.34) and returns up to 5 matching entries. ' +
      'Optionally filter by ring (adopt/trial/assess/hold/caution) or quadrant.',
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
      'Call this when the user asks how a technology has evolved over time, whether its adoption is growing or declining, or wants trend/momentum information. ' +
      'Returns the ring-change history across all 34 Tech Radar volumes (Vol.01 2010 → Vol.34 2026), sorted oldest to newest.',
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
      'Call this when the user asks "what should I use instead of X", wants to migrate away from a Hold or Caution technology, or needs replacement recommendations for a single technology. ' +
      'Returns Adopt/Trial alternatives in the same quadrant (Vol.34). ' +
      'For auditing an entire tech stack at once, use audit_tech_stack instead.',
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
      'Call this when the user asks what technologies Thoughtworks recommends in a specific ring or quadrant — for example "what tools are in Adopt?" or "show me all Assess-stage platforms". ' +
      'Returns all matching technologies from Vol.34 sorted by name.',
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
      'Call this when the user wants to compare two or more specific technologies head-to-head — for example "React vs Svelte" or "Kafka vs Pulsar". ' +
      'Returns their current Vol.34 ring status and full history side by side. ' +
      'For evaluating an existing tech stack rather than comparing candidates, use audit_tech_stack instead.',
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

export function createGetTechnologyRiskScoreTool(service: RadarService) {
  const tool = createTool({
    id: 'get_technology_risk_score',
    description:
      'Call this when the user wants to assess the risk of using a specific technology — combining radar ring position, GitHub maintenance health, and known CVE security vulnerabilities into a 0–10 composite score. ' +
      'Also call this before making migration decisions to quantify urgency. ' +
      'Note: GitHub health data is sourced via name-based search and may not always resolve to the canonical repository. ' +
      'Returns null if the technology is not found in any radar volume.',
    inputSchema: z.object({
      context: z.object({
        name: z.string().describe('Technology name to score'),
      }),
    }),
    execute: async ({ context }) => {
      return service.getTechnologyRiskScore(context)
    },
  })
  return tool
}

export function createDraftADRTool(service: RadarService) {
  const tool = createTool({
    id: 'draft_adr',
    description:
      'Call this when the user wants to document a technology decision, compare candidate technologies for an ADR (Architecture Decision Record), or generate a structured decision document. ' +
      'Given a decision title and 2+ technology options, returns a complete Markdown ADR draft with radar ring status, history, and trend evidence pre-filled for each option. ' +
      'The TL/TP only needs to fill in the Decision and Consequences sections.',
    inputSchema: z.object({
      context: z.object({
        title: z.string().describe('ADR title, e.g. "Select container orchestration platform"'),
        options: z
          .array(
            z.object({
              name: z.string().describe('Technology name'),
              description: z.string().optional().describe('Optional TL note about this option'),
            })
          )
          .min(2),
        context: z.string().optional().describe('Problem statement or background context'),
      }),
    }),
    execute: async ({ context }) => {
      return service.draftADR(context)
    },
  })
  return tool
}

export function createGetMigrationRoadmapTool(service: RadarService) {
  const tool = createTool({
    id: 'get_migration_roadmap',
    description:
      'Call this when the user wants a prioritised migration plan for their tech stack, asks "what should we migrate first", or needs an ordered list of tech debt to address. ' +
      'Combines radar ring status and composite risk scores (GitHub health + CVE data) to rank technologies by urgency. ' +
      'Returns only technologies that need action (hold/caution → migrate; assess → monitor); skips healthy ones. ' +
      'For auditing without prioritisation, use audit_tech_stack instead.',
    inputSchema: z.object({
      context: z.object({
        technologies: z
          .array(z.string())
          .min(1)
          .describe('List of technology names to generate a migration roadmap for'),
      }),
    }),
    execute: async ({ context }) => {
      return service.getMigrationRoadmap(context)
    },
  })
  return tool
}

export function createGetTrendingTechnologiesTool(service: RadarService) {
  const tool = createTool({
    id: 'get_trending_technologies',
    description:
      'Call this when the user asks which technologies are gaining or losing momentum, wants to know the tech landscape trend, or asks "what is rising / falling in the radar?". ' +
      'Analyses all 34 radar volumes to classify technologies as rising (moving toward Adopt), falling (moving toward Hold/Caution), or stable. ' +
      'Optionally filter by quadrant or direction.',
    inputSchema: z.object({
      context: z.object({
        quadrant: QuadrantSchema.optional(),
        direction: z.enum(['rising', 'falling', 'stable', 'all']).optional(),
        limit: z.number().int().positive().optional(),
      }),
    }),
    execute: async ({ context }) => {
      return service.getTrendingTechnologies(context)
    },
  })
  return tool
}
