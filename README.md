# Radar Yoda — Tech Radar Advisory MCP Server

An MCP server that lets Claude query 34 volumes of the [Thoughtworks Technology Radar](https://www.thoughtworks.com/radar) (Vol.01 2010 – Vol.34 2026). Built for Technical Principals and Tech Leads who want instant, evidence-based answers to questions like "Should we use X?" or "What should we migrate Jenkins to?"

## Tools

| Tool | What it does |
|---|---|
| `search_technology` | Fuzzy-search by name or description. Returns `{ results, found }`. |
| `get_technology_history` | Full ring-change history across all 34 volumes, sorted oldest→newest. |
| `find_alternatives` | Adopt/Trial technologies in the same quadrant. Falls back to last-known entry for technologies dropped from the latest volume. |
| `list_by_ring_and_quadrant` | All technologies in the latest volume matching a ring and/or quadrant, sorted by name. |
| `compare_technologies` | Side-by-side current status + full history for two or more technologies. |

## Setup

```bash
npm install
npm run build
```

Connect to Claude Code — add to `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "tech-radar-advisor": {
      "command": "node",
      "args": ["dist/src/index.js"]
    }
  }
}
```

Or use `tsx` for development without a build step:

```json
{
  "mcpServers": {
    "tech-radar-advisor": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/this/repo"
    }
  }
}
```

## Demo

```bash
npm run demo
```

Runs the Jenkins migration scenario: search → find alternatives → trace GitHub Actions history → compare GitHub Actions vs Tekton.

## Development

```bash
npm test          # run all tests (40 tests, loads real JSON data)
npm run typecheck # type-check only
npm run check     # lint + format check
```

## Data notes

- `tech-radar-json-data/` — 34 JSON files, one per volume. Do not rename or restructure them; filenames are parsed for volume number and year.
- Vol.34 (Apr 2026) uses `"caution"` instead of `"hold"` for the avoid ring.
- Technologies can disappear from recent volumes while still having full history — all queries handle this gracefully.
