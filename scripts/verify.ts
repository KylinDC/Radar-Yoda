/**
 * Drives a running MCP endpoint with a real MCP client, the same way an MCP
 * client host would. Not part of the test suite — it needs a live server.
 *
 * Against wrangler dev:
 *   npm run dev                  # in one shell
 *   npm run verify
 *
 * Against a deployment:
 *   npm run verify -- https://radar-yoda-server.<subdomain>.workers.dev/mcp
 *
 * Calls the tools by the names returned from listTools(), so it keeps working
 * if tool names change.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = new URL(process.argv[2] ?? process.env.MCP_URL ?? 'http://127.0.0.1:8787/mcp')

const client = new Client({ name: 'verify-mcp', version: '1.0.0' })
const transport = new StreamableHTTPClientTransport(url)

await client.connect(transport)
console.log('connected')

const serverInfo = client.getServerVersion?.()
console.log('server:', JSON.stringify(serverInfo))

const { tools } = await client.listTools()
console.log(`tools (${tools.length}):`)
for (const t of tools) console.log(`  - ${t.name}`)

async function call(name: string, args: Record<string, unknown>) {
  const t0 = Date.now()
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean
    content: Array<{ type: string; text?: string }>
  }
  const ms = Date.now() - t0
  const text = result.content.map((c) => c.text ?? '').join('')
  console.log(`\n=== ${name} (${ms}ms)${result.isError ? ' [isError]' : ''} ===`)
  console.log(text.slice(0, 600))
}

// Names come from listTools() — the exposed name is the camelCase map key in
// worker.ts, not the snake_case `id` set inside createTool.
await call(tools[0].name, { context: { query: 'kubernetes' } })
await call(tools[1].name, { context: { name: 'docker' } })
await call(tools[2].name, { context: { name: 'jenkins' } })

await client.close()
console.log('\nOK — all calls succeeded')
