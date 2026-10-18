import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VOLUMES } from '../src/generated/volumes.js'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tech-radar-json-data')

describe('generated volumes manifest', () => {
  it('lists every volume JSON file, in sorted order', async () => {
    const onDisk = (await readdir(dataDir)).filter((f) => f.endsWith('.json')).sort()
    expect(VOLUMES.map((v) => v.filename)).toEqual(onDisk)
  })

  it('carries entries for every volume', () => {
    for (const volume of VOLUMES) {
      expect(Array.isArray(volume.entries)).toBe(true)
      expect(volume.entries.length).toBeGreaterThan(0)
    }
  })

  it('has a parsable volume number for every filename', () => {
    for (const volume of VOLUMES) {
      expect(volume.filename).toMatch(/Volume\s+\d+/i)
      expect(volume.filename).toMatch(/\(\w+ \d{4}\)/)
    }
  })
})
