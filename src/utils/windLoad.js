// Wind on the real model surfaces. Pure logic (no React) so it can be tested in Node.
//
// Profile and pressure follow the Japanese BSL method (告示1454), simplified:
//   Er(z) = 1.7 · (max(z, Zb) / ZG)^α      height factor by terrain
//   q(z)  = 0.6 · Er(z)² · Gf · V0²         velocity pressure (N/m²), gust factor Gf
//   p     = Cp · q                          Cp: windward +0.8, leeward −0.4, side −0.7, roof −1.0
// Each exposed triangle gets a pressure. Faces touching other parts or hidden
// upwind are sheltered. Indicative only: no wind tunnel, no internal pressure.
import * as THREE from 'three'

export const TERRAINS = {
  open:     { label: 'Open (sea, fields)', zb: 5,  zg: 350, alpha: 0.15, gf: [2.2, 1.9] },
  suburban: { label: 'Suburban',           zb: 10, zg: 450, alpha: 0.20, gf: [2.5, 2.1] },
  city:     { label: 'City centre',        zb: 20, zg: 550, alpha: 0.27, gf: [3.1, 2.3] },
}

export const CP = { windward: 0.8, leeward: -0.4, side: -0.7, roof: -1.0, roofWindward: 0.3, sheltered: -0.3 }
const CONTACT_GAP = 0.3 // m: a face this close to another part is internal (no wind)

/** BSL height factor Er. */
export function heightFactor(z, terrain = 'suburban') {
  const t = TERRAINS[terrain] ?? TERRAINS.suburban
  return 1.7 * Math.pow(Math.max(z, t.zb) / t.zg, t.alpha)
}

/** Mean wind speed (m/s) at height z for base speed V0. */
export function windAt(z, v0, terrain = 'suburban') {
  return v0 * heightFactor(z, terrain)
}

/** Gust factor Gf for building height H (BSL table, linear between 10 m and 40 m). */
export function gustFactor(height, terrain = 'suburban') {
  const [low, high] = (TERRAINS[terrain] ?? TERRAINS.suburban).gf
  const t = Math.min(1, Math.max(0, (height - 10) / 30))
  return low + (high - low) * t
}

/** Velocity pressure q (N/m²) at height z. */
export function velocityPressure(z, v0, terrain, gf) {
  const er = heightFactor(z, terrain)
  return 0.6 * er * er * gf * v0 * v0
}

/** Direction the wind travels, for wind blowing FROM `fromDeg` (0 = N = −Z, 90 = E = +X). */
export function windVector(fromDeg) {
  const a = (fromDeg * Math.PI) / 180
  return new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
}

function hits(mesh, origin, dir, far) {
  return !!mesh.bvh.raycastFirst(new THREE.Ray(origin, dir), THREE.DoubleSide, 0, far)
}

// Is the point inside another part's solid? Odd number of crossings along a ray, per part.
function insideOther(mesh, origin, dir, ownPart) {
  const count = new Map()
  for (const h of mesh.bvh.raycast(new THREE.Ray(origin, dir), THREE.DoubleSide)) {
    const id = mesh.vertexPart[h.face.a]
    if (id !== ownPart) count.set(id, (count.get(id) ?? 0) + 1)
  }
  for (const k of count.values()) if (k % 2 === 1) return true
  return false
}

/**
 * Wind load on the whole model.
 * @param mesh     from buildCollisionMesh (waterFlow.js)
 * @param v0       base wind speed (m/s, BSL V0)
 * @param fromDeg  wind direction (blowing from)
 * @param terrain  'open' | 'suburban' | 'city'
 * @returns { height, gf, qTop, vTop, baseShearKN, overturnKNm, peakPa, peakSuctionPa,
 *            faces: { positions, pressure }, cells, partForces: Map, bands }
 */
