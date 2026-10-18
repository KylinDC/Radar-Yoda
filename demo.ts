import { buildRadarIndex } from './src/dataLoader.js'
import { RadarService } from './src/radarService.js'

async function main() {
  console.log('=== Tech Radar Advisory Demo: Jenkins Migration ===\n')

  const index = await buildRadarIndex()
  const service = new RadarService(index)

  // T1: search_technology("Jenkins")
  console.log('--- T1: search_technology("Jenkins") ---')
  const searchResult = service.searchTechnology({ query: 'Jenkins' })
  if (!searchResult.found) {
    console.log('Jenkins not found in radar.')
  } else {
    searchResult.results.forEach((e) => {
      console.log(`  ${e.name} | ring: ${e.ring} | quadrant: ${e.quadrant}`)
    })
  }
  console.log()

  // T3: find_alternatives("Jenkins")
  console.log('--- T3: find_alternatives("Jenkins") ---')
  const alts = service.findAlternatives({ name: 'Jenkins' })
  if (!alts) {
    console.log('Jenkins not found in Vol.34 ringQuadrantMap — searching history...')
    const history = service.getTechnologyHistory({ name: 'Jenkins' })
    if (history) {
      const latest = history.history[history.history.length - 1]
      console.log(
        `  Last seen: Vol.${latest.volume} (${latest.year}) | ring: ${latest.ring} | quadrant: unknown`,
      )
    }
  } else {
    if (alts.warning) console.log(`  Warning: ${alts.warning}`)
    console.log('  Alternatives:')
    alts.alternatives.forEach((e) => {
      console.log(`    ${e.name} | ring: ${e.ring}`)
    })
  }
  console.log()

  // T2: get_technology_history("GitHub Actions")
  console.log('--- T2: get_technology_history("GitHub Actions") ---')
  const history = service.getTechnologyHistory({ name: 'GitHub Actions' })
  if (!history) {
    console.log('GitHub Actions not found in history.')
  } else {
    history.history.forEach((h) => {
      console.log(
        `  Vol.${String(h.volume).padStart(2, '0')} (${h.year}) → ${h.ring} [${h.status}]`,
      )
    })
  }
  console.log()

  // T5: compare_technologies(["GitHub Actions", "Tekton"])
  console.log('--- T5: compare_technologies(["GitHub Actions", "Tekton"]) ---')
  const comparison = service.compareTechnologies({
    names: ['GitHub Actions', 'Tekton'],
  })
  if (comparison.notFound?.length) {
    console.log(`  Not found in Vol.34: ${comparison.notFound.join(', ')}`)
  }
  comparison.entries.forEach((e) => {
    console.log(`\n  ${e.name}`)
    console.log(`    Ring: ${e.ring} | Quadrant: ${e.quadrant} | New: ${e.isNew}`)
  })
  if (comparison.histories.length > 0) {
    console.log('\n  History comparison:')
    comparison.histories.forEach((h) => {
      console.log(`\n  ${h.name}:`)
      h.history.forEach((v) => {
        console.log(`    Vol.${String(v.volume).padStart(2, '0')} (${v.year}) → ${v.ring}`)
      })
    })
  }
}

main().catch(console.error)
