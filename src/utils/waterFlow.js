// Rain runoff on the real model surfaces. Pure logic (no React) so it can be tested in Node.
//
// 1. Rain falls straight down on a grid over the model. The first surface hit is where it lands.
// 2. From there, water runs downhill along the surface slope.
// 3. At an edge it drips down to the next surface, or to the ground (y = 0).
// 4. It stops in a pond (flat or a low point), in a drain, or on the ground.
//
// Indicative only: no infiltration, no gutter capacity, no ponding overflow.
import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

export const FLAT_SLOPE = 0.005      // below 0.5 % fall, water stays (ponds)
const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)

/**
 * Merge world-space part meshes into one raycastable mesh.
 * entries: [{ partId, positions: Float32Array (world xyz), indices: Uint32Array|null }]
 */
export function buildCollisionMesh(entries) {
  let nPos = 0, nIdx = 0
  for (const e of entries) {
    nPos += e.positions.length
    nIdx += e.indices ? e.indices.length : e.positions.length / 3
  }
  const positions = new Float32Array(nPos)
  const indices = new Uint32Array(nIdx)
  // Part per VERTEX: MeshBVH reorders the triangle index, but never the vertices.
  const vertexPart = []
  let p = 0, q = 0
  for (const e of entries) {
    const base = p / 3
    positions.set(e.positions, p)
    const idx = e.indices ?? Uint32Array.from({ length: e.positions.length / 3 }, (_, i) => i)
    for (let i = 0; i < idx.length; i++) indices[q + i] = idx[i] + base
    for (let v = 0; v < e.positions.length / 3; v++) vertexPart.push(e.partId)
    p += e.positions.length
    q += idx.length
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingBox()
  const bvh = new MeshBVH(geometry)
  return { geometry, bvh, vertexPart, bounds: geometry.boundingBox }
}

// First surface below `origin` (searching down `far` metres). Normal is flipped to face up.
function castDown(mesh, origin, far) {
  const ray = new THREE.Ray(origin, DOWN)
  const hit = mesh.bvh.raycastFirst(ray, THREE.DoubleSide, 0, far)
  if (!hit) return null
  const n = hit.face.normal.clone()
  if (n.y < 0) n.negate()
  return { point: hit.point.clone(), normal: n, partId: mesh.vertexPart[hit.face.a] }
}

// Horizontal downhill direction on a surface with up-facing normal n. Its length ≈ slope.
function downhill(n) {
  // Gravity projected on the plane: g - n (g·n), with g = (0,-1,0).
  return new THREE.Vector2(n.x * n.y, n.z * n.y)
}

function inBox(p, box, pad) {
  return p.x >= box.min.x - pad && p.x <= box.max.x + pad
    && p.y >= box.min.y - pad && p.y <= box.max.y + pad
    && p.z >= box.min.z - pad && p.z <= box.max.z + pad
}

/**
 * Trace one drop from its landing hit. Returns { path, end, kind, partId }.
 * kind: 'pond' (stays on a part), 'ground' (reaches y = 0), 'drain' (caught).
 */
export function traceDrop(mesh, hit, { step, drains = [], maxSteps = 400 }) {
  let pos = hit.point
  let normal = hit.normal
  let partId = hit.partId
  const path = [pos.toArray()]
  let stuck = 0

  for (let i = 0; i < maxSteps; i++) {
    for (const d of drains) {
      if (inBox(pos, d.box, step)) return { path, end: pos.toArray(), kind: 'drain', partId: d.partId }
    }

    const h = downhill(normal)
    const slope = h.length() / Math.max(normal.y, 1e-6)
    if (normal.y > 0.25 && slope < FLAT_SLOPE) {
      return { path, end: pos.toArray(), kind: 'pond', partId }
    }

    // Move one step downhill (steep faces: just drop off).
    const dir = h.lengthSq() > 1e-12 ? h.normalize() : new THREE.Vector2(0, 0)
    const nx = pos.x + dir.x * step
    const nz = pos.z + dir.y * step
    const probeTop = pos.y + step * 0.5 + 0.05
    const next = castDown(mesh, new THREE.Vector3(nx, probeTop, nz), step * 2.5 + 0.1)

    if (next && next.point.y <= pos.y + 1e-4) {
      const moved = Math.hypot(next.point.x - pos.x, next.point.z - pos.z)
      stuck = moved < step * 0.2 ? stuck + 1 : 0
      if (stuck > 4) return { path, end: pos.toArray(), kind: 'pond', partId }
      pos = next.point
      normal = next.normal
      partId = next.partId
      path.push(pos.toArray())
      continue
    }

    // Edge: the water leaves this surface and falls.
    const fallFrom = new THREE.Vector3(nx, pos.y - 0.01, nz)
    const below = castDown(mesh, fallFrom, pos.y + 1)
    if (below && below.point.y > 0.02) {
      path.push([nx, pos.y, nz], below.point.toArray())
      pos = below.point
      normal = below.normal
      partId = below.partId
      continue
    }
    path.push([nx, pos.y, nz], [nx, 0, nz])
    return { path, end: [nx, 0, nz], kind: 'ground', partId: null }
  }
  return { path, end: pos.toArray(), kind: 'pond', partId }
}

/**
 * Rain on the whole model.
 * @param mesh            from buildCollisionMesh
 * @param rainfallMmH     rain intensity (mm/h)
 * @param drains          [{ partId, box: THREE.Box3 }]
 * @param maxSamples      cap on rain samples (grid spacing adapts)
 * @param maxPaths        how many flow paths to return for drawing
 */
export function simulateRunoff(mesh, { rainfallMmH = 50, drains = [], maxSamples = 2500, maxPaths = 400 } = {}) {
  const b = mesh.bounds
  const w = b.max.x - b.min.x
  const d = b.max.z - b.min.z
  const spacing = Math.max(0.15, Math.sqrt((w * d) / maxSamples))
  const cellArea = spacing * spacing
  const top = b.max.y + 1
  const q = cellArea * rainfallMmH / 1000 // m³/h per sample

  const pools = new Map()     // key → { x, y, z, flow, kind, partId }
  const poolCell = Math.max(spacing * 2, 0.5)
  const paths = []
  let samples = 0
  const totals = { pond: 0, ground: 0, drain: 0 }

  for (let x = b.min.x + spacing / 2; x < b.max.x; x += spacing) {
    for (let z = b.min.z + spacing / 2; z < b.max.z; z += spacing) {
      const hit = castDown(mesh, new THREE.Vector3(x, top, z), top + 1)
      if (!hit || hit.point.y < 0.02) continue // rain on open ground: not runoff
      samples++
      const r = traceDrop(mesh, hit, { step: spacing * 0.6, drains })
      totals[r.kind] += q
      const [ex, ey, ez] = r.end
      const key = `${r.kind}|${Math.round(ex / poolCell)}|${Math.round(ey / 0.25)}|${Math.round(ez / poolCell)}`
      const pool = pools.get(key) ?? { x: 0, y: 0, z: 0, flow: 0, n: 0, kind: r.kind, partId: r.partId }
      pool.x += ex; pool.y += ey; pool.z += ez; pool.n++; pool.flow += q
      pools.set(key, pool)
      paths.push(r.path)
    }
  }

  const collect = [...pools.values()].map(p => ({
    x: p.x / p.n, y: p.y / p.n, z: p.z / p.n,
    flow: p.flow, kind: p.kind, partId: p.partId,
  })).sort((a, b2) => b2.flow - a.flow)

  // Keep long paths first (they show the flow best), then thin out evenly.
  paths.sort((a, b2) => b2.length - a.length)
  const stride = Math.max(1, Math.ceil(paths.length / maxPaths))
  const shownPaths = paths.filter((p, i) => p.length > 1 && i % stride === 0).slice(0, maxPaths)

  const total = totals.pond + totals.ground + totals.drain
  const pondParts = new Map()
  for (const c of collect) if (c.kind === 'pond' && c.partId) pondParts.set(c.partId, (pondParts.get(c.partId) ?? 0) + c.flow)

  return {
    spacing,
    catchmentM2: samples * cellArea,
    runoffM3h: total,
    share: {
      pond: total ? totals.pond / total : 0,
      ground: total ? totals.ground / total : 0,
      drain: total ? totals.drain / total : 0,
    },
    collect,
    paths: shownPaths,
    pondParts: [...pondParts.entries()].map(([partId, flow]) => ({ partId, flow })).sort((a, b2) => b2.flow - a.flow),
  }
}

// Parts that look like drains: IFC drainage classes, or names like drain / gutter / 樋.
const DRAIN_CLASSES = new Set(['IfcFlowTerminal', 'IfcPipeSegment', 'IfcFlowSegment', 'IfcPipeFitting', 'IfcWasteTerminal'])
const DRAIN_NAME = /drain|gutter|downpipe|down pipe|rwp|scupper|樋|ドレン/i
export function isDrainPart(part) {
  const v = part.variants?.[0]
  return DRAIN_CLASSES.has(v?.ifc_entity) || DRAIN_NAME.test(part.id) || DRAIN_NAME.test(v?.label ?? '')
}

export { UP }
