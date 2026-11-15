// World-space triangles of the visible parts (assembled positions), for raycast simulations.
import * as THREE from 'three'
import { getCachedGeometry } from './ifcGeometryStore'

/**
 * @param skip  optional (part) => true to leave a part out of the surfaces
 * @returns [{ partId, positions: Float32Array, indices: Uint32Array|null }]
 */
export function partWorldEntries(parts, visible, skip) {
  const entries = []
  for (const p of parts) {
    if (!visible[p.id] || skip?.(p)) continue
    const g = getCachedGeometry(p.ifcGeometry) ?? new THREE.BoxGeometry(...p.size)
    const src = g.getAttribute('position').array
    const pos = new Float32Array(src.length)
    for (let i = 0; i < src.length; i += 3) {
      pos[i] = src[i] + p.pos[0]
      pos[i + 1] = src[i + 1] + p.pos[1]
      pos[i + 2] = src[i + 2] + p.pos[2]
    }
    const index = g.getIndex()
    entries.push({ partId: p.id, positions: pos, indices: index ? index.array : null })
  }
  return entries
}
