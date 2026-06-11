export type Ring = 'adopt' | 'trial' | 'assess' | 'hold' | 'caution'

export type Quadrant =
  | 'techniques'
  | 'tools'
  | 'platforms'
  | 'languages-and-frameworks'

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

export interface RadarIndex {
  fuseIndex: import('fuse.js').default<RadarEntry>
  historyMap: Map<string, RadarEntry[]>
  ringQuadrantMap: Map<string, RadarEntry[]>
}

export type TrendDirection = 'rising' | 'falling' | 'stable'

export interface TrendingEntry {
  name: string
  quadrant: Quadrant
  currentRing: Ring
  direction: TrendDirection
  slope: number
  trajectory: Array<{ volume: number; year: number; ring: Ring }>
}

export interface GitHubHealth {
  stars: number
  lastCommitDaysAgo: number
  openIssues: number
}

export interface RiskScore {
  name: string
  riskScore: number
  breakdown: {
    radarRisk: number
    maintenanceRisk: number | null
    securityRisk: number | null
  }
  currentRing: Ring | 'unknown'
  githubHealth: GitHubHealth | null
  cveCount: number | null
}

export interface ADROption {
  name: string
  currentRing: Ring | 'unknown'
  quadrant: Quadrant | 'unknown'
  historyLength: number
  latestMovement: string
  radarUrl: string
}

export interface ADRDraft {
  markdown: string
  options: ADROption[]
}

export interface RoadmapItem {
  priority: number
  name: string
  currentRing: Ring
  quadrant: Quadrant
  riskScore: number
  action: 'migrate' | 'monitor'
  effort: 'low' | 'medium' | 'high'
  suggestedAlternatives: RadarEntry[]
  rationale: string
}

export interface MigrationRoadmap {
  summary: { total: number; criticalMigrations: number; monitored: number }
  roadmap: RoadmapItem[]
}
