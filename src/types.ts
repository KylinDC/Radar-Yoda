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
