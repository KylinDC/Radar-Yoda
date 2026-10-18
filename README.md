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
| `searchTechnology` | Fuzzy-search by name in the latest radar. Filter by ring or quadrant. |
| `getTechnologyHistory` | Full ring-change history across all 34 volumes (2010–2026). |
| `findAlternatives` | Adopt/Trial technologies in the same quadrant as a Hold/Caution tech. |
| `listByRingAndQuadrant` | All technologies in Vol.34 matching a ring and/or quadrant. |
| `compareTechnologies` | Side-by-side current status + full history for two or more technologies. |
| `auditTechStack` | Health check a list of technologies: healthy / monitor / migrate / unknown. |
| `getTrendingTechnologies` | Technologies rising or falling across radar volumes, with trajectory data. |
| `getTechnologyRiskScore` | Composite 0–10 risk score: radar ring + GitHub health + CVE count. |
| `draftADR` | Generate a Markdown ADR draft with radar evidence pre-filled per option. |
| `getMigrationRoadmap` | Prioritised migration plan from a tech stack list, ranked by risk score. |

---

## Common scenarios to try

### "Is this technology safe to adopt?"
> *"What's the current radar status of Temporal, and how has it moved over time?"*

Uses `searchTechnology` + `getTechnologyHistory`. Returns the current ring, quadrant, and a full trajectory showing whether it's accelerating toward Adopt or stalling.

---

### "We're on Jenkins — what should we move to?"
> *"Find alternatives to Jenkins and compare GitHub Actions vs Tekton."*

Uses `findAlternatives` + `compareTechnologies`. Returns Adopt/Trial CI tools in the same quadrant with side-by-side radar history.

---

### "What's hot right now in the tools space?"
> *"Show me the top rising technologies in the tools quadrant."*

Uses `getTrendingTechnologies` with `quadrant: tools, direction: rising`. Returns technologies with the steepest positive momentum across recent radar volumes.

---

### "How risky is our current stack?"
> *"Audit our stack: Kubernetes, Kafka, Jenkins, AngularJS, Spring Boot, REST APIs."*

Uses `auditTechStack`. Returns a health report classifying each technology and listing alternatives for anything in Hold/Caution.

---

### "Prioritise our tech debt"
> *"Give me a migration roadmap for: Jenkins, AngularJS, REST APIs, Kafka, jQuery."*

Uses `getMigrationRoadmap`. Returns a ranked list with risk scores (radar + GitHub + CVE), recommended alternatives, effort estimates (low/medium/high), and a rationale for each item.

---

### "Help me write a tech decision document"
> *"Draft an ADR for choosing a container orchestration platform. Options are Kubernetes, Nomad, and Docker Swarm."*

Uses `draftADR`. Returns a complete Markdown ADR with each option's current radar ring, history summary, and latest description pre-filled. You fill in Decision and Consequences.

---

### "What are the riskiest technologies we could be using?"
> *"What's the risk score for log4j?"*

Uses `getTechnologyRiskScore`. Returns a breakdown of radar risk, maintenance health (GitHub stars, last commit), and known CVEs — all combined into a single 0–10 score.

---

### "Show me what's in Adopt right now"
> *"List all platforms in the Adopt ring."*

Uses `listByRingAndQuadrant` with `ring: adopt, quadrant: platforms`. Returns all Vol.34 platform technologies Thoughtworks recommends adopting, sorted by name.

---

## Deploy

The server runs as a Cloudflare Worker — no container, no process to keep alive.

```bash
npm install
npx wrangler login   # once
npm run deploy       # → https://radar-yoda-server.<your-subdomain>.workers.dev
```

Store a GitHub token as a Worker secret to raise the GitHub API rate limit from 60 to 5,000 requests/hour. Secrets are set out-of-band and never land in the repo:

```bash
npx wrangler secret put GITHUB_TOKEN
```

### Continuous deployment

`.github/workflows/deploy.yml` runs on every push to `main`. It regenerates the volumes manifest (failing if the committed copy is stale), type-checks, runs the tests, runs `biome check`, deploys, and finally smoke-tests the live Worker. Pull requests run the verification steps only.

Add these under **Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → *Edit Cloudflare Workers* template |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID (right sidebar) |

The deploy job targets the `production` GitHub environment, so you can require manual approval there if you want a human in the loop.

### Endpoints

| Path | Purpose |
|---|---|
| `GET /health` | Health check — returns `{"status":"ok"}` |
| `POST /mcp` | MCP Streamable HTTP transport |

Every request is rate-limited to 600 per minute per IP. Over that the Worker returns `429` with `Retry-After: 60`.

### Connect an MCP client

```json
{
  "mcpServers": {
    "tech-radar-advisor": {
      "type": "http",
      "url": "https://radar-yoda-server.<your-subdomain>.workers.dev/mcp"
    }
  }
}
```

### Local development

```bash
npm run dev     # wrangler dev on http://127.0.0.1:8787
npm run smoke   # assert the running server answers MCP correctly
npm run verify  # same, but prints the responses instead of asserting
```

`npm run smoke` is the same script CI runs after deploying, so it doubles as a local end-to-end check. Both accept a URL argument to point at a deployment:

```bash
npm run smoke -- https://radar-yoda-server.<your-subdomain>.workers.dev
```

### Cost note

`searchTechnology` costs 6–9 ms of CPU per call, because it runs a Fuse.js query over 1,936 technologies. The Workers **Free** plan allows 10 ms of CPU per request, which leaves little headroom; the **Paid** plan's 30 s limit is the safer choice once the server sees real traffic. Every other tool stays under 1 ms. The index itself is built once per isolate at module scope (~30 ms, against a 1 s startup budget) and reused across requests.

## Demo

```bash
npm run demo
```

Runs the Jenkins migration scenario: search → find alternatives → trace GitHub Actions history → compare GitHub Actions vs Tekton.

## Development

```bash
npm test          # run all tests (110 tests, loads real JSON data — no mocks)
npm run typecheck # type-check only
npm run check     # lint + format check (biome)
npm run format    # auto-format
npm run gen:volumes # regenerate src/generated/volumes.ts
```

## Data notes

- `tech-radar-json-data/` — 34 JSON files, one per volume. Do not rename or restructure them; filenames are parsed for volume number and year.
- Adding a volume is a two-step change: drop the JSON in, then run `npm run gen:volumes` and commit the regenerated `src/generated/volumes.ts`. Workers have no filesystem, so the volumes are compiled into the bundle as static imports rather than read at runtime. CI fails if the two fall out of sync.
- Vol.34 (Apr 2026) uses `"caution"` instead of `"hold"` for the avoid ring. Both values are valid and handled equivalently.
- Technologies can disappear from recent volumes while still having full history — all queries handle this gracefully via `historyMap` fallback.
- Risk scores from `getTechnologyRiskScore` and `getMigrationRoadmap` degrade gracefully when GitHub or CVE data is unavailable, defaulting to worst-case scores to avoid false confidence.

## Special Thanks

Thanks for [thoughtworks-tech-radar-volumes](https://github.com/setchy/thoughtworks-tech-radar-volumes) to bring us the wonderful data!