import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStoreyModel, simulateQuake, groundMotion, driftLevel, jmaIntensity, storeyIndexOf } from '../src/utils/seismic.js'

// A 3-storey frame: slab + columns per storey, 3.5 m storeys.
function building({ material = 'Concrete', grade = 2, storeys = 3 } = {}) {
  const parts = []
  for (let s = 0; s < storeys; s++) {
    const z = s * 3.5
    const v = (kg) => [{ weight_kg: kg, material_class: material, seismic_grade: grade }]
    parts.push({ id: `Slab ${s}`, pos: [0, z + 0.15, 0], size: [10, 0.3, 10], fire_compartment: `Level ${s + 1}`, structural_role: 'primary', variants: v(72000) })
    parts.push({ id: `Columns ${s}`, pos: [0, z + 0.3 + 1.6, 0], size: [10, 3.2, 10], fire_compartment: `Level ${s + 1}`, structural_role: 'primary', variants: v(12000) })
  }
  parts.push({ id: 'Roof', pos: [0, storeys * 3.5 + 0.15, 0], size: [10, 0.3, 10], fire_compartment: 'Roof', structural_role: 'primary', variants: [{ weight_kg: 72000, material_class: material, seismic_grade: grade }] })
  return parts
}

test('storey model from IFC storeys', () => {
  const m = buildStoreyModel(building())
  assert.equal(m.storeys.length, 3) // roof slab merges into the top storey
  assert.equal(m.storeys[0].name, 'Level 1')
  const lumped = m.mass.reduce((s, v) => s + v, 0)
  assert.ok(lumped <= m.totalMass && lumped > m.totalMass * 0.6) // ground slab share stays on the ground
  assert.ok(Math.abs(m.period - m.height * 0.02) < 1e-9) // concrete: α = 0
  assert.equal(buildStoreyModel(building({ material: 'Steel' })).alpha, 1)
})

test('ground motion is scaled to the PGA', () => {
  const gm = groundMotion({ pga: 0.5, type: 'near' })
  const peak = Math.max(...gm.accel.map(Math.abs))
  assert.ok(Math.abs(peak / 9.81 - 0.5) < 1e-6)
  assert.equal(gm.duration, 16)
})

test('response is linear in PGA', () => {
  const m = buildStoreyModel(building())
  const a = simulateQuake(m, { pga: 0.05 })
  const b = simulateQuake(m, { pga: 0.1 })
  assert.ok(!b.yields)
  assert.ok(Math.abs(b.roofCm / a.roofCm - 2) < 0.01)
  assert.ok(a.storeys.every(s => s.driftRatio > 0))
})

test('the period follows the BSL formula', () => {
  const m = buildStoreyModel(building())
  const r = simulateQuake(m, { grade: 1 })
  assert.ok(Math.abs(r.period - m.period) < 1e-6)
  assert.ok(simulateQuake(m, { grade: 3 }).period < r.period) // stiffer
})

test('dampers and isolation cut the drift', () => {
  const m = buildStoreyModel(building({ storeys: 5 }))
  const std = simulateQuake(m, { pga: 0.6, system: 'standard' })
  const dmp = simulateQuake(m, { pga: 0.6, system: 'damped' })
  const iso = simulateQuake(m, { pga: 0.6, system: 'isolated' })
  assert.ok(dmp.worst.driftRatio < std.worst.driftRatio * 0.85, `damped ${dmp.worst.driftRatio} vs ${std.worst.driftRatio}`)
  assert.ok(iso.worst.driftRatio < std.worst.driftRatio * 0.5, `iso ${iso.worst.driftRatio} vs ${std.worst.driftRatio}`)
  assert.ok(iso.isoCm > 5, `isolator moves ${iso.isoCm} cm`)
  assert.ok(iso.storeys[0].accel < std.storeys[std.storeys.length - 1].accel)
})

test('frames hold base + floor displacements for playback', () => {
  const m = buildStoreyModel(building())
  const r = simulateQuake(m, { pga: 0.3 })
  assert.equal(r.frames.levels, 4)
  assert.equal(r.frames.disp.length, r.frames.n * 4)
  assert.ok(Math.abs(r.frames.n * r.frames.dt - 16) < 0.1)
})

test('a weak short building yields and drifts more than linear', () => {
  const m = buildStoreyModel(building({ grade: 1 }))
  const low = simulateQuake(m, { pga: 0.1 })
  const high = simulateQuake(m, { pga: 0.8 })
  assert.ok(high.yields && high.strengthUsed > 1)
  assert.ok(high.worst.driftRatio > low.worst.driftRatio * 8.05)
  const g3 = simulateQuake(buildStoreyModel(building({ grade: 3 })), { pga: 0.8 })
  assert.ok(g3.strengthUsed < high.strengthUsed)
  assert.notEqual(high.worst.level.key, 'ok') // yielding is never 'no damage'
})

test('labels', () => {
  assert.equal(driftLevel(1 / 300).key, 'ok')
  assert.equal(driftLevel(1 / 40).key, 'severe')
  assert.equal(jmaIntensity(0.5), '6強')
  const m = buildStoreyModel(building())
  assert.equal(storeyIndexOf({ pos: [0, 9, 0] }, m), 2)
})
