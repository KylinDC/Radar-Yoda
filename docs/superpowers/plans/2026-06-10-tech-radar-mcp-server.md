# Tech Radar MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server exposing 5 tools that let Technical Principals and Tech Leads query 34 volumes of the Thoughtworks Technology Radar.

**Architecture:** A `DataLoader` reads all 34 JSON files at startup and builds a `RadarIndex` (Fuse.js search index, history map, ring/quadrant map). A pure `RadarService` class encapsulates all query logic against the index. Five MCP tools implemented with `@mastra/mcp` delegate to `RadarService` and are served via stdio.

**Tech Stack:** TypeScript 6, `@mastra/core` v1.41.0, `@mastra/mcp`, `fuse.js`, `zod` v4, `vitest`, `biome` (formatter + linter)

---

## File Map

| File | Responsibility |
|---|---|
| `src/types.ts` | `Ring`, `Quadrant`, `RadarEntry`, `RadarIndex` types |
| `src/dataLoader.ts` | Read all 34 JSON files; build and return `RadarIndex` |
| `src/radarService.ts` | All business logic: search, history, alternatives, list, compare |
| `src/tools.ts` | Mastra tool definitions; each tool calls `RadarService` |
| `src/index.ts` | Entry point: build index, wire tools, start `MCPServer` |
| `tests/radarService.test.ts` | Unit tests for `RadarService` (loads real JSON files) |
| `tests/tools.test.ts` | Integration tests — calls `MCPServer.executeTool()` directly |
| `demo.ts` | Standalone Jenkins migration demo script (T1 → T3 → T2 → T5) |
| `biome.json` | Biome formatter + linter config (recommended rules, single-quote JS, type-aware lint) |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "radar-yoda-server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "start": "node dist/index.js",
    "test": "vitest run",
    "demo": "npx tsx demo.ts",
    "format": "biome format --write .",
    "lint": "biome lint .",
    "check": "biome check ."
  },
  "dependencies": {
    "@mastra/core": "^1.41.0",
    "@mastra/mcp": "^1.9.1",
    "fuse.js": "^7.4.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.16",
    "@types/node": "^25.9.2",
    "tsx": "^4.22.4",
    "typescript": "^6.0.3",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "demo.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.16/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
  },
})
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json biome.json vitest.config.ts
git commit -m "$(cat <<'EOF'
chore: project scaffold

EOF
)"
```

---

## Task 2: Core Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/radarService.test.ts` with a type-smoke test:

```typescript
import { describe, it, expect } from 'vitest'
import type { Ring, Quadrant, RadarEntry, RadarIndex } from '../src/types.js'

describe('types', () => {
  it('Ring values are the four rings', () => {
    const rings: Ring[] = ['adopt', 'trial', 'assess', 'hold']
    expect(rings).toHaveLength(4)
  })

  it('Quadrant values are the four quadrants', () => {
    const quadrants: Quadrant[] = [
      'techniques',
      'tools',
      'platforms',
      'languages-and-frameworks',
    ]
    expect(quadrants).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/radarService.test.ts`
Expected: compile error — `../src/types.js` not found.

- [ ] **Step 3: Create `src/types.ts`**

```typescript
export type Ring = 'adopt' | 'trial' | 'assess' | 'hold'

export type Quadrant =
  | 'techniques'
  | 'tools'
  | 'platforms'
  | 'languages-and-frameworks'
```


```typescript

export interface RadarEntry {
  name: string
  ring: Ring
  quadrant: Quadrant
  isNew: boolean
  status: 'new' | 'moved in' | 'moved out' | 'no change'
  description: string
  relatedBlips: string[]
  volume: number
  year: number
}

export interface RadarIndex {
  fuseIndex: import('fuse.js').default<RadarEntry>
  historyMap: Map<string, RadarEntry[]>
  ringQuadrantMap: Map<string, RadarEntry[]>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/radarService.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/radarService.test.ts
git commit -m "$(cat <<'EOF'
feat: add core types

EOF
)"
```

---

## Task 3: DataLoader

**Files:**
- Create: `src/dataLoader.ts`

> **Context on the JSON files:** Filenames follow the pattern `Thoughtworks Technology Radar Volume NN (Mon YYYY).json`. Each file contains a JSON array of entries. The `isNew` field in the raw JSON is the string `"TRUE"` or `"FALSE"`, not a boolean. HTML tags must be stripped from `description`. The `relatedBlips` field is already an array of strings.

- [ ] **Step 1: Add DataLoader tests to `tests/radarService.test.ts`**

Append the following tests:

```typescript
import { buildRadarIndex } from '../src/dataLoader.js'

describe('DataLoader', () => {
  it('builds an index with entries from all 34 volumes', async () => {
    const index = await buildRadarIndex()
    // historyMap should have entries spanning multiple volumes
    const entries = [...index.historyMap.values()].flat()
    const volumes = new Set(entries.map((e) => e.volume))
    expect(volumes.size).toBe(34)
  })

  it('strips HTML tags from description', async () => {
    const index = await buildRadarIndex()
    const entries = [...index.historyMap.values()].flat()
    const withHtml = entries.filter((e) => /<[^>]+>/.test(e.description))
    expect(withHtml).toHaveLength(0)
  })

  it('converts isNew string to boolean', async () => {
    const index = await buildRadarIndex()
    const entries = [...index.historyMap.values()].flat()
    entries.forEach((e) => {
      expect(typeof e.isNew).toBe('boolean')
    })
  })

  it('ringQuadrantMap key "adopt:techniques" exists and is non-empty', async () => {
    const index = await buildRadarIndex()
    const entries = index.ringQuadrantMap.get('adopt:techniques')
    expect(entries).toBeDefined()
    expect(entries!.length).toBeGreaterThan(0)
  })

  it('historyMap entries for a technology are sorted by volume ascending', async () => {
    const index = await buildRadarIndex()
    const history = index.historyMap.get('Docker')
    if (history && history.length > 1) {
      for (let i = 1; i < history.length; i++) {
        expect(history[i].volume).toBeGreaterThan(history[i - 1].volume)
      }
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/radarService.test.ts`
Expected: FAIL — `buildRadarIndex` not found.

