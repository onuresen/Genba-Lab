import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spreadFire, fireRoundResult, countFire } from '../src/utils/fireSim.js'

const part = (id, grade, to, sequence = 1) => ({
  id, sequence,
  connections: to.map(t => ({ to: t })),
  variants: [{ fire_resistance_grade: grade }],
})

// A row of parts: A - B - C, plus D (2hr) next to A.
const parts = [
  part('A', 'non-rated', ['B', 'D'], 1),
  part('B', '1hr', ['A', 'C'], 2),
  part('C', 'non-rated', ['B'], 3),
  part('D', '2hr', ['A'], 4),
]
const tick = (state, burnStart, secs, t = 0) =>
  spreadFire({ parts, state, burnStart, selectedVariants: {}, intensity: 100, now: secs * 1000, tick: t })

test('nothing spreads before the delay, then one neighbour per tick', () => {
  const burnStart = { A: 0 }
  let state = { A: 'burning' }
  assert.equal(tick(state, burnStart, 1), state) // too early: same object
  state = tick(state, burnStart, 2)               // 2.5 × 0.65 ≈ 1.6 s
  assert.equal(state.B, 'burning')                 // D is 2hr: never catches fire
  assert.equal(state.D, undefined)
})

test('non-rated fails, put-out parts never re-ignite', () => {
  const burnStart = { A: 0 }
  let state = { A: 'burning', B: 'out' }
  state = tick(state, burnStart, 10)
  assert.equal(state.A, 'failed')
  assert.equal(state.B, 'out')
  assert.deepEqual(countFire(state), { burning: 0, failed: 1, out: 1 })
})

test('a 2hr part set on fire holds and burns out', () => {
  const burnStart = { D: 0 }
  let state = { D: 'burning' }
  state = tick(state, burnStart, 3)
  assert.equal(state.A, undefined) // does not spread
  state = tick(state, burnStart, 9)
  assert.equal(state.D, 'out')
})

test('round result only once nothing burns', () => {
  assert.equal(fireRoundResult({ A: 'burning' }, 4, 5), null)
  assert.equal(fireRoundResult({}, 4, 0), null)
  const r = fireRoundResult({ A: 'failed', B: 'out' }, 4, 12)
  assert.equal(r.lostPct, 25)
  assert.equal(r.tone, 'fail')
  assert.match(r.subtitle, /1 put out · 1 lost/)
})
