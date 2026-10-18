# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                          # run all tests
npx vitest run tests/radarService.test.ts   # run a single test file
npx vitest run -t "case-insensitive"        # run tests matching a name pattern
npm run typecheck                 # type-check without emitting
npm run check                     # biome lint + format check (CI gate)
npm run lint                      # lint only
npm run format                    # auto-format
npm run gen:volumes               # regenerate src/generated/volumes.ts
npm run demo                      # run the Jenkins migration demo script
```

Worker (Cloudflare) — production is https://radar-yoda.121314.best:

```bash
npm run dev                       # wrangler dev on http://127.0.0.1:8787
npm run deploy                    # wrangler deploy
npm run deploy:dry-run            # build the bundle without shipping it
npm run smoke                     # assert a running server answers MCP correctly
npm run smoke -- <url>            # …against a deployment
npm run verify                    # same, but prints responses instead of asserting
```

## Architecture

Four strict layers, no cross-layer imports:

```
DataLoader → RadarIndex ← RadarService ← MCP Tools ← src/worker.ts
```

- **`src/dataLoader.ts`** — normalises the volume JSON into a `RadarIndex`. Filesystem-free: it consumes `VOLUMES` from `src/generated/volumes.ts`, so the same code runs under Node and in workerd.
- **`src/radarService.ts`** — pure business logic class. All ten query methods live here. No I/O except the injected `ExternalDataFetcher`.
- **`src/tools.ts`** — ten `createTool()` factory functions (one per MCP tool), each a thin wrapper that forwards to `RadarService`.
- **`src/worker.ts`** — Worker entry point: builds the index, wires service + tools + rate limiter, and routes `POST /mcp` and `GET /health`.

## Key data facts

- `tech-radar-json-data/` holds 34 JSON volumes (Vol.01 2010 – Vol.34 2026).
- The latest volume is detected dynamically (`Math.max` over all entry volumes) — no hardcoded "34".
- `historyMap` keys are **lowercase** (`entry.name.toLowerCase()`). All lookups must use `.toLowerCase()`.
- `RadarEntry.name` retains original casing for display; `getTechnologyHistory` returns the canonical name from `entries[last].name`, not from the caller's input.
- Vol.34 replaced `"hold"` with `"caution"` — both are valid `Ring` values. `findAlternatives` treats them equivalently as "avoid" rings.
- `searchTechnology` always returns `{ results: RadarEntry[], found: boolean }` — never a raw array.

## Non-obvious design decisions

**Tool names are camelCase, and the `id` is not the name.** Mastra takes the exposed MCP tool name from the **object map key** in `src/worker.ts`, not from the `id:` passed to `createTool` — so despite `id: 'search_technology'`, the tool is exposed as `searchTechnology`. Anything that references a tool by name (descriptions, README, `docs/demo_script.sh`, `.claude/settings.local.json` allowlists) must use the camelCase key.

**`historyMap` vs `ringQuadrantMap` scope:** `historyMap` spans all 34 volumes; `ringQuadrantMap` contains only the latest volume. `findAlternatives` first tries `ringQuadrantMap` (current status), then falls back to `historyMap` (last known entry) for technologies that have been dropped from the latest volume.

**Fuse index scope:** The Fuse.js index is built from the *latest entry per technology* across all volumes (not just Vol.34 entries). This ensures older technologies like Docker (absent from Vol.34) remain searchable.

**Volumes are compiled in, not read from disk.** `scripts/gen-volumes.ts` emits `src/generated/volumes.ts` containing one static JSON import per volume. Workers have no filesystem. Adding a volume means running `npm run gen:volumes` and committing the result; CI fails if the two drift apart. That file is generated — never hand-edit it, and it is excluded from biome.

**`import.meta.url` is patched via `wrangler.jsonc` `define`.** `@mastra/mcp` calls `createRequire(import.meta.url)` at module scope to probe for an optional Datadog tracer. `import.meta.url` is `undefined` in workerd, so that call throws and the whole Worker fails to start. `wrangler.jsonc` substitutes a dummy file URL. The probe is guarded by a try/catch and never actually runs. If the Worker dies at startup with a `createRequire` error, that define has been lost.

**The public hostname is `radar-yoda.121314.best`, and `workers_dev` is `true` only for CI.** The custom domain is configured by `routes` + `custom_domain: true` in `wrangler.jsonc`; wrangler owns the DNS record and TLS certificate, so the zone must live on the same Cloudflare account. `workers_dev` looks redundant but is load-bearing: the zone's security rules answer GitHub Actions runner IPs with 403 *before* the request reaches the Worker (WAF runs at the edge, so the Worker cannot bypass it), and `*.workers.dev` sits outside that zone. The CI smoke test therefore targets `wrangler-action`'s `deployment-url` output — the workers.dev hostname — while `PUBLIC_URL` is used for the job summary and docs. Renaming the hostname means updating three places: `wrangler.jsonc` routes, `PUBLIC_URL` in `.github/workflows/deploy.yml`, and `.mcp.json`.

**MCP runs stateless (`options: { serverless: true }`).** This selects `handleServerlessRequest`, which builds a fresh transport per request with `enableJsonResponse: true`. That avoids both session-affinity bugs when requests land on different isolates and SSE buffering through the `fetch-to-node` adapter. Don't switch to stateful mode without a Durable Object.

**`fetch-to-node` bridges the two worlds.** `toReqRes(request)` turns the Workers `Request` into the Node `req`/`res` that `MCPServer.startHTTP` expects; `toFetchResponse(res)` converts the result back.

**`createTool` import path:** `@mastra/core/tools` — not `@mastra/core`. The framework's root export does not re-export `createTool`.

**`inputSchema` wraps in `context`:** Every tool's Zod `inputSchema` wraps the actual fields inside a `context` object (e.g. `z.object({ context: z.object({ query: z.string() }) })`). This matches how Mastra passes validated input to `execute({ context })`. Tests call `tool.execute({ context: { ... } })` directly.

**Rate limiting uses the Cloudflare binding, not memory.** `wrangler.jsonc` declares a `ratelimits` binding; `CloudflareRateLimiter` wraps it. `InMemoryRateLimiter` (lazy-pruned, no `setInterval`) exists for tests and local use. The period must be 10 or 60 seconds — Cloudflare rejects anything else.

## Biome

- No semicolons, single quotes, 100-column lines — matching the existing code.
- `tech-radar-json-data/`, `src/generated/`, and `.claude/` are excluded: the first two are data, the last is local tool config.
- `tests/**` turns off `noNonNullAssertion`, because vitest's `expect` does not narrow types the way an `assert` would, so `x!` after `expect(x).toBeDefined()` is the idiomatic way to carry the narrowed type forward.
- The config is `biome.jsonc`, not `biome.json`, so that it can carry `//` comments. A plain `biome.json` is parsed as strict JSON: a comment there silently invalidates the whole config and biome falls back to its defaults, which looks like every rule firing at once (the tell is the checked-file count jumping from 22 to 66). Don't add a `biome.json` alongside the `.jsonc`.

## Testing

Tests load real JSON files — no mocks.

| File | Covers |
|---|---|
| `tests/radarService.test.ts` | All ten service methods |
| `tests/tools.test.ts` | The MCP tool layer, calling `tool.execute()` directly |
| `tests/rateLimiter.test.ts` | Both rate limiter implementations |
| `tests/externalDataFetcher.test.ts` | GitHub/CVE fetching and the auth header |
| `tests/volumesManifest.test.ts` | The generated manifest matching the JSON files on disk |

Nothing in the suite executes the Worker bundle. `npm run smoke` is what proves the code actually boots in the Workers runtime, so run it (against `npm run dev`) whenever you touch `src/worker.ts` or `wrangler.jsonc`.

Run a single named test:
```bash
npx vitest run -t "falls back to historyMap"
```
