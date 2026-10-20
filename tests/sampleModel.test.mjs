import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseIfc, sha256Digest } from '@onuresen/openbim-core'
import { openWebIfc } from './ifcTestHelpers.mjs'
import { buildSampleIfc } from '../scripts/make-sample-ifc.mjs'
import { projectOpenBimResultToGenba } from '../src/utils/openBimProjection.js'
import { ifcToKit, MAX_INDIVIDUAL_PARTS } from '../src/utils/ifcToKit.js'

const committed = readFileSync(new URL('../public/samples/genba-sample-office.ifc', import.meta.url), 'utf8')

test('the committed sample matches its generator (npm run sample:ifc)', () => {
  assert.equal(buildSampleIfc().text, committed)
})

test('the sample building imports with real IFC data on every part', async () => {
  const { api, WebIFC } = await openWebIfc()
  const bytes = new TextEncoder().encode(committed)
  const result = parseIfc(api, WebIFC, bytes, {
    bindingId: 'genba-sample', assetRef: 'samples/genba-sample-office.ifc',
    contentDigest: await sha256Digest(bytes), parserVersion: '0.0.78',
  })
  const { kit, summary } = ifcToKit(projectOpenBimResultToGenba(result), { fileName: 'genba-sample-office.ifc' })

  // Each element stays its own part (clickable, own property sets).
  assert.equal(summary.grouped, false)
  assert.ok(summary.parts <= MAX_INDIVIDUAL_PARTS)
  assert.equal(summary.storeys, 4)
  assert.equal(kit.projectSettings.name, 'Genba Sample Office')

  const byClass = kit.parts.reduce((m, p) => m.set(p.variants[0].ifc_entity, [...(m.get(p.variants[0].ifc_entity) ?? []), p]), new Map())
  for (const cls of ['IfcFooting', 'IfcSlab', 'IfcColumn', 'IfcBeam', 'IfcWall', 'IfcCurtainWall', 'IfcWindow', 'IfcStairFlight']) {
    assert.ok(byClass.get(cls)?.length, `no ${cls}`)
  }
  // Ratings and grades come from the file, so the simulations differ by part.
  const column = byClass.get('IfcColumn')[0].variants[0]
  assert.equal(column.fire_resistance_grade, '2hr')
  assert.equal(column.seismic_grade, 3)
  assert.match(column.meta, /From IFC: material, fire rating, load bearing, seismic grade/)
  assert.equal(byClass.get('IfcBeam')[0].variants[0].fire_resistance_grade, '1hr')
  assert.equal(byClass.get('IfcCurtainWall')[0].variants[0].fire_resistance_grade, null)
  // Structure gets what-if materials; glazing does not.
  assert.equal(byClass.get('IfcColumn')[0].variants.length, 3)
  assert.equal(byClass.get('IfcWindow')[0].variants.length, 1)
  // Storeys become fire compartments, in build order.
  const storeys = [...new Set(kit.parts.map(p => p.fire_compartment))]
  assert.deepEqual(storeys, ['1F', '2F', '3F', 'RF'])
})
