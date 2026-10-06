import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeCraneLayout, reachTo, capacityAt, CRANE_CLEARANCE, MIN_JIB, MAX_JIB } from '../src/utils/craneLayout.js'

const box = (pos, size) => ({ pos, size })

test('no model keeps the original crane', () => {
  const l = computeCraneLayout([])
  assert.equal(l.x, 7)
  assert.equal(l.jibLen, MIN_JIB)
  assert.equal(l.jibY, 9)
  assert.equal(l.ratedMoment, 60000)
})

test('crane stands outside the model and reaches its far corner', () => {
  // 25 × 6 × 10 m building centred on the origin (like the sample IFC).
  const parts = [box([0, 3, 0], [25, 6, 10])]
  const l = computeCraneLayout(parts)
  assert.equal(l.x, 12.5 + CRANE_CLEARANCE)
  assert.equal(l.z, 0)
  const far = Math.hypot(-12.5 - l.x, 5)
  assert.ok(l.jibLen >= far, `jib ${l.jibLen} < far corner ${far}`)
  assert.ok(l.jibY >= 6 + 4, 'hook clears the roof')
  for (const corner of [[-12.5, -5], [-12.5, 5], [12.5, -5], [12.5, 5]]) {
    assert.ok(reachTo(l, ...corner).inReach, `corner ${corner} out of reach`)
  }
})

test('small kits keep the minimum jib; huge sites cap at the maximum', () => {
  assert.equal(computeCraneLayout([box([0, 1, 0], [2, 2, 2])]).jibLen, MIN_JIB)
  assert.equal(computeCraneLayout([box([0, 10, 0], [300, 20, 300])]).jibLen, MAX_JIB)
})

test('capacity falls with radius and never exceeds max', () => {
  const l = computeCraneLayout([box([0, 3, 0], [40, 6, 20])])
  assert.equal(capacityAt(l, 1), l.maxCapacity)
  assert.ok(capacityAt(l, l.jibLen) < capacityAt(l, l.jibLen / 2))
  assert.ok(capacityAt(l, l.jibLen) >= 2500 - 1e-9)
})
