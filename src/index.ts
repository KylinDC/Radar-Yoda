import { MCPServer } from '@mastra/mcp'
import { buildRadarIndex } from './dataLoader.js'
import { RadarService } from './radarService.js'
import {
  createSearchTechnologyTool,
  createGetTechnologyHistoryTool,
  createFindAlternativesTool,
  createListByRingAndQuadrantTool,
  createCompareTechnologiesTool,
  createAuditTechStackTool,
} from './tools.js'

async function main() {
  const index = await buildRadarIndex()
  const service = new RadarService(index)

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
    },
  })

  await server.startStdio()
}

main().catch(console.error)
