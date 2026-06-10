# Tech Radar Advisory MCP Server — Design Spec

**Date:** 2026-06-10
**Project:** GlobalHack-Radar-Yoda-Server
**Target Users:** Technical Principals (TP) and Tech Leads (TL)

---

## 1. Core Use Cases

Users interact with this server to accomplish three tasks:

1. **Validate a technology** — "Should I use X?" Query the current ring/quadrant status of a technology.
2. **Find alternatives** — "We're using outdated tech, what should we migrate to?" Find Adopt/Trial replacements for a Hold technology within the same quadrant.
3. **Explore trends** — "What's popular in this space?" List Adopt/Trial technologies within a given quadrant.

---

## 2. Data Source

- **Source:** `tech-radar-json-data/` directory — 34 volumes of the Thoughtworks Technology Radar (Vol.01 2010 through Vol.34 2026).
- Queries default to the latest volume (Vol.34). Historical trend tracking across all volumes is also supported.

---

## 3. Architecture

### 3.1 Layers

```
┌─────────────┐
│  MCP Tools  │  ← Interface layer (@mastra/mcp)
└──────┬──────┘
       │ calls
┌──────▼──────┐
│ RadarService│  ← Business logic layer (pure TypeScript, independently testable)
└──────┬──────┘
       │ reads
┌──────▼──────┐
│  RadarIndex │  ← Data index layer (built by DataLoader at startup)
└─────────────┘
```

### 3.2 Dependency Chain

```
DataLoader ──▶ RadarIndex ◀── RadarService ◀── MCP Tools
```

- `DataLoader`: reads all JSON files at startup and builds the RadarIndex.
- `RadarService`: depends on RadarIndex; encapsulates all business logic.
- `MCP Tools`: depends on RadarService; exposes methods as MCP tools via Mastra.

---

## 4. Data Model

### 4.1 Core Types

```typescript
type Ring = 'adopt' | 'trial' | 'assess' | 'hold'
type Quadrant = 'techniques' | 'tools' | 'platforms' | 'languages-and-frameworks'
```


```typescript

interface RadarEntry {
  name: string
  ring: Ring
  quadrant: Quadrant
  isNew: boolean
  status: 'new' | 'moved in' | 'moved out' | 'no change'
  description: string       // HTML tags stripped
  relatedBlips: string[]
  volume: number            // Volume number, injected from filename at load time
  year: number              // Publication year, parsed from filename
}
```

### 4.2 Three Indexes

```typescript
interface RadarIndex {
  fuseIndex: Fuse<RadarEntry>                 // Fuse.js fuzzy search index over Vol.34
  historyMap: Map<string, RadarEntry[]>       // technology name → history sorted by volume asc
  ringQuadrantMap: Map<string, RadarEntry[]>  // "adopt:tools" → list of entries
}
```

### 4.3 DataLoader Startup Logic

1. Read all 34 JSON files; parse volume number and year from each filename.
2. Vol.34 entries → build Fuse.js index (search fields: `name`, `description`).
3. All volumes → aggregate entries by technology name into `historyMap`.
4. Vol.34 entries → group by `ring:quadrant` into `ringQuadrantMap`.


---

## 5. MCP Tools Interface

### T1 `search_technology`
Fuzzy-search for a technology, with optional ring/quadrant filters.

```typescript
input:  { query: string, quadrant?: Quadrant, ring?: Ring }
output: RadarEntry[]  // up to 5 results
```


### T2 `get_technology_history`
Return the ring change history of a technology across all volumes.

```typescript
input:  { name: string }
output: {
  name: string,
  history: { volume: number, year: number, ring: Ring, status: string }[]
}
```

### T3 `find_alternatives`
Find Adopt/Trial replacements in the same quadrant as the given technology.

```typescript
input:  { name: string }
output: {
  input: RadarEntry,
  warning?: string,        // present if input technology is not on Hold or Caution
  alternatives: RadarEntry[]
}
```


### T4 `list_by_ring_and_quadrant`
List all technologies matching a given ring and/or quadrant.

```typescript
input:  { ring?: Ring, quadrant?: Quadrant }
output: RadarEntry[]  // sorted by name
```

### T5 `compare_technologies`
Side-by-side comparison of two technologies: current status and full history.

```typescript
input:  { names: [string, string] }
output: {
  entries: RadarEntry[],
  histories: { name: string, history: { volume: number, year: number, ring: Ring, status: string }[] }[],
  notFound?: string[]
}
```


---

## 6. MCP Server Setup

```typescript
// Dependencies
// @mastra/core v1.41.0 — createTool
// @mastra/mcp          — MCPServer
// fuse.js              — fuzzy search
// zod                  — schema definitions

import { MCPServer } from '@mastra/mcp'

const server = new MCPServer({
  name: 'tech-radar-advisor',
  version: '1.0.0',
  tools: {
    searchTechnology,
    getTechnologyHistory,
    findAlternatives,
    listByRingAndQuadrant,
    compareTechnologies,
  }
})

server.startStdio()  // connects to Claude Desktop / Claude Code
```

---

## 7. Error Handling

Tools never throw exceptions. They always return structured results, letting the host LLM (Claude) decide how to communicate issues to the user.

| Scenario | Handling |
|---|---|
| No search results | Return `{ found: false, suggestions: [...] }` with up to 3 closest matches |

| T3 input is not on Hold or Caution | Return normally with a `warning` field explaining the ring status |
| T5 one technology not found | Return found entries; list missing names in `notFound` field |

---

## 8. Testing Strategy

**Unit tests (RadarService)**
- Framework: `vitest`
- Load real JSON files — no mocked data
- Cover: fuzzy match accuracy, history sort order, alternatives filtering logic

**Integration tests (MCP Tools)**
- Call via `MCPServer.executeTool()` directly
- Per tool: one happy path + one no-result scenario

**Demo script**
- `demo.ts`: runs the Jenkins migration scenario end-to-end (T1 → T3 → T2 → T5)
- Executable as a standalone script for live demos

---

## 9. Demo Scenario

> "We're using Jenkins and want to migrate to a modern CI/CD solution."

1. **T1** `search_technology("Jenkins")` → find the entry, confirm current ring
2. **T3** `find_alternatives("Jenkins")` → return Adopt/Trial technologies in the same quadrant
3. **T2** `get_technology_history("GitHub Actions")` → trace how it reached Adopt
4. **T5** `compare_technologies(["GitHub Actions", "Tekton"])` → side-by-side decision comparison

---

## 10. MVP Scope

**In scope (3-day hackathon):** All 5 tools + DataLoader + RadarService + demo script
**Out of scope:** Internal custom Tech Radar overlay, Web UI, authentication/authorization, persistent storage
