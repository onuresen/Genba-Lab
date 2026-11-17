import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessModelReadiness } from '../src/utils/modelReadiness.js'

function part(id, facts = [], extra = {}) {
  return {
    id, shape: 'ifc', ifcGeometry: `m:${id}`, fire_compartment: 'Level 1',
    variants: [{
      meta: `Imported. From IFC: ${facts.join(', ')}. Estimated: cost, carbon.`,
      ifc_property_set: { GlobalId: id },
    }],
    ...extra,
  }
}

test('complete declared facts make physical investigations ready', () => {
  const facts = ['material', 'fire rating', 'load bearing', 'volume', 'weight']
  const result = assessModelReadiness([
    part('a', facts, { is_external: true }),
    part('b', facts, { is_external: false }),
  ], { schema: 'IFC4', openBimCoreVersion: '0.1.1', contentDigest: 'sha256:abc' })
  assert.equal(result.checks.find(c => c.id === 'geometry').level, 'strong')
  assert.equal(result.checks.find(c => c.id === 'materials').coverage, 1)
  assert.ok(result.tools.every(t => t.status === 'ready'))
  assert.equal(result.source.schema, 'IFC4')
})

test('missing declarations remain visible as readiness limits', () => {
  const result = assessModelReadiness([part('a'), part('b', [], { fire_compartment: 'Unassigned' })])
  assert.equal(result.checks.find(c => c.id === 'quantities').level, 'limited')
  assert.equal(result.tools.find(t => t.id === 'earthquake').status, 'limited')
  assert.equal(result.tools.find(t => t.id === 'wind').status, 'ready')
  assert.match(result.tools.find(t => t.id === 'crane').caveat, /estimated/)
})
