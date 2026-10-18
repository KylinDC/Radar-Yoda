/**
 * Post-deploy smoke test: drives the deployed Worker with a real MCP client and
 * asserts on the responses. Run it after `wrangler deploy` — it is the only
 * check that proves the Worker actually boots in the Workers runtime, since
 * neither the unit tests nor `wrangler deploy --dry-run` execute the bundle.
 *
 *   npm run smoke -- https://radar-yoda-server.<subdomain>.workers.dev
 *
 * Against a local dev server:
 *   npm run smoke -- http://127.0.0.1:8787
 */
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const base = (process.argv[2] ?? process.env.MCP_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '')

/** A fresh deployment takes a few seconds to answer everywhere — retry, don't fail. */
async function retry<T>(label: string, fn: () => Promise<T>, attempts = 10): Promise<T> {
  let lastError: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (i < attempts) {
        console.log(`${label}: attempt ${i}/${attempts} failed, retrying in 3s…`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
  }
  throw lastError
}

const health = await retry('health', async () => {
  const res = await fetch(`${base}/health`)
  assert.equal(res.status, 200, `GET /health returned ${res.status}`)
  const body = (await res.json()) as { status?: string }
  assert.equal(body.status, 'ok', `GET /health body was ${JSON.stringify(body)}`)
  return body
})
console.log(`health: ${JSON.stringify(health)}`)

const client = new Client({ name: 'radar-yoda-smoke', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)))
console.log(`connected to ${base}/mcp`)

const { tools } = await client.listTools()
assert.equal(tools.length, 10, `expected 10 tools, got ${tools.length}`)
console.log(`tools: ${tools.map((t) => t.name).join(', ')}`)

const search = tools.find((t) => t.name === 'searchTechnology')
assert.ok(search, 'searchTechnology is not exposed')

const result = (await client.callTool({
  name: search.name,
  arguments: { context: { query: 'kubernetes' } },
})) as { isError?: boolean; content: Array<{ text?: string }> }
assert.ok(!result.isError, `searchTechnology errored: ${JSON.stringify(result.content)}`)

const text = result.content.map((c) => c.text ?? '').join('')
assert.match(text, /kubernetes/i, `searchTechnology returned no Kubernetes result: ${text}`)

await client.close()

const missing = await fetch(`${base}/not-a-real-path`)
assert.equal(missing.status, 404, `GET /not-a-real-path returned ${missing.status}`)

console.log(`\nOK — ${base} is serving MCP with ${tools.length} tools`)
