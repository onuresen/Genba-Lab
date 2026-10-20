import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectOpenBimResultToGenba } from '../src/utils/openBimProjection.js'

// A kernel result with one wall made of two geometry packets.
function resultWith(packets) {
  return {
    schemaVersion: 'openbim-kernel-result-v1',
    kernel: { version: 'test' },
    source: { ifcSchema: 'IFC4', contentDigest: 'sha256:test' },
    relationships: [],
    geometryPackets: packets.map((p, i) => ({ packetId: `p${i}`, colour: p.colour ?? '#b0b0b0', ...p })),
    entities: [{
      sourceKey: 'ifc:test:wall', expressId: 1, globalId: 'G1', ifcTypeName: 'IFCWALL', name: 'Wall',
      geometryPacketIds: packets.map((_, i) => `p${i}`), propertySets: [], materials: [],
    }],
  }
}

test('big geometry packets merge without overflowing the call stack', () => {
  // ≈ a dense Revit element: spreading this many numbers into push() threw RangeError.
  const n = 600_000
  const big = { positions: new Float32Array(n), normals: new Float32Array(n), indices: new Uint32Array(n / 3), colour: '#ff0000' }
  const small = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }
  const { elements } = projectOpenBimResultToGenba(resultWith([big, small]))
  assert.equal(elements.length, 1)
  const el = elements[0]
  assert.equal(el.positions.length, n + 9)
  assert.equal(el.indices.length, n / 3 + 3)
  // Second packet's indices are shifted past the first packet's vertices.
  assert.deepEqual([...el.indices.slice(-3)], [n / 3, n / 3 + 1, n / 3 + 2])
  assert.equal(el.positions[n + 3], 1)
  // Colour comes from the packet with the most triangles.
  assert.equal(el.color, '#ff0000')
})
