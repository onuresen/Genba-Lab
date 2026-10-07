import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildCollisionMesh, simulateRunoff, isDrainPart } from '../src/utils/waterFlow.js'

// World-space triangles for a box (min..max), as an entry for buildCollisionMesh.
function boxEntry(partId, min, max) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2])
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  return { partId, positions: g.getAttribute('position').array, indices: g.getIndex().array }
}

// A plane through four corners (two triangles), for sloped roofs.
function quadEntry(partId, a, b, c, d) {
  return { partId, positions: new Float32Array([...a, ...b, ...c, ...d]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }
}

test('a flat roof ponds', () => {
  const mesh = buildCollisionMesh([boxEntry('Slab', [-5, 3, -5], [5, 3.3, 5])])
  const r = simulateRunoff(mesh, { rainfallMmH: 50, maxSamples: 400 })
  assert.ok(r.share.pond > 0.99, `pond share ${r.share.pond}`)
  assert.equal(r.pondParts[0].partId, 'Slab')
  assert.ok(Math.abs(r.catchmentM2 - 100) < 5, `catchment ${r.catchmentM2}`)
  assert.ok(Math.abs(r.runoffM3h - 5) < 0.3, `runoff ${r.runoffM3h}`) // 100 m² × 50 mm/h = 5 m³/h
})

test('a sloped roof drains off its low edge to the ground', () => {
  // 10 × 10 roof, high at z = -5 (y = 4), low at z = +5 (y = 3): 10 % fall toward +z.
  const mesh = buildCollisionMesh([quadEntry('Roof', [-5, 4, -5], [5, 4, -5], [5, 3, 5], [-5, 3, 5])])
  const r = simulateRunoff(mesh, { rainfallMmH: 30, maxSamples: 400 })
  assert.ok(r.share.ground > 0.99, `ground share ${r.share.ground}`)
  const drips = r.collect.filter(c => c.kind === 'ground')
  assert.ok(drips.every(c => c.z > 4.5), 'all water lands past the low edge (+z)')
  assert.ok(r.paths.length > 0 && r.paths[0].length > 3)
})

test('water drips from a sloped roof onto a flat slab below and ponds there', () => {
  const mesh = buildCollisionMesh([
    quadEntry('Roof', [-5, 6, -5], [5, 6, -5], [5, 5, 5], [-5, 5, 5]),
    boxEntry('Podium', [-6, 0, 4], [6, 2, 12]),
  ])
  const r = simulateRunoff(mesh, { rainfallMmH: 30, maxSamples: 600 })
  const roofWater = r.collect.filter(c => c.kind === 'pond' && c.partId === 'Podium')
  assert.ok(roofWater.length > 0, 'roof runoff collects on the podium')
})

test('a drain catches water on its way', () => {
  const mesh = buildCollisionMesh([quadEntry('Roof', [-5, 4, -5], [5, 4, -5], [5, 3, 5], [-5, 3, 5])])
  // A gutter along the low edge.
  const drain = { partId: 'Gutter', box: new THREE.Box3(new THREE.Vector3(-6, 2.5, 4.6), new THREE.Vector3(6, 3.5, 5.6)) }
  const r = simulateRunoff(mesh, { rainfallMmH: 30, maxSamples: 400, drains: [drain] })
  assert.ok(r.share.drain > 0.95, `drain share ${r.share.drain}`)
})

test('drain detection by class and name', () => {
  assert.equal(isDrainPart({ id: 'Roof Drain 1', variants: [{ ifc_entity: 'IfcBuildingElementProxy' }] }), true)
  assert.equal(isDrainPart({ id: 'Pipe 3', variants: [{ ifc_entity: 'IfcPipeSegment' }] }), true)
  assert.equal(isDrainPart({ id: 'Wall 1', variants: [{ ifc_entity: 'IfcWall' }] }), false)
})