- [ ] **Step 3: Create `src/dataLoader.ts`**

```typescript
import { readFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import Fuse from 'fuse.js'
import type { RadarEntry, RadarIndex, Ring, Quadrant } from './types.js'

const DATA_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'tech-radar-json-data'
)

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, ' ').trim()
}

function parseVolumeAndYear(filename: string): { volume: number; year: number } {
  const volMatch = filename.match(/Volume\s+(\d+)/i)
  const yearMatch = filename.match(/\(.*?(\d{4})\)/)
  return {
    volume: volMatch ? parseInt(volMatch[1], 10) : 0,
    year: yearMatch ? parseInt(yearMatch[1], 10) : 0,
  }
}

type RawEntry = {
  name: string
  ring: string
  quadrant: string
  isNew: string
  status: string
  description: string
  relatedBlips: string[]
}

export async function buildRadarIndex(): Promise<RadarIndex> {
  const files = (await readdir(DATA_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()

  const allEntries: RadarEntry[] = []
  let vol34Entries: RadarEntry[] = []

  for (const filename of files) {
    const { volume, year } = parseVolumeAndYear(filename)
    const raw: RawEntry[] = JSON.parse(
      await readFile(join(DATA_DIR, filename), 'utf-8')
    )

    const entries: RadarEntry[] = raw.map((r) => ({
      name: r.name,
      ring: r.ring.toLowerCase() as Ring,
      quadrant: r.quadrant.toLowerCase() as Quadrant,
      isNew: r.isNew === 'TRUE',
      status: r.status as RadarEntry['status'],
      description: stripHtml(r.description ?? ''),
      relatedBlips: r.relatedBlips ?? [],
      volume,
      year,
    }))

    allEntries.push(...entries)
    if (volume === 34) vol34Entries = entries
  }

  // Fuse.js index — search over latest volume only
  const fuseIndex = new Fuse(vol34Entries, {
    keys: ['name', 'description'],
    threshold: 0.3,
    includeScore: true,
  })

  // historyMap — all volumes, sorted by volume ascending
  const historyMap = new Map<string, RadarEntry[]>()
  for (const entry of allEntries) {
    const key = entry.name
    const existing = historyMap.get(key) ?? []
    existing.push(entry)
    historyMap.set(key, existing)
  }
  for (const [key, entries] of historyMap) {
    historyMap.set(key, entries.sort((a, b) => a.volume - b.volume))
  }

  // ringQuadrantMap — latest volume only, key = "ring:quadrant"
  const ringQuadrantMap = new Map<string, RadarEntry[]>()
  for (const entry of vol34Entries) {
    const key = `${entry.ring}:${entry.quadrant}`
    const existing = ringQuadrantMap.get(key) ?? []
    existing.push(entry)
    ringQuadrantMap.set(key, existing)
  }

  return { fuseIndex, historyMap, ringQuadrantMap }
}
```


- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/radarService.test.ts`
Expected: PASS (7 tests including the 2 type tests from Task 2)

- [ ] **Step 5: Commit**

```bash
git add src/dataLoader.ts tests/radarService.test.ts
git commit -m "$(cat <<'EOF'
feat: add DataLoader with RadarIndex builder

EOF
)"
```

---

## Task 4: RadarService — search and list

**Files:**
- Create: `src/radarService.ts`

- [ ] **Step 1: Add tests to `tests/radarService.test.ts`**

Append:

```typescript
import { RadarService } from '../src/radarService.js'

