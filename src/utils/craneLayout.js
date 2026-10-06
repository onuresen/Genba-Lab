// Tower crane placement and size, derived from the loaded model.
// Shared by Crane.jsx, CranePanel.jsx and Scene.jsx (cab view, second crane).
// Indicative only: not a crane selection or lift study.

export const CRANE_CLEARANCE = 3     // m from the model edge to the mast
export const MIN_JIB = 9             // m, the original Kit-of-Parts crane
export const MAX_JIB = 80            // m, a large flat-top tower crane
export const MAX_CAPACITY = 8000     // kg at short radius
const BASE_MOMENT = 60000            // kg·m (60 t·m) for the 9 m jib
const TIP_LOAD = 2500                // kg kept at the tip of long jibs

// The original fixed crane: used when no model is loaded.
const DEFAULT_LAYOUT = layoutFor(7, 0, MIN_JIB, 0)

function layoutFor(x, z, jibLen, modelTop) {
  const jibY = Math.max(9, Math.ceil(modelTop + 4))
  return {
    x, z,
    jibLen,
    ctrLen: Math.max(3, Math.round(jibLen / 3)),
    jibY,
    apexY: jibY + 1.5,
    ratedMoment: Math.max(BASE_MOMENT, TIP_LOAD * jibLen),
    maxCapacity: MAX_CAPACITY,
  }
}

export function partBounds(parts) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of parts ?? []) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p.pos[k] - p.size[k] / 2)
      max[k] = Math.max(max[k], p.pos[k] + p.size[k] / 2)
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null
}

/**
 * Mast stands CRANE_CLEARANCE beyond the model's +X edge, centred on Z.
 * The jib (pointing −X by default) reaches the farthest model corner.
 */
export function computeCraneLayout(parts) {
  const b = partBounds(parts)
  if (!b) return DEFAULT_LAYOUT
  const x = b.max[0] + CRANE_CLEARANCE
  const z = (b.min[2] + b.max[2]) / 2
  const far = Math.max(
    Math.hypot(b.min[0] - x, b.min[2] - z),
    Math.hypot(b.min[0] - x, b.max[2] - z),
  )
  const jibLen = Math.min(MAX_JIB, Math.max(MIN_JIB, Math.ceil(far + 1)))
  return layoutFor(+x.toFixed(2), +z.toFixed(2), jibLen, b.max[1])
}

// Hook radius and slew angle to reach a point, limited by the jib.
export function reachTo(layout, px, pz) {
  const dx = px - layout.x
  const dz = pz - layout.z
  return {
    radius: Math.min(layout.jibLen, Math.max(0.5, Math.hypot(dx, dz))),
    slew: Math.atan2(dz, dx),
    inReach: Math.hypot(dx, dz) <= layout.jibLen,
  }
}

export function capacityAt(layout, radius) {
  return Math.min(layout.maxCapacity, layout.ratedMoment / Math.max(radius, 2))
}
