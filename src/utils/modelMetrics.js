// Model-scale helpers: floor area for per-m² metrics, and a camera frame.
import { partBounds } from './craneLayout.js'

/**
 * Rough gross floor area (m²): the footprint of each storey, summed.
 * Storey = part.fire_compartment (set from the IFC storey on import).
 * Uses bounding boxes, so L-shaped or stepped storeys are over-counted.
 */
export function estimateFloorArea(parts) {
  const byStorey = new Map()
  for (const p of parts ?? []) {
    const key = p.fire_compartment ?? '_all'
    if (!byStorey.has(key)) byStorey.set(key, [])
    byStorey.get(key).push(p)
  }
  let area = 0
  for (const group of byStorey.values()) {
    const b = partBounds(group)
    if (b) area += (b.max[0] - b.min[0]) * (b.max[2] - b.min[2])
  }
  return Math.max(1, Math.round(area))
}

// Centre, size and bounding radius of the model (defaults to the old 5 m kit).
export function modelFrame(parts) {
  const b = partBounds(parts)
  if (!b) return { center: [0, 1, 0], size: [5, 3, 5], radius: 4 }
  const size = b.min.map((v, k) => b.max[k] - v)
  return {
    center: b.min.map((v, k) => (v + b.max[k]) / 2),
    size,
    radius: Math.max(2, Math.hypot(...size) / 2),
  }
}

// Camera views scale with the model. `d` is the viewing distance; the old
// Kit-of-Parts kit (≈5 m) keeps its original 14 m views as the minimum.
export function cameraViews(frame) {
  const [cx, cy, cz] = frame.center
  const d = Math.max(14, frame.radius * 2.6)
  const t = [cx, cy, cz]
  return {
    front:  { pos: [cx, cy + d * 0.15, cz + d], target: t },
    back:   { pos: [cx, cy + d * 0.15, cz - d], target: t },
    top:    { pos: [cx + 0.001, cy + d * 1.1, cz], target: t },
    bottom: { pos: [cx + 0.001, cy - d, cz], target: t },
    right:  { pos: [cx + d, cy + d * 0.15, cz], target: t },
    left:   { pos: [cx - d, cy + d * 0.15, cz], target: t },
    home:   { pos: [cx + d * 0.55, cy + d * 0.55, cz + d * 0.55], target: t },
  }
}
