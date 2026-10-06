import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getContinuousRenderReasons,
  hasFireEffects,
} from '../src/utils/renderActivity.js'

test('the default viewer is demand-rendered', () => {
  assert.deepEqual(getContinuousRenderReasons(), [])
})

test('static feature state does not keep the render loop alive', () => {
  assert.deepEqual(getContinuousRenderReasons({ fireState: {}, isShaking: false }), [])
  assert.equal(hasFireEffects({}), false)
})

test('post-earthquake results remain visible without continuous rendering', () => {
  assert.deepEqual(getContinuousRenderReasons({ hasShaken: true, isShaking: false }), [])
})

test('crane visibility and cinematic ownership do not bypass the GSAP bridge', () => {
  assert.deepEqual(getContinuousRenderReasons({ showCrane: true, cinematicMode: true }), [])
})

test('live regular-view effects opt in explicitly', () => {
  assert.deepEqual(getContinuousRenderReasons({
    showWaterSim: true,
    showThermal: true,
    showWindArrows: true,
    fireState: { Wall: 'burning', Roof: 'failed' },
    isShaking: true,
    envSettings: { clouds: true, stars: true },
  }), [
    'water-simulation',
    'thermal-overlay',
    'wind-overlay',
    'fire-effects',
    'earthquake',
    'clouds',
    'stars',
  ])
})

test('hidden regular-view effects do not animate in factory mode', () => {
  for (const mode of [{ factoryMode: true }]) {
    assert.deepEqual(getContinuousRenderReasons({
      ...mode,
      showWaterSim: true,
      fireState: { Wall: 'burning' },
      isShaking: true,
      envSettings: { clouds: true },
    }), [])
  }
})
