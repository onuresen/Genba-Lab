import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareScenarioSnapshots, createScenarioSnapshot } from '../src/utils/scenarioComparison.js'

const snap = (label, value, ids) => createScenarioSnapshot({
  scenarioId: 'rain', label, inputs: { rainfall: value },
  metrics: [{ key: 'runoff', label: 'Runoff', value, unit: 'm³/h' }],
  affectedIds: ids, caveat: 'Indicative',
})

test('comparison reports metric and element-level changes', () => {
  const comparison = compareScenarioSnapshots(snap('Baseline', 10, ['a', 'b']), snap('Alternative', 15, ['b', 'c']))
  assert.equal(comparison.metrics[0].delta, 5)
  assert.equal(comparison.metrics[0].deltaPct, 50)
  assert.deepEqual(comparison.newlyAffected, ['c'])
  assert.deepEqual(comparison.relieved, ['a'])
  assert.deepEqual(comparison.unchanged, ['b'])
})

test('different scenario types cannot be compared', () => {
  const baseline = snap('Baseline', 10, [])
  const alternative = { ...snap('Alternative', 10, []), scenarioId: 'wind' }
  assert.throws(() => compareScenarioSnapshots(baseline, alternative), /same scenario type/)
})