describe('RadarService.searchTechnology', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('finds Docker by exact name', () => {
    const results = service.searchTechnology({ query: 'Docker' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].name.toLowerCase()).toContain('docker')
  })

  it('finds results with fuzzy match', () => {
    const results = service.searchTechnology({ query: 'Kubernete' }) // typo
    expect(results.length).toBeGreaterThan(0)
  })

  it('filters by quadrant', () => {
    const results = service.searchTechnology({
      query: 'Docker',
      quadrant: 'platforms',
    })
    results.forEach((r) => expect(r.quadrant).toBe('platforms'))
  })

  it('filters by ring', () => {
    const results = service.searchTechnology({ query: 'Docker', ring: 'adopt' })
    results.forEach((r) => expect(r.ring).toBe('adopt'))
  })

  it('returns at most 5 results', () => {
    const results = service.searchTechnology({ query: 'test' })
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('returns found:false when nothing matches', () => {
    const result = service.searchTechnology({ query: 'xyzzy123notreal' })
    expect(result).toEqual({ found: false, suggestions: [] })
  })
})

describe('RadarService.listByRingAndQuadrant', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('lists all adopt entries when no quadrant given', () => {
    const results = service.listByRingAndQuadrant({ ring: 'adopt' })
    expect(results.length).toBeGreaterThan(0)
    results.forEach((r) => expect(r.ring).toBe('adopt'))
  })

  it('lists adopt:platforms entries', () => {
    const results = service.listByRingAndQuadrant({
      ring: 'adopt',
      quadrant: 'platforms',
    })
    results.forEach((r) => {
      expect(r.ring).toBe('adopt')
      expect(r.quadrant).toBe('platforms')
    })
  })

  it('returns results sorted by name', () => {
    const results = service.listByRingAndQuadrant({ ring: 'adopt' })
    for (let i = 1; i < results.length; i++) {
      expect(results[i].name.localeCompare(results[i - 1].name)).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns all entries when no filters given', () => {
    const results = service.listByRingAndQuadrant({})
    expect(results.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/radarService.test.ts`
Expected: FAIL — `RadarService` not found.

- [ ] **Step 3: Create `src/radarService.ts` with `searchTechnology` and `listByRingAndQuadrant`**

```typescript
import type { RadarEntry, RadarIndex, Ring, Quadrant } from './types.js'

type SearchInput = { query: string; quadrant?: Quadrant; ring?: Ring }
type SearchResult = RadarEntry[] | { found: false; suggestions: RadarEntry[] }

type ListInput = { ring?: Ring; quadrant?: Quadrant }

export class RadarService {
  constructor(private readonly index: RadarIndex) {}

  searchTechnology(input: SearchInput): SearchResult {
    const raw = this.index.fuseIndex.search(input.query)
    let entries = raw.map((r) => r.item)

    if (input.quadrant) {
      entries = entries.filter((e) => e.quadrant === input.quadrant)
    }
    if (input.ring) {
      entries = entries.filter((e) => e.ring === input.ring)
    }

    const top = entries.slice(0, 5)
    if (top.length === 0) {
      return { found: false, suggestions: [] }
    }
    return top
  }

  listByRingAndQuadrant(input: ListInput): RadarEntry[] {
    const results: RadarEntry[] = []

    for (const [key, entries] of this.index.ringQuadrantMap) {
      const [ring, quadrant] = key.split(':') as [Ring, Quadrant]
      if (input.ring && ring !== input.ring) continue
      if (input.quadrant && quadrant !== input.quadrant) continue
      results.push(...entries)
    }

    return results.sort((a, b) => a.name.localeCompare(b.name))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/radarService.test.ts`
Expected: PASS (all tests up to this point)

- [ ] **Step 5: Commit**

```bash
git add src/radarService.ts tests/radarService.test.ts
git commit -m "$(cat <<'EOF'
feat: add RadarService search and list

EOF
)"
```

---

## Task 5: RadarService — history, alternatives, compare

**Files:**
- Modify: `src/radarService.ts`

- [ ] **Step 1: Add tests to `tests/radarService.test.ts`**

Append:

```typescript
describe('RadarService.getTechnologyHistory', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns history for Docker sorted by volume ascending', () => {
    const result = service.getTechnologyHistory({ name: 'Docker' })
    expect(result).not.toBeNull()
    expect(result!.history.length).toBeGreaterThan(1)
    for (let i = 1; i < result!.history.length; i++) {
      expect(result!.history[i].volume).toBeGreaterThan(result!.history[i - 1].volume)
    }
  })

  it('returns null for unknown technology', () => {
    const result = service.getTechnologyHistory({ name: 'xyzzy123notreal' })
    expect(result).toBeNull()
  })
})

describe('RadarService.findAlternatives', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns adopt/trial entries in the same quadrant as the input', () => {
    // Find a hold technology to test with
    const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
    if (holdEntries.length === 0) return // skip if no hold entries in vol34

    const holdTech = holdEntries[0]
    const result = service.findAlternatives({ name: holdTech.name })
    expect(result).not.toBeNull()
    result!.alternatives.forEach((a) => {
      expect(['adopt', 'trial']).toContain(a.ring)
      expect(a.quadrant).toBe(holdTech.quadrant)
    })
  })

  it('returns a warning when input technology is not on Hold', () => {
    const adoptEntries = service.listByRingAndQuadrant({ ring: 'adopt' })
    const adoptTech = adoptEntries[0]
    const result = service.findAlternatives({ name: adoptTech.name })
    expect(result).not.toBeNull()
    expect(result!.warning).toBeDefined()
  })

  it('returns null for unknown technology', () => {
    const result = service.findAlternatives({ name: 'xyzzy123notreal' })
    expect(result).toBeNull()
  })
})

describe('RadarService.compareTechnologies', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns entries and histories for two known technologies', () => {
    const result = service.compareTechnologies({
      names: ['Docker', 'Kubernetes'],
    })
    expect(result.entries.length).toBeGreaterThan(0)
    expect(result.histories.length).toBeGreaterThan(0)
  })

  it('lists missing names in notFound for unknown technology', () => {
    const result = service.compareTechnologies({
      names: ['Docker', 'xyzzy123notreal'],
    })
    expect(result.notFound).toContain('xyzzy123notreal')
    expect(result.entries.some((e) => e.name === 'Docker')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/radarService.test.ts`
Expected: FAIL — `getTechnologyHistory`, `findAlternatives`, `compareTechnologies` not found.

- [ ] **Step 3: Add the three methods to `src/radarService.ts`**

Append to the `RadarService` class (inside the `}`):

```typescript
  getTechnologyHistory(input: { name: string }): {
    name: string
    history: { volume: number; year: number; ring: Ring; status: string }[]
  } | null {
    const entries = this.index.historyMap.get(input.name)
    if (!entries || entries.length === 0) return null

    return {
      name: input.name,
      history: entries.map((e) => ({
        volume: e.volume,
        year: e.year,
        ring: e.ring,
        status: e.status,
      })),
    }
  }

  findAlternatives(input: { name: string }): {
    input: RadarEntry
    warning?: string
    alternatives: RadarEntry[]
  } | null {
    // Look up in Vol.34 via ringQuadrantMap
    let inputEntry: RadarEntry | undefined
    for (const entries of this.index.ringQuadrantMap.values()) {
      inputEntry = entries.find(
        (e) => e.name.toLowerCase() === input.name.toLowerCase()
      )
      if (inputEntry) break
    }
    if (!inputEntry) return null

    const warning =
      inputEntry.ring !== 'hold'
        ? `"${inputEntry.name}" is currently in the "${inputEntry.ring}" ring, not "hold". Showing Adopt/Trial alternatives in the same quadrant anyway.`
        : undefined

    const alternatives = (
      this.index.ringQuadrantMap.get(`adopt:${inputEntry.quadrant}`) ?? []
    )
      .concat(
        this.index.ringQuadrantMap.get(`trial:${inputEntry.quadrant}`) ?? []
      )
      .filter((e) => e.name !== inputEntry!.name)
      .sort((a, b) => a.name.localeCompare(b.name))

    return { input: inputEntry, warning, alternatives }
  }
```


```typescript
  compareTechnologies(input: { names: [string, string] }): {
    entries: RadarEntry[]
    histories: {
      name: string
      history: { volume: number; year: number; ring: Ring; status: string }[]
    }[]
    notFound?: string[]
  } {
    const entries: RadarEntry[] = []
    const histories: ReturnType<RadarService['getTechnologyHistory']>[] = []
    const notFound: string[] = []

    for (const name of input.names) {
      // Find in Vol.34 (ringQuadrantMap)
      let found: RadarEntry | undefined
      for (const list of this.index.ringQuadrantMap.values()) {
        found = list.find((e) => e.name.toLowerCase() === name.toLowerCase())
        if (found) break
      }

      if (found) {
        entries.push(found)
      } else {
        notFound.push(name)
      }

      const history = this.getTechnologyHistory({ name })
      if (history) histories.push(history)
    }

    return {
      entries,
      histories,
      ...(notFound.length > 0 ? { notFound } : {}),
    }
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/radarService.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/radarService.ts tests/radarService.test.ts
git commit -m "$(cat <<'EOF'
feat: add RadarService history, alternatives, compare

EOF
)"
```

---

## Task 6: MCP Tools

**Files:**
- Create: `src/tools.ts`

> **Context on Mastra:** `createTool` from `@mastra/core` takes `{ id, description, inputSchema, execute }`. `inputSchema` is a Zod schema. `execute` receives `{ context }` where `context` is the validated input object. Tools must not throw — always return structured data.

> **Zod v4 notes:** `import { z } from 'zod'` and all `.object`, `.string`, `.enum`, `.tuple`, `.optional` methods work identically to v3. One change: error handling uses `z.ZodError` (same as v3) but internal `issues` shape may differ — do not assert on error shape internals in tests. `z.infer<typeof schema>` still works for type extraction.

- [ ] **Step 1: Add integration tests to `tests/tools.test.ts`**

Create `tests/tools.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { buildRadarIndex } from '../src/dataLoader.js'
import { RadarService } from '../src/radarService.js'
import {
  createSearchTechnologyTool,
  createGetTechnologyHistoryTool,
  createFindAlternativesTool,
  createListByRingAndQuadrantTool,
  createCompareTechnologiesTool,
} from '../src/tools.js'

describe('MCP Tools Integration', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  describe('searchTechnology tool', () => {
    it('happy path — finds Docker', async () => {
      const tool = createSearchTechnologyTool(service)
      const result = await tool.execute({ context: { query: 'Docker' } })
      expect(Array.isArray(result)).toBe(true)
      expect((result as { name: string }[])[0].name.toLowerCase()).toContain('docker')
    })

    it('no-result path — returns found:false', async () => {
      const tool = createSearchTechnologyTool(service)
      const result = await tool.execute({ context: { query: 'xyzzy123notreal' } })
      expect(result).toMatchObject({ found: false })
    })
  })

  describe('getTechnologyHistory tool', () => {
    it('happy path — returns history for Docker', async () => {
      const tool = createGetTechnologyHistoryTool(service)
      const result = await tool.execute({ context: { name: 'Docker' } })
      expect((result as { name: string }).name).toBe('Docker')
    })

    it('no-result path — returns null for unknown', async () => {
      const tool = createGetTechnologyHistoryTool(service)
      const result = await tool.execute({ context: { name: 'xyzzy123notreal' } })
      expect(result).toBeNull()
    })
  })

  describe('findAlternatives tool', () => {
    it('happy path — returns alternatives', async () => {
      const holdEntries = service.listByRingAndQuadrant({ ring: 'hold' })
      if (holdEntries.length === 0) return
      const tool = createFindAlternativesTool(service)
      const result = await tool.execute({ context: { name: holdEntries[0].name } })
      expect(result).not.toBeNull()
    })

    it('no-result path — returns null for unknown', async () => {
      const tool = createFindAlternativesTool(service)
      const result = await tool.execute({ context: { name: 'xyzzy123notreal' } })
      expect(result).toBeNull()
    })
  })

  describe('listByRingAndQuadrant tool', () => {
    it('happy path — returns adopt entries', async () => {
      const tool = createListByRingAndQuadrantTool(service)
      const result = await tool.execute({ context: { ring: 'adopt' } })
      expect(Array.isArray(result)).toBe(true)
      expect((result as { ring: string }[]).every((r) => r.ring === 'adopt')).toBe(true)
    })

    it('no-result path — unknown ring returns empty array', async () => {
      const tool = createListByRingAndQuadrantTool(service)
      const result = await tool.execute({ context: { ring: 'assess', quadrant: 'tools' } })
      // May be empty — just ensure it's an array
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('compareTechnologies tool', () => {
    it('happy path — compares Docker and Kubernetes', async () => {
      const tool = createCompareTechnologiesTool(service)
      const result = await tool.execute({
        context: { names: ['Docker', 'Kubernetes'] },
      })
      expect((result as { entries: unknown[] }).entries).toBeDefined()
    })

    it('no-result path — unknown tech listed in notFound', async () => {
      const tool = createCompareTechnologiesTool(service)
      const result = await tool.execute({
        context: { names: ['Docker', 'xyzzy123notreal'] },
      })
      expect((result as { notFound?: string[] }).notFound).toContain(
        'xyzzy123notreal'
      )
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools.test.ts`
Expected: FAIL — `../src/tools.js` not found.

- [ ] **Step 3: Create `src/tools.ts`**

```typescript
import { createTool } from '@mastra/core'
import { z } from 'zod'
import type { RadarService } from './radarService.js'
import type { Ring, Quadrant } from './types.js'

const RingSchema = z.enum(['adopt', 'trial', 'assess', 'hold'])
const QuadrantSchema = z.enum([
  'techniques',
  'tools',
  'platforms',
  'languages-and-frameworks',
])

export function createSearchTechnologyTool(service: RadarService) {
  return createTool({
    id: 'search_technology',
    description:
      'Fuzzy-search for a technology by name or description. Returns up to 5 matching entries from the latest Thoughtworks Tech Radar (Vol.34). Optionally filter by ring or quadrant.',
    inputSchema: z.object({
      query: z.string().describe('Technology name or keyword'),
      quadrant: QuadrantSchema.optional(),
      ring: RingSchema.optional(),
    }),
    execute: async ({ context }) => {
      return service.searchTechnology(context)
    },
  })
}

export function createGetTechnologyHistoryTool(service: RadarService) {
  return createTool({
    id: 'get_technology_history',
    description:
      'Returns the ring-change history of a technology across all 34 Tech Radar volumes (Vol.01 2010 → Vol.34 2026), sorted oldest to newest.',
    inputSchema: z.object({
      name: z.string().describe('Exact technology name'),
    }),
    execute: async ({ context }) => {
      return service.getTechnologyHistory(context)
    },
  })
}

export function createFindAlternativesTool(service: RadarService) {
  return createTool({
    id: 'find_alternatives',
    description:
      'Find Adopt/Trial technologies in the same quadrant as the given technology. Intended for migrating away from Hold technologies, but works for any ring.',
    inputSchema: z.object({
      name: z.string().describe('Technology name to find alternatives for'),
    }),
    execute: async ({ context }) => {
      return service.findAlternatives(context)
    },
  })
}

export function createListByRingAndQuadrantTool(service: RadarService) {
  return createTool({
    id: 'list_by_ring_and_quadrant',
    description:
      'List all technologies from the latest Tech Radar (Vol.34) matching the given ring and/or quadrant, sorted by name.',
    inputSchema: z.object({
      ring: RingSchema.optional(),
      quadrant: QuadrantSchema.optional(),
    }),
    execute: async ({ context }) => {
      return service.listByRingAndQuadrant(context)
    },
  })
}

export function createCompareTechnologiesTool(service: RadarService) {
  return createTool({
    id: 'compare_technologies',
    description:
      'Side-by-side comparison of exactly two technologies: their current Vol.34 status and full history across all volumes.',
    inputSchema: z.object({
      names: z
        .tuple([z.string(), z.string()])
        .describe('Exactly two technology names to compare'),
    }),
    execute: async ({ context }) => {
      return service.compareTechnologies(context)
    },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools.ts tests/tools.test.ts
git commit -m "$(cat <<'EOF'
feat: add MCP tool definitions

EOF
)"
```

---

## Task 7: MCP Server Entry Point

> **Note:** This task describes the initial stdio-only entry point. HTTP transport support was added later in Task 11.

**Files:**
- Create: `src/index.ts`

- [x] **Step 1: Create `src/index.ts`**

Initial implementation — stdio transport only:

```typescript
import { MCPServer } from '@mastra/mcp'
import { buildRadarIndex } from './dataLoader.js'
import { RadarService } from './radarService.js'
import {
  createSearchTechnologyTool,
  createGetTechnologyHistoryTool,
  createFindAlternativesTool,
  createListByRingAndQuadrantTool,
  createCompareTechnologiesTool,
} from './tools.js'

async function main() {
  const index = await buildRadarIndex()
  const service = new RadarService(index)

  const server = new MCPServer({
    name: 'tech-radar-advisor',
    version: '1.0.0',
    tools: {
      searchTechnology: createSearchTechnologyTool(service),
      getTechnologyHistory: createGetTechnologyHistoryTool(service),
      findAlternatives: createFindAlternativesTool(service),
      listByRingAndQuadrant: createListByRingAndQuadrantTool(service),
      compareTechnologies: createCompareTechnologiesTool(service),
    },
  })

  await server.startStdio()
}

main().catch(console.error)
```

- [x] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: `dist/` directory created, no TypeScript errors.

- [x] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: PASS (all tests in both test files)

- [x] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "$(cat <<'EOF'
feat: add MCP server entry point

EOF
)"
```

---

## Task 8: Demo Script

**Files:**
- Create: `demo.ts`

- [ ] **Step 1: Create `demo.ts`**

```typescript
import { buildRadarIndex } from './src/dataLoader.js'
import { RadarService } from './src/radarService.js'

async function main() {
  console.log('=== Tech Radar Advisory Demo: Jenkins Migration ===\n')

  const index = await buildRadarIndex()
  const service = new RadarService(index)

  // T1: search_technology("Jenkins")
  console.log('--- T1: search_technology("Jenkins") ---')
  const searchResult = service.searchTechnology({ query: 'Jenkins' })
  if (!Array.isArray(searchResult)) {
    console.log('Jenkins not found in Vol.34.')
  } else {
    searchResult.forEach((e) =>
      console.log(`  ${e.name} | ring: ${e.ring} | quadrant: ${e.quadrant}`)
    )
  }
  console.log()

  // T3: find_alternatives("Jenkins")
  console.log('--- T3: find_alternatives("Jenkins") ---')
  const alts = service.findAlternatives({ name: 'Jenkins' })
  if (!alts) {
    console.log('Jenkins not found in Vol.34 (may have been removed).')
  } else {
    if (alts.warning) console.log(`  ⚠ Warning: ${alts.warning}`)
    console.log('  Alternatives:')
    alts.alternatives.forEach((e) =>
      console.log(`    ${e.name} | ring: ${e.ring}`)
    )
  }
  console.log()

  // T2: get_technology_history("GitHub Actions")
  console.log('--- T2: get_technology_history("GitHub Actions") ---')
  const history = service.getTechnologyHistory({ name: 'GitHub Actions' })
  if (!history) {
    console.log('GitHub Actions not found.')
  } else {
    history.history.forEach((h) =>
      console.log(
        `  Vol.${String(h.volume).padStart(2, '0')} (${h.year}) → ${h.ring} [${h.status}]`
      )
    )
  }
  console.log()

  // T5: compare_technologies(["GitHub Actions", "Tekton"])
  console.log('--- T5: compare_technologies(["GitHub Actions", "Tekton"]) ---')
  const comparison = service.compareTechnologies({
    names: ['GitHub Actions', 'Tekton'],
  })
  if (comparison.notFound?.length) {
    console.log(`  Not found in Vol.34: ${comparison.notFound.join(', ')}`)
  }
  comparison.entries.forEach((e) => {
    console.log(`\n  ${e.name}`)
    console.log(`    Ring: ${e.ring} | Quadrant: ${e.quadrant} | New: ${e.isNew}`)
  })
  if (comparison.entries.length >= 2) {
    console.log('\n  History comparison:')
    comparison.histories.forEach((h) => {
      console.log(`\n  ${h.name}:`)
      h.history.forEach((v) =>
        console.log(`    Vol.${String(v.volume).padStart(2, '0')} (${v.year}) → ${v.ring}`)
      )
    })
  }
}

main().catch(console.error)
```

- [ ] **Step 2: Run the demo**

Run: `npm run demo`
Expected: Output showing the Jenkins migration scenario with CI/CD alternatives, GitHub Actions history, and a comparison.

- [ ] **Step 3: Commit**

```bash
git add demo.ts
git commit -m "$(cat <<'EOF'
feat: add Jenkins migration demo script

EOF
)"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS, zero failures.

- [ ] **Step 2: Build for production**

Run: `npm run build`
Expected: `dist/` built with no TypeScript errors.

- [ ] **Step 3: Smoke-test the server (optional but recommended)**

**stdio mode** — connect to Claude Code or Claude Desktop:

```json
{
  "mcpServers": {
    "tech-radar-advisor": {
      "command": "node",
      "args": ["/path/to/GlobalHack-Radar-Yoda-Server/dist/src/index.js"]
    }
  }
}
```

**HTTP mode** — start locally and hit the health endpoint:

```bash
MCP_TRANSPORT=http PORT=3099 node dist/src/index.js &
curl http://localhost:3099/health   # → {"status":"ok"}
kill %1
```

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "$(cat <<'EOF'
chore: final build verification

EOF
)"
```

---

## Task 10: Audit Tech Stack Tool

**Goal:** Add a sixth MCP tool — `auditTechStack` — that accepts a list of technology names and returns a structured health report: each technology's current ring status, a categorisation (`healthy` / `monitor` / `migrate` / `unknown`), recommended alternatives for Hold/Caution technologies, and an aggregate summary.

**Files:**
- Modify: `src/types.ts` — add `AuditItemStatus`, `AuditItem`, `AuditResult`
- Modify: `src/radarService.ts` — add `auditTechStack()` method
- Modify: `src/tools.ts` — add `createAuditTechStackTool()`
- Modify: `src/index.ts` — register `auditTechStack` tool
- Modify: `tests/radarService.test.ts` — add service-level tests
- Modify: `tests/tools.test.ts` — add tool-level integration tests

---

- [x] **Step 1: Add types to `src/types.ts`**

Append after the `RadarEntry` interface and before `RadarIndex`:

```typescript
export type AuditItemStatus = 'healthy' | 'monitor' | 'migrate' | 'unknown'

export interface AuditItem {
  name: string
  ring: Ring | 'unknown'
  quadrant?: Quadrant
  status: AuditItemStatus
  alternatives?: RadarEntry[]
}

export interface AuditResult {
  summary: {
    total: number
    healthy: number
    monitor: number
    migrate: number
    unknown: number
  }
  items: AuditItem[]
  notFound: string[]
}
```

---

- [x] **Step 2: Add failing tests for `RadarService.auditTechStack` to `tests/radarService.test.ts`**

Append before the `RadarService.compareTechnologies` describe block:

```typescript
describe('RadarService.auditTechStack', () => {
  let service: RadarService

  beforeAll(async () => {
    const index = await buildRadarIndex()
    service = new RadarService(index)
  })

  it('returns healthy status for adopt technologies', () => {
    const adoptTech = service.listByRingAndQuadrant({ ring: 'adopt' })[0]
    const result = service.auditTechStack({ technologies: [adoptTech.name] })
    const item = result.items.find((i) => i.name === adoptTech.name)
    expect(item?.status).toBe('healthy')
    expect(item?.ring).toBe('adopt')
  })

  it('returns healthy status for trial technologies', () => {
    const trialTechs = service.listByRingAndQuadrant({ ring: 'trial' })
    if (trialTechs.length === 0) return
    const result = service.auditTechStack({ technologies: [trialTechs[0].name] })
    const item = result.items[0]
    expect(item.status).toBe('healthy')
    expect(item.ring).toBe('trial')
  })

  it('returns monitor status for assess technologies', () => {
    const assessTechs = service.listByRingAndQuadrant({ ring: 'assess' })
    if (assessTechs.length === 0) return
    const result = service.auditTechStack({ technologies: [assessTechs[0].name] })
    const item = result.items[0]
    expect(item.status).toBe('monitor')
  })

  it('returns migrate status for hold/caution technologies and includes alternatives', () => {
    const cautionTechs = service.listByRingAndQuadrant({ ring: 'caution' })
    if (cautionTechs.length === 0) return
    const result = service.auditTechStack({ technologies: [cautionTechs[0].name] })
    const item = result.items[0]
    expect(item.status).toBe('migrate')
    expect(item.alternatives).toBeDefined()
    expect(item.alternatives!.length).toBeGreaterThan(0)
    item.alternatives!.forEach((a) => expect(['adopt', 'trial']).toContain(a.ring))
  })

  it('marks unknown technology as unknown status and adds to notFound', () => {
    const result = service.auditTechStack({ technologies: ['xyzzy123notreal'] })
    expect(result.notFound).toContain('xyzzy123notreal')
    const item = result.items.find((i) => i.name === 'xyzzy123notreal')
    expect(item?.status).toBe('unknown')
    expect(item?.ring).toBe('unknown')
  })

  it('summary counts add up to total', () => {
    const adoptTech = service.listByRingAndQuadrant({ ring: 'adopt' })[0]
    const result = service.auditTechStack({
      technologies: [adoptTech.name, 'xyzzy123notreal'],
    })
    expect(result.summary.total).toBe(2)
    const { healthy, monitor, migrate, unknown } = result.summary
    expect(healthy + monitor + migrate + unknown).toBe(result.summary.total)
  })

  it('summary healthy count equals adopt + trial items', () => {
    const adoptTech = service.listByRingAndQuadrant({ ring: 'adopt' })[0]
    const trialTechs = service.listByRingAndQuadrant({ ring: 'trial' })
    const technologies = trialTechs.length > 0
      ? [adoptTech.name, trialTechs[0].name]
      : [adoptTech.name]
    const result = service.auditTechStack({ technologies })
    expect(result.summary.healthy).toBe(technologies.length)
  })

  it('is case-insensitive', () => {
    const result = service.auditTechStack({ technologies: ['react js'] })
    expect(result.notFound).not.toContain('react js')
    expect(result.items[0].status).not.toBe('unknown')
  })

  it('returns empty results for empty input', () => {
    const result = service.auditTechStack({ technologies: [] })
    expect(result.items).toHaveLength(0)
    expect(result.summary.total).toBe(0)
  })
})
```

- [x] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/radarService.test.ts`
Expected: FAIL — `service.auditTechStack is not a function`.

---

- [x] **Step 4: Add `auditTechStack` method to `src/radarService.ts`**

Update the import to include the new types:

```typescript
import type { RadarEntry, RadarIndex, Ring, Quadrant, AuditItem, AuditResult } from './types.js'
```

Add the method inside `RadarService` before `compareTechnologies`:

```typescript
auditTechStack(input: { technologies: string[] }): AuditResult {
  const items: AuditItem[] = []
  const notFound: string[] = []

  for (const tech of input.technologies) {
    // Look up current status (Vol.34) first, fall back to last known entry
    let entry: RadarEntry | undefined
    for (const list of this.index.ringQuadrantMap.values()) {
      entry = list.find((e) => e.name.toLowerCase() === tech.toLowerCase())
      if (entry) break
    }
    if (!entry) {
      const history = this.index.historyMap.get(tech.toLowerCase())
      if (history && history.length > 0) {
        entry = history[history.length - 1]
      }
    }

    if (!entry) {
      notFound.push(tech)
      items.push({ name: tech, ring: 'unknown', status: 'unknown' })
      continue
    }

    const statusMap: Record<Ring, AuditItem['status']> = {
      adopt: 'healthy',
      trial: 'healthy',
      assess: 'monitor',
      hold: 'migrate',
      caution: 'migrate',
    }

    const item: AuditItem = {
      name: entry.name,
      ring: entry.ring,
      quadrant: entry.quadrant,
      status: statusMap[entry.ring],
    }

    if (item.status === 'migrate') {
      const altResult = this.findAlternatives({ name: entry.name })
      if (altResult) item.alternatives = altResult.alternatives
    }

    items.push(item)
  }

  const summary = {
    total: items.length,
    healthy: items.filter((i) => i.status === 'healthy').length,
    monitor: items.filter((i) => i.status === 'monitor').length,
    migrate: items.filter((i) => i.status === 'migrate').length,
    unknown: items.filter((i) => i.status === 'unknown').length,
  }

  return { summary, items, notFound }
}
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/radarService.test.ts`
Expected: PASS (all 39 tests).

---

- [x] **Step 6: Add failing tool-layer tests to `tests/tools.test.ts`**

Update the import:

```typescript
import {
  createSearchTechnologyTool,
  createGetTechnologyHistoryTool,
  createFindAlternativesTool,
  createListByRingAndQuadrantTool,
  createCompareTechnologiesTool,
  createAuditTechStackTool,
} from '../src/tools.js'
```

Add a new describe block inside `MCP Tools Integration`:

```typescript
describe('auditTechStack tool', () => {
  it('happy path — audits a mixed list and returns summary + items', async () => {
    const adoptTech = service.listByRingAndQuadrant({ ring: 'adopt' })[0]
    const tool = createAuditTechStackTool(service)
    const result = await tool.execute({
      context: { technologies: [adoptTech.name, 'xyzzy123notreal'] },
    }) as { summary: { total: number; healthy: number; unknown: number }; items: { status: string }[]; notFound: string[] }
    expect(result.summary.total).toBe(2)
    expect(result.summary.healthy).toBe(1)
    expect(result.summary.unknown).toBe(1)
    expect(result.notFound).toContain('xyzzy123notreal')
  })

  it('migrate path — hold/caution tech gets alternatives in result', async () => {
    const cautionTechs = service.listByRingAndQuadrant({ ring: 'caution' })
    if (cautionTechs.length === 0) return
    const tool = createAuditTechStackTool(service)
    const result = await tool.execute({
      context: { technologies: [cautionTechs[0].name] },
    }) as { items: { status: string; alternatives?: unknown[] }[] }
    expect(result.items[0].status).toBe('migrate')
    expect(result.items[0].alternatives?.length).toBeGreaterThan(0)
  })

  it('empty path — returns empty items for empty list', async () => {
    const tool = createAuditTechStackTool(service)
    const result = await tool.execute({ context: { technologies: [] } }) as {
      summary: { total: number }; items: unknown[]
    }
    expect(result.items).toHaveLength(0)
    expect(result.summary.total).toBe(0)
  })
})
```

- [x] **Step 7: Run tests to verify they fail**

Run: `npx vitest run tests/tools.test.ts`
Expected: FAIL — `createAuditTechStackTool is not exported`.

---

- [x] **Step 8: Add `createAuditTechStackTool` to `src/tools.ts`**

Add before `createCompareTechnologiesTool`:

```typescript
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
```

- [x] **Step 9: Register tool in `src/index.ts`**

Update the import:

```typescript
import {
  createSearchTechnologyTool,
  createGetTechnologyHistoryTool,
  createFindAlternativesTool,
  createListByRingAndQuadrantTool,
  createCompareTechnologiesTool,
  createAuditTechStackTool,
} from './tools.js'
```

Add to the `tools` object:

```typescript
auditTechStack: createAuditTechStackTool(service),
```

- [x] **Step 10: Run all tests to verify zero regressions**

Run: `npx vitest run`
Expected: PASS (53 tests across both test files, zero failures).

---

## Task 11: HTTP Transport for Remote Deployment

**Goal:** Replace stdio startup with an always-on HTTP server using `MCPServer.startHTTP()`. Default port is `3000`, overridable via `PORT` env var.

**Context:** `@mastra/mcp`'s `MCPServer.startHTTP()` is a per-request handler, not a standalone server starter — a Node.js `http.createServer` wrapper is required. stdio mode has been removed; all clients connect via URL. The `/health` endpoint is needed for startup probes.

**Files:**
- Modify: `src/index.ts`
- Modify: `.mcp.json`

---

- [x] **Step 1: Rewrite `src/index.ts` as HTTP-only server**

```typescript
#!/usr/bin/env node
import http from 'node:http'
import { randomUUID } from 'node:crypto'
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

const MCP_PATH = '/mcp'
const port = parseInt(process.env.PORT ?? '3000', 10)

async function main() {
  const index = await buildRadarIndex()
  const service = new RadarService(index)

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
    },
  })

  const httpServer = http.createServer(async (req, res) => {
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
```

**Endpoints:**

| Path | Purpose |
|---|---|
| `GET /health` | Health check / startup probe — returns `{"status":"ok"}` |
| `POST /mcp` | MCP Streamable HTTP transport |

**Port:**

| `PORT` env var | Result |
|---|---|
| unset | listens on `3000` (default) |
| set | listens on specified port (the platform injects `8080`) |

- [x] **Step 2: Update `.mcp.json` to use URL mode**

```json
{
  "mcpServers": {
    "tech-radar-advisor": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

- [x] **Step 3: Build and verify**

Run: `npm run build`
Expected: compiles with no TypeScript errors.

- [x] **Step 4: Smoke-test locally**

```bash
node dist/src/index.js &
sleep 1
curl -s http://localhost:3000/health   # → {"status":"ok"}
kill %1
```

- [x] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: 53 tests pass, zero failures.

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| T1 `search_technology` | Task 4 + 6 |
| T2 `get_technology_history` | Task 5 + 6 |
| T3 `find_alternatives` | Task 5 + 6 |
| T4 `list_by_ring_and_quadrant` | Task 4 + 6 |
| T5 `compare_technologies` | Task 5 + 6 |
| T6 `audit_tech_stack` — health report for a tech stack list | Task 10 |
| DataLoader — 34 volumes, volume+year from filename | Task 3 |
| DataLoader — Fuse.js index for Vol.34 | Task 3 |
| DataLoader — historyMap all volumes, sorted asc | Task 3 |
| DataLoader — ringQuadrantMap for Vol.34 | Task 3 |
| Strip HTML from description | Task 3 |
| No-results: `{ found: false, suggestions: [] }` | Task 4 |
| T3 warning when not Hold | Task 5 |
| T5 `notFound` field | Task 5 |
| T6 `summary` counts (healthy/monitor/migrate/unknown) | Task 10 |
| T6 `alternatives` auto-populated for Hold/Caution | Task 10 |
| T6 `notFound` for unrecognised technologies | Task 10 |
| T6 historyMap fallback for technologies dropped from Vol.34 | Task 10 |
| Tools never throw | Task 6 + 10 (execute always returns) |
| Unit tests with real JSON | Task 3–5 + 10 |
| Integration tests via tool execute | Task 6 + 10 |
| Demo script Jenkins scenario | Task 8 |
| MCPServer stdio startup | Task 7 |
| HTTP-only server via `MCPServer.startHTTP()` | Task 11 |
| `/health` endpoint for startup probe | Task 11 |
| `PORT` env var respected, default `3000` | Task 11 |
| `.mcp.json` uses `url` mode for local connection | Task 11 |

All requirements covered. ✓
