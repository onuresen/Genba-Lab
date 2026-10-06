import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportKitToIfcText, openWebIfc } from './ifcTestHelpers.mjs'
import { parseIfc } from '../src/utils/ifcParse.js'
import { ifcToKit, MAX_INDIVIDUAL_PARTS } from '../src/utils/ifcToKit.js'

const { kit: source, ifcText } = exportKitToIfcText('./fixtures/basic-kit.json')
const { api, WebIFC } = await openWebIfc()
const parsed = parseIfc(api, WebIFC, new TextEncoder().encode(ifcText))

test('parser reads every exported element with geometry', () => {
  assert.equal(parsed.elements.length, source.parts.length)
  assert.equal(parsed.schema, 'IFC2X3')
  for (const el of parsed.elements) {
    assert.ok(el.ifcType.startsWith('Ifc'), el.ifcType)
    assert.ok(el.indices.length > 0)
    assert.equal(el.positions.length, el.normals.length)
  }
})

test('round trip keeps part sizes (metres)', () => {
  const { kit } = ifcToKit(structuredClone(parsed), { fileName: 'kit.ifc' })
  const sizes = kit.parts.map(p => [...p.size].sort((a, b) => a - b).map(v => v.toFixed(2)).join('x')).sort()
  const expected = source.parts.map(p => [...p.size].sort((a, b) => a - b).map(v => v.toFixed(2)).join('x')).sort()
  assert.deepEqual(sizes, expected)
})

test('kit is valid: unique ids, 1..N sequence, symmetric connections, on the ground', () => {
  const { kit, geometries } = ifcToKit(structuredClone(parsed), { fileName: 'kit.ifc', modelKey: 'm' })
  const ids = kit.parts.map(p => p.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual(kit.parts.map(p => p.sequence).sort((a, b) => a - b), ids.map((_, i) => i + 1))
  for (const p of kit.parts) {
    assert.equal(p.shape, 'ifc')
    assert.ok(geometries.has(p.ifcGeometry))
    for (const c of p.connections) {
      const other = kit.parts.find(q => q.id === c.to)
      assert.ok(other?.connections.some(r => r.to === p.id), `${p.id} ↔ ${c.to}`)
    }
  }
  const lowest = Math.min(...kit.parts.map(p => p.pos[1] - p.size[1] / 2))
  assert.ok(Math.abs(lowest) < 1e-3, `lowest point ${lowest}`)
  assert.ok(kit.presets.length > 0 && kit.presets[0].visible)
})

test('large models group by storey and class', () => {
  const many = structuredClone(parsed)
  while (many.elements.length <= MAX_INDIVIDUAL_PARTS) {
    many.elements.push(...structuredClone(parsed.elements).map((e, i) => ({ ...e, expressID: 100000 + many.elements.length + i })))
  }
  const { kit, summary } = ifcToKit(many, { fileName: 'big.ifc' })
  assert.equal(summary.grouped, true)
  const classes = new Set(parsed.elements.map(e => `${e.storey?.id}|${e.ifcType}`))
  assert.equal(kit.parts.length, classes.size)
})

// ── Property sets, materials, derived values ─────────────────────────────

import { parseFireRating, fireGrade, parseAcousticRating, materialProfile } from '../src/utils/ifcProperties.js'

test('parser reads property sets written by the exporter', () => {
  const byName = new Map(source.parts.map(p => [p.id, p]))
  for (const el of parsed.elements) {
    const part = byName.get(el.name)
    assert.ok(part, el.name)
    const sets = Object.values(el.psets)
    const weight = sets.map(s => s.Weight_kg).find(v => v !== undefined)
    assert.equal(Math.round(weight), Math.round(part.variants[0].weight_kg), el.name)
  }
})

test('fire, acoustic and material parsing', () => {
  assert.equal(parseFireRating('REI 90'), 90)
  assert.equal(parseFireRating('2HR'), 120)
  assert.equal(parseFireRating('1 hour'), 60)
  assert.equal(parseFireRating('F30'), 30)
  assert.equal(parseFireRating(''), null)
  assert.equal(fireGrade(90), '1hr')
  assert.equal(fireGrade(120), '2hr')
  assert.equal(fireGrade(30), 'non-rated')
  assert.equal(fireGrade(null), null)
  assert.equal(parseAcousticRating('Rw 52 dB'), 52)
  assert.equal(materialProfile(['Metal - Steel - 345 MPa']).label, 'Steel')
  assert.equal(materialProfile(['Concrete, Cast-in-Place gray']).label, 'Concrete')
  assert.equal(materialProfile(['CLT panel']).label, 'Timber')
  assert.equal(materialProfile(['Unobtainium']), null)
})

test('IFC facts drive part values', () => {
  const p = structuredClone(parsed)
  const el = p.elements[0]
  const box = el.positions.reduce((acc, v, i) => {
    const k = i % 3
    acc.min[k] = Math.min(acc.min[k], v); acc.max[k] = Math.max(acc.max[k], v)
    return acc
  }, { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
  const bboxVol = [0, 1, 2].reduce((v, k) => v * (box.max[k] - box.min[k]), 1)
  el.materials = ['Structural Steel S355']
  el.psets = {
    Pset_SlabCommon: { FireRating: 'REI 120', LoadBearing: false, IsExternal: true, AcousticRating: 'Rw 48' },
    Qto_SlabBaseQuantities: { NetVolume: bboxVol / 2, NetWeight: 1234 },
  }
  const { kit } = ifcToKit(p, { fileName: 'facts.ifc' })
  const part = kit.parts.find(x => x.variants[0].ifc_property_set.ExpressID === el.expressID)
  const v = part.variants[0]
  assert.equal(v.label, 'Structural Steel S355')
  assert.equal(v.fire_resistance_grade, '2hr')
  assert.equal(part.structural_role, 'secondary') // slab default is primary; IFC says not load bearing
  assert.equal(part.is_external, true)
  assert.equal(v.stc_rating, 48)
  assert.equal(v.weight_kg, 1234)
  assert.equal(v.thermal_conductivity_wpmk, 50) // steel
  assert.equal(v.carbon_kgco2e, Math.round(1234 * 1.55))
  assert.equal(v.ifc_psets.Pset_SlabCommon.FireRating, 'REI 120')
  assert.match(v.meta, /From IFC: material, fire rating, load bearing, acoustic rating, volume, weight/)
  assert.match(v.meta, /Estimated: cost, carbon\./)
})

test('grouped parts keep the weakest fire rating and drop full property sets', () => {
  const p = structuredClone(parsed)
  const slabs = p.elements.filter(e => e.ifcType === 'IfcSlab')
  slabs.forEach((e, i) => { e.psets = { Pset_SlabCommon: { FireRating: i === 0 ? '60' : '120' } } })
  while (p.elements.length <= MAX_INDIVIDUAL_PARTS) {
    p.elements.push(...structuredClone(p.elements.slice(0, 22)).map((e, i) => ({ ...e, expressID: 200000 + p.elements.length + i })))
  }
  const { kit } = ifcToKit(p, { fileName: 'big.ifc' })
  const slabPart = kit.parts.find(x => x.variants[0].ifc_entity === 'IfcSlab')
  assert.equal(slabPart.variants[0].fire_resistance_grade, '1hr')
  assert.equal(slabPart.variants[0].ifc_psets, undefined)
})
