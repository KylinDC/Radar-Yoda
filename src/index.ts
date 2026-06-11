import { MCPServer } from '@mastra/mcp'
import { buildRadarIndex } from './dataLoader.js'
import { RadarService } from './radarService.js'
import { HttpExternalDataFetcher } from './externalDataFetcher.js'
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
} from './tools.js'

async function main() {
  const index = await buildRadarIndex()
  const fetcher = new HttpExternalDataFetcher()
  const service = new RadarService(index, fetcher)

  const server = new MCPServer({
    name: 'tech-radar-advisor',
    version: '0.0.1',
    tools: {
      searchTechnology: createSearchTechnologyTool(service),
      getTechnologyHistory: createGetTechnologyHistoryTool(service),
      findAlternatives: createFindAlternativesTool(service),
      listByRingAndQuadrant: createListByRingAndQuadrantTool(service),
      compareTechnologies: createCompareTechnologiesTool(service),
      auditTechStack: createAuditTechStackTool(service),
      getTrendingTechnologies: createGetTrendingTechnologiesTool(service),
      getTechnologyRiskScore: createGetTechnologyRiskScoreTool(service),
      draftADR: createDraftADRTool(service),
      getMigrationRoadmap: createGetMigrationRoadmapTool(service),
    },
  })

  await server.startStdio()
}

main().catch(console.error)
