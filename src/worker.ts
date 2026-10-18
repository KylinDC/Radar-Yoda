import { MCPServer } from '@mastra/mcp'
import { toFetchResponse, toReqRes } from 'fetch-to-node'
import { buildRadarIndex } from './dataLoader.js'
import { HttpExternalDataFetcher } from './externalDataFetcher.js'
import { RadarService } from './radarService.js'
import {
  CloudflareRateLimiter,
  InMemoryRateLimiter,
  type RateLimitBinding,
  type RateLimiter,
} from './rateLimiter.js'
import {
  createAuditTechStackTool,
  createCompareTechnologiesTool,
  createDraftADRTool,
  createFindAlternativesTool,
  createGetMigrationRoadmapTool,
  createGetTechnologyHistoryTool,
  createGetTechnologyRiskScoreTool,
  createGetTrendingTechnologiesTool,
  createListByRingAndQuadrantTool,
  createSearchTechnologyTool,
} from './tools.js'

const MCP_PATH = '/mcp'

export interface Env {
  /** Cloudflare rate limiting binding, configured under `ratelimits` in wrangler.jsonc. */
  RATE_LIMITER?: RateLimitBinding
  /** Optional GitHub token; set with `wrangler secret put GITHUB_TOKEN`. */
  GITHUB_TOKEN?: string
}

/**
 * Startup work — ~30ms, measured against the 1s module-scope budget.
 *
 * This must stay at module scope. Inside `fetch()` it would be billed against
 * the per-request CPU limit, which is 10ms on the free plan.
 */
const index = await buildRadarIndex()

/**
 * Per-isolate caches. Bindings are fixed for the lifetime of an isolate, so
 * `env` is effectively a constant here.
 */
let cachedServer: MCPServer | undefined
let cachedLimiter: RateLimiter | undefined

/**
 * Building the MCPServer and its 10 tools costs ~1ms, so it is cached rather
 * than rebuilt per request. All ten tools share one RadarService.
 */
function createMcpServer(env: Env): MCPServer {
  const service = new RadarService(
    index,
    new HttpExternalDataFetcher(globalThis.fetch, {
      githubToken: env.GITHUB_TOKEN,
    }),
  )

  return new MCPServer({
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
}

function getMcpServer(env: Env): MCPServer {
  cachedServer ??= createMcpServer(env)
  return cachedServer
}

function getRateLimiter(env: Env): RateLimiter {
  // The in-memory limiter must be cached: a fresh one per request would reset
  // its counters and never limit anything.
  cachedLimiter ??= env.RATE_LIMITER
    ? new CloudflareRateLimiter(env.RATE_LIMITER)
    : new InMemoryRateLimiter()
  return cachedLimiter
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // Workers has no socket, so the client IP comes from the CF-Connecting-IP header.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    if (await getRateLimiter(env).isLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
      })
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (url.pathname === MCP_PATH) {
      const { req, res } = toReqRes(request)
      await getMcpServer(env).startHTTP({
        url,
        httpPath: MCP_PATH,
        req,
        res,
        // `serverless: true` selects MCPServer.handleServerlessRequest, which
        // makes a fresh transport per request with enableJsonResponse. Requests
        // are self-contained, so no session state can be lost when consecutive
        // requests land on different isolates, and the response is plain JSON
        // rather than an SSE stream that fetch-to-node would have to buffer.
        options: { serverless: true },
      })
      return toFetchResponse(res)
    }

    return new Response(null, { status: 404 })
  },
}
