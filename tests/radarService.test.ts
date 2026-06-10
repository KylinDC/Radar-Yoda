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
