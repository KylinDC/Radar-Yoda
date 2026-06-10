export type Ring = 'adopt' | 'trial' | 'assess' | 'hold'

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

export interface RadarIndex {
  fuseIndex: import('fuse.js').default<RadarEntry>
  historyMap: Map<string, RadarEntry[]>
  ringQuadrantMap: Map<string, RadarEntry[]>
}
