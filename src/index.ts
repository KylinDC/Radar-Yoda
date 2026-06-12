#!/usr/bin/env node
import http from 'node:http'
import { randomUUID } from 'node:crypto'
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
import { isRateLimited } from './rateLimiter.js'

const MCP_PATH = '/mcp'
const port = parseInt(process.env.PORT ?? '3000', 10)

async function main() {
  const index = await buildRadarIndex()
  const fetcher = new HttpExternalDataFetcher()
  const service = new RadarService(index, fetcher)

  const mcpServer = new MCPServer({
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

  const httpServer = http.createServer(async (req, res) => {
    const ip = req.socket.remoteAddress ?? 'unknown'
    if (isRateLimited(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' })
      res.end(JSON.stringify({ error: 'Too Many Requests' }))
      return
    }

    const url = new URL(req.url ?? '/', `http://localhost:${port}`)

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (url.pathname === MCP_PATH) {
      await mcpServer.startHTTP({
        url,
        httpPath: MCP_PATH,
        req,
        res,
        options: { sessionIdGenerator: () => randomUUID() },
      })
      return
    }

    res.writeHead(404)
    res.end()
  })

  httpServer.listen(port, () => {
    console.error(`Tech Radar Advisor listening on port ${port}`)
    console.error(`MCP endpoint: http://localhost:${port}${MCP_PATH}`)
  })
}

main().catch(console.error)
