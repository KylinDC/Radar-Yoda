# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                          # run all tests
npx vitest run tests/radarService.test.ts   # run a single test file
npx vitest run -t "case-insensitive"        # run tests matching a name pattern
npm run build                     # compile TypeScript to dist/
npm run typecheck                 # type-check without emitting
npm run demo                      # run the Jenkins migration demo script
npm run check                     # biome lint + format check (CI)
npm run lint                      # lint only
npm run format                    # auto-format
```

Server (after build):
```bash
npm start                         # node dist/src/index.js — blocks on stdio
```

## Architecture

Three strict layers, no cross-layer imports:

```
DataLoader → RadarIndex ← RadarService ← MCP Tools (src/index.ts)
```

- **`src/dataLoader.ts`** — reads all JSON files at startup, emits a `RadarIndex`. Never imported by tests directly beyond setup.
- **`src/radarService.ts`** — pure business logic class. All five query methods live here. No I/O.
- **`src/tools.ts`** — five `createTool()` factory functions (one per MCP tool), each a thin wrapper that forwards to `RadarService`.
- **`src/index.ts`** — entry point: builds index, wires service + tools, starts `MCPServer` on stdio.

## Key data facts

- `tech-radar-json-data/` holds 34 JSON volumes (Vol.01 2010 – Vol.34 2026).
- The latest volume is detected dynamically (`Math.max` over all entry volumes) — no hardcoded "34".
- `historyMap` keys are **lowercase** (`entry.name.toLowerCase()`). All lookups must use `.toLowerCase()`.
- `RadarEntry.name` retains original casing for display; `getTechnologyHistory` returns the canonical name from `entries[last].name`, not from the caller's input.
- Vol.34 replaced `"hold"` with `"caution"` — both are valid `Ring` values. `findAlternatives` treats them equivalently as "avoid" rings.
- `searchTechnology` always returns `{ results: RadarEntry[], found: boolean }` — never a raw array.

## Non-obvious design decisions

**`historyMap` vs `ringQuadrantMap` scope:** `historyMap` spans all 34 volumes; `ringQuadrantMap` contains only the latest volume. `findAlternatives` first tries `ringQuadrantMap` (current status), then falls back to `historyMap` (last known entry) for technologies that have been dropped from the latest volume.

**Fuse index scope:** The Fuse.js index is built from the *latest entry per technology* across all volumes (not just Vol.34 entries). This ensures older technologies like Docker (absent from Vol.34) remain searchable.

**`createTool` import path:** `@mastra/core/tools` — not `@mastra/core`. The framework's root export does not re-export `createTool`.

**`inputSchema` wraps in `context`:** Every tool's Zod `inputSchema` wraps the actual fields inside a `context` object (e.g. `z.object({ context: z.object({ query: z.string() }) })`). This matches how Mastra passes validated input to `execute({ context })`. Tests call `tool.execute({ context: { ... } })` directly.

**DATA_DIR resolution:** `dataLoader.ts` detects at runtime whether it is running from `src/` (vitest) or `dist/src/` (production) by checking `existsSync` on the first candidate path. Both resolve to the project-root `tech-radar-json-data/` directory.

## Testing

Tests load real JSON files — no mocks. `tests/radarService.test.ts` covers all five service methods. `tests/tools.test.ts` tests the MCP tool layer by calling `tool.execute()` directly.

Run a single named test:
```bash
npx vitest run -t "falls back to historyMap"
```
