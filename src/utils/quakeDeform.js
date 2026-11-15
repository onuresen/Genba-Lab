// Shared vertex-shader sway for the earthquake playback.
// Each floor level has a height and a horizontal displacement; every vertex moves by the
// displacement interpolated at its world height. Columns lean, floors slide. No re-render needed:
// the playback writes into these uniforms every frame.
import * as THREE from 'three'
import { MAX_LEVELS } from './seismic'

export const quakeUniforms = {
  uQuakeOn: { value: 0 },
  uQuakeCount: { value: 0 },
  uQuakeLevels: { value: new Float32Array(MAX_LEVELS) },
  uQuakeDisp: { value: new Float32Array(MAX_LEVELS) },
  uQuakeDir: { value: new THREE.Vector2(1, 0) },
}

const HEADER = `
uniform float uQuakeOn;
uniform int uQuakeCount;
uniform float uQuakeLevels[${MAX_LEVELS}];
uniform float uQuakeDisp[${MAX_LEVELS}];
uniform vec2 uQuakeDir;
`

const BODY = `
#include <begin_vertex>
if (uQuakeOn > 0.5) {
  float qy = (modelMatrix * vec4(transformed, 1.0)).y;
  float qd = uQuakeDisp[0];
  for (int i = 1; i < ${MAX_LEVELS}; i++) {
    if (i >= uQuakeCount) break;
    if (qy <= uQuakeLevels[i]) {
      float qt = clamp((qy - uQuakeLevels[i - 1]) / max(uQuakeLevels[i] - uQuakeLevels[i - 1], 0.001), 0.0, 1.0);
      qd = mix(uQuakeDisp[i - 1], uQuakeDisp[i], qt);
      break;
    }
    qd = uQuakeDisp[i];
  }
  transformed.x += uQuakeDir.x * qd;
  transformed.z += uQuakeDir.y * qd;
}
`

/** onBeforeCompile for part materials. */
export function quakeCompile(shader) {
  Object.assign(shader.uniforms, quakeUniforms)
  shader.vertexShader = HEADER + shader.vertexShader.replace('#include <begin_vertex>', BODY)
}
export const quakeCacheKey = () => 'genba-quake'
