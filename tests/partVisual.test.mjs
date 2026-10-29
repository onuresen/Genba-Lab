import assert from 'node:assert/strict'
import test from 'node:test'
import { GHOST_OPACITY, SELECT_COLOR, resolvePartVisual } from '../src/utils/partVisual.js'
import { focusBounds, focusContext, focusRole } from '../src/utils/focus.js'
import { motionDuration, prefersReducedMotion } from '../src/utils/motion.js'

const base = { color: '#c0c0c0' }

test('a plain part shows its model colour, solid', () => {
  const v = resolvePartVisual(base)
  assert.equal(v.source, 'model')
  assert.equal(v.emissiveIntensity, 0)
  assert.equal(v.opacity, 1)
  assert.equal(v.transparent, false)
  assert.equal(v.depthWrite, true)
})

test('fire beats earthquake beats selection', () => {
  assert.equal(resolvePartVisual({ ...base, selected: true, shakeAtRisk: true, fireStatus: 'burning' }).source, 'fire')
  assert.equal(resolvePartVisual({ ...base, selected: true, shakeAtRisk: true }).source, 'earthquake')
  assert.equal(resolvePartVisual({ ...base, selected: true, weekHighlighted: true }).source, 'selection')
})

test('a selected part keeps its outline during fire', () => {
  const v = resolvePartVisual({ ...base, selected: true, fireStatus: 'burning' })
  assert.equal(v.edgeColor, SELECT_COLOR)
  assert.equal(v.edgeOpacity, 1)
})

test('a selected part is never dimmed by a Gantt hover or focus', () => {
  const v = resolvePartVisual({ ...base, selected: true, weekDimmed: true, focusRole: 'subject' })
  assert.equal(v.opacity, 1)
  assert.equal(v.source, 'selection')
})

test('acoustic tint stays above hover, as before', () => {
  const v = resolvePartVisual({ ...base, hovered: true, acousticTint: '#00ff00' })
  assert.equal(v.source, 'acoustic')
  assert.equal(v.emissive, '#00ff00')
})

test('ghosted parts fade and stop writing depth; hover brings one back', () => {
  const ghost = resolvePartVisual({ ...base, focusRole: 'ghost' })
  assert.equal(ghost.opacity, GHOST_OPACITY)
  assert.equal(ghost.depthWrite, false)
  assert.ok(ghost.edgeOpacity < 0.3)
  assert.equal(resolvePartVisual({ ...base, focusRole: 'ghost', hovered: true }).opacity, 1)
  assert.equal(resolvePartVisual({ ...base, focusRole: 'context' }).opacity, 1)
})

test('a failed part stays see-through whatever else is on', () => {
  assert.equal(resolvePartVisual({ ...base, fireStatus: 'failed', selected: true }).opacity, 0.6)
})

const parts = [
  { id: 'A', pos: [0, 0, 0], exp: [0, 5, 0], size: [2, 2, 2], connections: [{ to: 'B' }] },
  { id: 'B', pos: [4, 0, 0], exp: [8, 0, 0], size: [2, 2, 2], connections: [] },
  { id: 'C', pos: [0, 0, 4], exp: [0, 0, 8], size: [2, 2, 2], connections: [{ to: 'A' }, { to: 'gone' }] },
  { id: 'D', pos: [50, 0, 0], exp: [50, 0, 0], size: [2, 2, 2], connections: [] },
]

test('focus context holds neighbours in both directions, nothing missing', () => {
  const f = focusContext(parts, 'A')
  assert.equal(f.subject, 'A')
  assert.deepEqual([...f.context].sort(), ['B', 'C'])
  assert.equal(focusRole(f, 'A'), 'subject')
  assert.equal(focusRole(f, 'B'), 'context')
  assert.equal(focusRole(f, 'D'), 'ghost')
  assert.equal(focusRole(null, 'D'), null)
  assert.deepEqual([...focusContext(parts, 'C').context], ['A'])
  assert.equal(focusContext(parts, 'nope'), null)
  assert.equal(focusContext(parts, null), null)
})

test('focus bounds cover subject and visible neighbours only', () => {
  const f = focusContext(parts, 'A')
  const all = focusBounds(parts, f, { visible: { A: true, B: true, C: true } })
  assert.deepEqual(all.pos, [2, 0, 2])
  assert.deepEqual(all.size, [6, 2, 6])
  const noC = focusBounds(parts, f, { visible: { A: true, B: true, C: false } })
  assert.deepEqual(noC.size, [6, 2, 2])
  const exploded = focusBounds(parts, focusContext(parts, 'B'), { exploded: true })
  assert.deepEqual(exploded.pos, [4, 2.5, 0])
})

test('reduced motion turns tweens into cuts', () => {
  assert.equal(motionDuration(1.2, false), 1.2)
  assert.equal(motionDuration(1.2, true), 0)
  assert.equal(prefersReducedMotion(undefined), false)
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true)
  assert.equal(prefersReducedMotion({}), false)
})
