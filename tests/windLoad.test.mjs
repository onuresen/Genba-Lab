import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildCollisionMesh } from '../src/utils/waterFlow.js'
import { computeWindLoad, heightFactor, gustFactor, windStreamlines, windVector, CP } from '../src/utils/windLoad.js'

function boxEntry(partId, min, max) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  return { partId, positions: g.getAttribute('position').array, indices: g.getIndex().array }
}

test('BSL height factor and gust factor', () => {
  assert.ok(Math.abs(heightFactor(10, 'open') - 1.0) < 0.01) // open terrain at 10 m ≈ V0
  assert.ok(heightFactor(3, 'city') === heightFactor(20, 'city')) // below Zb: constant
  assert.ok(heightFactor(50, 'open') > heightFactor(50, 'city'))
  assert.equal(gustFactor(5, 'suburban'), 2.5)
  assert.equal(gustFactor(60, 'suburban'), 2.1)
})

test('wind direction: from the west blows toward +X', () => {
  const w = windVector(270)
  assert.ok(w.x > 0.99 && Math.abs(w.z) < 1e-9)
  assert.ok(windVector(0).z > 0.99) // from north (−Z) toward +Z
})

test('a box: shear acts downwind, matches windward + leeward pressure', () => {
  const mesh = buildCollisionMesh([boxEntry('Block', [-5, 0, -5], [5, 10, 5])])
  const r = computeWindLoad(mesh, { v0: 34, fromDeg: 270, terrain: 'suburban' })
  assert.ok(r.baseShearKN > 0)
  // Upper bound: both faces at top pressure. Lower: both at Zb pressure.
  const area = 100
  const hi = (CP.windward + -CP.leeward) * r.qTop * area / 1000
  assert.ok(r.baseShearKN <= hi * 1.01 && r.baseShearKN > hi * 0.5, `shear ${r.baseShearKN} vs ${hi}`)
  assert.ok(r.overturnKNm > r.baseShearKN * 3 && r.overturnKNm < r.baseShearKN * 7)
  // Flat roof is lifted.
  assert.ok(r.partForces.get('Block').fy > 0)
  assert.ok(r.peakSuctionPa < 0 && r.peakPa > 0)
})

test('touching faces between parts carry no wind', () => {
  const one = computeWindLoad(buildCollisionMesh([boxEntry('A', [-5, 0, -5], [5, 10, 5])]), { fromDeg: 270 })
  const two = computeWindLoad(buildCollisionMesh([
    boxEntry('A', [-5, 0, -5], [5, 10, 5]),
    boxEntry('B', [5, 0, -5], [15, 10, 5]),
  ]), { fromDeg: 270 })
  assert.ok(Math.abs(two.baseShearKN - one.baseShearKN) / one.baseShearKN < 0.05, `${one.baseShearKN} vs ${two.baseShearKN}`)
})

test('a low block behind a tower is sheltered', () => {
  const alone = computeWindLoad(buildCollisionMesh([boxEntry('Low', [10, 0, -3], [16, 4, 3])]), { fromDeg: 270 })
  const behind = computeWindLoad(buildCollisionMesh([
    boxEntry('Tower', [-5, 0, -5], [5, 30, 5]),
    boxEntry('Low', [10, 0, -3], [16, 4, 3]),
  ]), { fromDeg: 270 })
  const fxAlone = alone.partForces.get('Low').fx
  const fxBehind = behind.partForces.get('Low').fx
  assert.ok(fxBehind < fxAlone * 0.6, `${fxBehind} vs ${fxAlone}`)
})

test('wind from the north pushes toward +Z', () => {
  const r = computeWindLoad(buildCollisionMesh([boxEntry('A', [-5, 0, -5], [5, 10, 5])]), { fromDeg: 0 })
  const f = r.partForces.get('A')
  assert.ok(f.fz > 0 && Math.abs(f.fx) < f.fz * 0.01)
})

test('streamlines go around the building, never through it', () => {
  const mesh = buildCollisionMesh([boxEntry('A', [-5, 0, -5], [5, 10, 5])])
  const lines = windStreamlines(mesh, { fromDeg: 270, lanes: 5, levels: 3 })
  assert.equal(lines.length, 15)
  for (const l of lines) {
    for (const [x, y, z] of l.points) {
      const inside = x > -4.95 && x < 4.95 && y > 0.05 && y < 9.95 && z > -4.95 && z < 4.95
      assert.ok(!inside, `point inside the box: ${x},${y},${z}`)
    }
  }
  // The middle low line had to deflect.
  const mid = lines[2 * 3]
  const zs = mid.points.map(p => Math.abs(p[2]))
  const ys = mid.points.map(p => p[1])
  assert.ok(Math.max(...zs) > 4.5 || Math.max(...ys) > 9.5)
})