export function computeWindLoad(mesh, { v0 = 34, fromDeg = 270, terrain = 'suburban', maxCells = 260 } = {}) {
  const w = windVector(fromDeg)
  const up = new THREE.Vector3(0, 1, 0)
  const toWind = w.clone().negate()
  const height = Math.max(1, mesh.bounds.max.y)
  const gf = gustFactor(height, terrain)
  const qTop = velocityPressure(height, v0, terrain, gf)
  const size = Math.max(height, mesh.bounds.max.x - mesh.bounds.min.x, mesh.bounds.max.z - mesh.bounds.min.z)
  const cellSize = Math.max(0.5, size / 14)

  const pos = mesh.geometry.getAttribute('position')
  const index = mesh.geometry.index.array
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const n = new THREE.Vector3(), centroid = new THREE.Vector3(), origin = new THREE.Vector3()

  const outPos = []
  const outP = []
  const cells = new Map()
  const partForces = new Map()
  const BANDS = 10
  const bands = Array.from({ length: BANDS }, (_, i) => ({ z0: (i * height) / BANDS, z1: ((i + 1) * height) / BANDS, forceKN: 0 }))
  let shear = 0, moment = 0, peak = 0, suction = 0

  for (let t = 0; t < index.length; t += 3) {
    a.fromBufferAttribute(pos, index[t]); b.fromBufferAttribute(pos, index[t + 1]); c.fromBufferAttribute(pos, index[t + 2])
    n.subVectors(c, b).cross(origin.subVectors(a, b))
    const area = n.length() / 2
    if (area < 1e-4) continue
    n.normalize()
    if (n.y < -0.7) continue // soffits and undersides: ignored
    centroid.addVectors(a, b).add(c).divideScalar(3)

    // Internal face: another part right in front of it, or touching it.
    const partId = mesh.vertexPart[index[t]]
    origin.copy(centroid).addScaledVector(n, 0.02)
    if (hits(mesh, origin, n, CONTACT_GAP) || insideOther(mesh, origin, n, partId)) continue

    let kind, cp, q
    if (n.y > 0.7) {
      if (hits(mesh, origin, up, Infinity)) continue // covered by something above
      const facing = n.x * toWind.x + n.z * toWind.z
      const steep = Math.sqrt(1 - n.y * n.y) > 0.5 // roof steeper than 30°
      kind = 'roof'
      cp = steep && facing > 0 ? CP.roofWindward : CP.roof
      q = qTop
    } else {
      const facing = (n.x * toWind.x + n.z * toWind.z) / Math.hypot(n.x, n.z)
      if (facing > 0.3) {
        kind = hits(mesh, origin, toWind, Infinity) ? 'sheltered' : 'windward'
        cp = CP[kind]
        q = kind === 'windward' ? velocityPressure(centroid.y, v0, terrain, gf) : qTop
      } else {
        kind = facing < -0.3 ? 'leeward' : 'side'
        cp = CP[kind]
        q = qTop
      }
    }

    const p = cp * q // N/m², + presses in, − pulls out
    // Force on the part: pressure acts against the outward normal.
    const fx = -p * area * n.x, fy = -p * area * n.y, fz = -p * area * n.z
    const along = fx * w.x + fz * w.z
    shear += along
    moment += along * centroid.y
    if (p > peak) peak = p
    if (p < suction) suction = p

    const band = bands[Math.min(BANDS - 1, Math.floor((centroid.y / height) * BANDS))]
    if (band) band.forceKN += along / 1000

    const pf = partForces.get(partId) ?? { fx: 0, fy: 0, fz: 0, area: 0 }
    pf.fx += fx; pf.fy += fy; pf.fz += fz; pf.area += area
    partForces.set(partId, pf)

    // Heat map: the triangle pushed out a little, so it sits on the surface.
    const off = 0.02
    for (const v of [a, b, c]) outPos.push(v.x + n.x * off, v.y + n.y * off, v.z + n.z * off)
    outP.push(p)

    // Arrows: group nearby faces of the same kind.
    const key = `${kind}|${Math.round(centroid.x / cellSize)}|${Math.round(centroid.y / cellSize)}|${Math.round(centroid.z / cellSize)}`
    const cell = cells.get(key) ?? { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 0, nx: 0, ny: 0, nz: 0, area: 0, kind }
    cell.x += centroid.x * area; cell.y += centroid.y * area; cell.z += centroid.z * area
    cell.nx += n.x * area; cell.ny += n.y * area; cell.nz += n.z * area
    cell.fx += fx; cell.fy += fy; cell.fz += fz; cell.area += area
    cells.set(key, cell)
  }

  const cellList = [...cells.values()].map(cl => {
    const nn = new THREE.Vector3(cl.nx, cl.ny, cl.nz).normalize()
    const f = Math.hypot(cl.fx, cl.fy, cl.fz)
    // Mean pressure on the cell, signed like p.
    const pressure = -(cl.fx * nn.x + cl.fy * nn.y + cl.fz * nn.z) / cl.area
    return {
      x: cl.x / cl.area, y: cl.y / cl.area, z: cl.z / cl.area,
      normal: nn.toArray(), pressure, forceN: f, area: cl.area, kind: cl.kind,
    }
  }).sort((p1, p2) => p2.forceN - p1.forceN).slice(0, maxCells)

  return {
    v0, fromDeg, terrain, height, gf,
    qTop,
    vTop: windAt(height, v0, terrain),
    baseShearKN: shear / 1000,
    overturnKNm: moment / 1000,
    peakPa: peak,
    peakSuctionPa: suction,
    faces: { positions: new Float32Array(outPos), pressure: new Float32Array(outP) },
    cells: cellList,
    partForces,
    bands,
  }
}

