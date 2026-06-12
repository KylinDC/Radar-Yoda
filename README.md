# Radar Yoda — Tech Radar Advisory MCP Server

An MCP server that gives Claude instant access to 34 volumes of the [Thoughtworks Technology Radar](https://www.thoughtworks.com/radar) (Vol.01 2010 – Vol.34 2026) — plus real-world health signals from GitHub and CVE data. Built for Technical Principals and Tech Leads who want evidence-based answers to technology decisions without leaving their chat interface.

## What this MCP can do

### Understand the technology landscape
Ask about any technology's current radar status, its full history across 16 years of radar volumes, and how it compares to alternatives. The server fuzzy-searches across all 34 volumes so technologies that have been removed from the latest radar are still accessible.

### Trend intelligence
Identify which technologies are rising toward Adopt, falling toward Hold/Caution, or holding steady — across all 34 volumes using linear regression over ring scores. Great for proactive planning before a radar review cycle.

### Risk scoring
Get a composite 0–10 risk score for any technology combining:
- **Radar position** (0–4): where it sits in the latest radar
- **GitHub health** (0–3): star count and days since last commit
- **Security exposure** (0–3): known CVE count from OSV.dev

### ADR drafting
Generate a complete Architecture Decision Record draft with radar evidence pre-filled for each candidate technology. The TL only needs to fill in the Decision and Consequences sections.

### Migration roadmap
Convert a tech stack into a prioritised migration plan. Technologies are ranked by composite risk score, classified by urgency (migrate vs monitor), and matched with recommended alternatives.

---

## Tools

| Tool | What it does |
|------|-------------|
| `search_technology` | Fuzzy-search by name in the latest radar. Filter by ring or quadrant. |
| `get_technology_history` | Full ring-change history across all 34 volumes (2010–2026). |
| `find_alternatives` | Adopt/Trial technologies in the same quadrant as a Hold/Caution tech. |
| `list_by_ring_and_quadrant` | All technologies in Vol.34 matching a ring and/or quadrant. |
| `compare_technologies` | Side-by-side current status + full history for two or more technologies. |
| `audit_tech_stack` | Health check a list of technologies: healthy / monitor / migrate / unknown. |
| `get_trending_technologies` | Technologies rising or falling across radar volumes, with trajectory data. |
| `get_technology_risk_score` | Composite 0–10 risk score: radar ring + GitHub health + CVE count. |
| `draft_adr` | Generate a Markdown ADR draft with radar evidence pre-filled per option. |
| `get_migration_roadmap` | Prioritised migration plan from a tech stack list, ranked by risk score. |

---

## Common scenarios to try

### "Is this technology safe to adopt?"
> *"What's the current radar status of Temporal, and how has it moved over time?"*

Uses `search_technology` + `get_technology_history`. Returns the current ring, quadrant, and a full trajectory showing whether it's accelerating toward Adopt or stalling.

---

### "We're on Jenkins — what should we move to?"
> *"Find alternatives to Jenkins and compare GitHub Actions vs Tekton."*

Uses `find_alternatives` + `compare_technologies`. Returns Adopt/Trial CI tools in the same quadrant with side-by-side radar history.

---

### "What's hot right now in the tools space?"
> *"Show me the top rising technologies in the tools quadrant."*

Uses `get_trending_technologies` with `quadrant: tools, direction: rising`. Returns technologies with the steepest positive momentum across recent radar volumes.

---

### "How risky is our current stack?"
> *"Audit our stack: Kubernetes, Kafka, Jenkins, AngularJS, Spring Boot, REST APIs."*

Uses `audit_tech_stack`. Returns a health report classifying each technology and listing alternatives for anything in Hold/Caution.

---

### "Prioritise our tech debt"
> *"Give me a migration roadmap for: Jenkins, AngularJS, REST APIs, Kafka, jQuery."*

Uses `get_migration_roadmap`. Returns a ranked list with risk scores (radar + GitHub + CVE), recommended alternatives, effort estimates (low/medium/high), and a rationale for each item.

---

### "Help me write a tech decision document"
> *"Draft an ADR for choosing a container orchestration platform. Options are Kubernetes, Nomad, and Docker Swarm."*

Uses `draft_adr`. Returns a complete Markdown ADR with each option's current radar ring, history summary, and latest description pre-filled. You fill in Decision and Consequences.

---

### "What are the riskiest technologies we could be using?"
> *"What's the risk score for log4j?"*

Uses `get_technology_risk_score`. Returns a breakdown of radar risk, maintenance health (GitHub stars, last commit), and known CVEs — all combined into a single 0–10 score.

---

### "Show me what's in Adopt right now"
> *"List all platforms in the Adopt ring."*

Uses `list_by_ring_and_quadrant` with `ring: adopt, quadrant: platforms`. Returns all Vol.34 platform technologies Thoughtworks recommends adopting, sorted by name.

---

## Self-hosted setup

```bash
npm install
npm run build
node dist/src/index.js        # default port 3000
PORT=8080 node dist/src/index.js  # custom port
```

Connect any MCP client via URL:

```json
{
  "mcpServers": {
    "tech-radar-advisor": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```


### Endpoints

| Path | Purpose |
|---|---|
| `GET /health` | Health check — returns `{"status":"ok"}` |
| `POST /mcp` | MCP Streamable HTTP transport |

### Development (no build step)

```bash
npx tsx src/index.ts
```

Optional — set `GITHUB_TOKEN` in the server environment to increase GitHub API rate limits (60 → 5,000 requests/hour):

```json
{
  "mcpServers": {
    "tech-radar-advisor": {
      "command": "node",
      "args": ["dist/src/index.js"],
      "cwd": "/path/to/this/repo",
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
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
npm test          # run all tests (95 tests, loads real JSON data — no mocks)
npm run typecheck # type-check only
npm run check     # lint + format check
```

## Data notes

- `tech-radar-json-data/` — 34 JSON files, one per volume. Do not rename or restructure them; filenames are parsed for volume number and year.
- Vol.34 (Apr 2026) uses `"caution"` instead of `"hold"` for the avoid ring. Both values are valid and handled equivalently.
- Technologies can disappear from recent volumes while still having full history — all queries handle this gracefully via `historyMap` fallback.
- Risk scores from `get_technology_risk_score` and `get_migration_roadmap` degrade gracefully when GitHub or CVE data is unavailable, defaulting to worst-case scores to avoid false confidence.

## Special Thanks

Thanks for [thoughtworks-tech-radar-volumes](https://github.com/setchy/thoughtworks-tech-radar-volumes) to bring us the wonderful data!