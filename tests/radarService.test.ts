import { describe, it, expect } from 'vitest'
import type { Ring, Quadrant, RadarEntry, RadarIndex } from '../src/types.js'

describe('types', () => {
  it('Ring values are the four rings', () => {
    const rings: Ring[] = ['adopt', 'trial', 'assess', 'hold', 'caution']
    expect(rings).toHaveLength(5)
    expect(rings).toContain('adopt')
    expect(rings).toContain('trial')
    expect(rings).toContain('assess')
    expect(rings).toContain('hold')
    expect(rings).toContain('caution')
  })

  it('Quadrant values are the four quadrants', () => {
    const quadrants: Quadrant[] = [
      'techniques',
      'tools',
      'platforms',
      'languages-and-frameworks',
    ]
    expect(quadrants).toHaveLength(4)
    expect(quadrants).toContain('techniques')
    expect(quadrants).toContain('tools')
    expect(quadrants).toContain('platforms')
    expect(quadrants).toContain('languages-and-frameworks')
  })
})