/**
 * Streamlines that go over and around the model (not through it).
 * Returns [{ points: [[x,y,z]…], speed }] with speed relative to the top wind speed.
 */
export function windStreamlines(mesh, { fromDeg = 270, terrain = 'suburban', lanes = 7, levels = 4 } = {}) {
  const w = windVector(fromDeg)
  const side = new THREE.Vector3(-w.z, 0, w.x)
  const bb = mesh.bounds
  const center = new THREE.Vector3((bb.min.x + bb.max.x) / 2, 0, (bb.min.z + bb.max.z) / 2)
  const R = Math.max(2, Math.hypot(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2)
  const H = Math.max(1, bb.max.y)
  const step = Math.max(0.2, R / 30)
  const steps = Math.ceil((2 * R + step * 16) / step)
  const erTop = heightFactor(H, terrain)
  const probe = (p, dir, far) => hits(mesh, p, dir, far)
  const lines = []

  for (let i = 0; i < lanes; i++) {
    const lat0 = (-1 + (2 * (i + 0.5)) / lanes) * R * 1.15
    for (let j = 0; j < levels; j++) {
      const y0 = H * (0.12 + (0.95 * j) / Math.max(1, levels - 1))
      const p = center.clone().addScaledVector(w, -(R + step * 8)).addScaledVector(side, lat0)
      p.y = y0
      const sideFirst = lat0 >= 0 ? side.clone() : side.clone().negate()
      const order = y0 > H * 0.6 ? [up(), sideFirst, sideFirst.clone().negate()] : [sideFirst, up(), sideFirst.clone().negate()]
      const pts = [p.toArray()]
      for (let s = 0; s < steps; s++) {
        if (probe(p, w, step * 2.5)) {
          // Blocked ahead: deflect over or around.
          let moved = false
          for (const d of order) {
            const cand = p.clone().addScaledVector(d, step)
            if (!probe(cand, w, step * 2.5) && !probe(p, d, step * 1.1)) { p.copy(cand); moved = true; break }
          }
          if (!moved) p.y += step
        } else {
          p.addScaledVector(w, step)
          // Drift back toward the original lane and height once clear.
          const lat = p.clone().sub(center).dot(side)
          const back = side.clone().multiplyScalar((lat0 - lat) * 0.12).add(new THREE.Vector3(0, (y0 - p.y) * 0.12, 0))
          const len = back.length()
          if (len > 1e-3 && !probe(p, back.clone().normalize(), len + 0.05)) p.add(back)
        }
        pts.push(p.toArray())
      }
      lines.push({ points: pts, speed: heightFactor(y0, terrain) / erTop })
    }
  }
  return lines
}

function up() { return new THREE.Vector3(0, 1, 0) }
