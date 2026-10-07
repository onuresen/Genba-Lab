import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { partWorldEntries } from '../utils/worldMesh'
import { buildCollisionMesh } from '../utils/waterFlow'
import { computeWindLoad, windStreamlines } from '../utils/windLoad'

const PRESS = new THREE.Color('#2563eb')   // pushes in
const SUCK = new THREE.Color('#dc2626')    // pulls out
const CALM = new THREE.Color('#f8fafc')
const BEADS_PER_LINE = 3
const dummy = new THREE.Object3D()
const Y = new THREE.Vector3(0, 1, 0)

// One arrow along +Y, tail at the origin, length 1.
function arrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6).translate(0, 0.35, 0)
  const head = new THREE.ConeGeometry(0.14, 0.3, 10).translate(0, 0.85, 0)
  const g = mergeGeometries([shaft.toNonIndexed(), head.toNonIndexed()])
  shaft.dispose(); head.dispose()
  return g
}

function measure(points) {
  const cum = [0]
  for (let i = 1; i < points.length; i++) {
    const [ax, ay, az] = points[i - 1], [bx, by, bz] = points[i]
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay, bz - az))
  }
  return cum
}

/**
 * Wind on the real model: pressure heat map, pressure arrows, streamlines.
 * Recomputes when the visible parts, speed, direction or terrain change.
 */
export default function WindLoad({ parts, visible, windSpeed, windDir, terrain, onResult }) {
  const [state, setState] = useState(null) // { result, lines, size }
  const arrowsRef = useRef()
  const beadsRef = useRef()
  const arrowGeo = useMemo(() => arrowGeometry(), [])
  useEffect(() => () => arrowGeo.dispose(), [arrowGeo])

  useEffect(() => {
    let cancelled = false
    onResult?.({ busy: true })
    const id = setTimeout(() => {
      const entries = partWorldEntries(parts, visible)
      if (!entries.length) { setState(null); onResult?.(null); return }
      const mesh = buildCollisionMesh(entries)
      const result = computeWindLoad(mesh, { v0: windSpeed, fromDeg: windDir, terrain })
      const lines = windStreamlines(mesh, { fromDeg: windDir, terrain })
      const b = mesh.bounds
      const size = Math.max(b.max.y, b.max.x - b.min.x, b.max.z - b.min.z)
      mesh.geometry.dispose()
      if (cancelled) return
      setState({ result, lines, size })
      onResult?.(result)
    }, 30)
    return () => { cancelled = true; clearTimeout(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, visible, windSpeed, windDir, terrain])

  const result = state?.result
  const maxAbs = result ? Math.max(1, result.peakPa, -result.peakSuctionPa) : 1

  // Heat map: one colour per triangle, blue = pressure, red = suction.
  const heat = useMemo(() => {
    if (!result) return null
    const { positions, pressure } = result.faces
    const colors = new Float32Array(positions.length)
    const col = new THREE.Color()
    for (let t = 0; t < pressure.length; t++) {
      const k = Math.min(1, Math.abs(pressure[t]) / maxAbs)
      col.copy(CALM).lerp(pressure[t] >= 0 ? PRESS : SUCK, 0.25 + 0.75 * k)
      for (let v = 0; v < 3; v++) colors.set([col.r, col.g, col.b], t * 9 + v * 3)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [result, maxAbs])
  useEffect(() => () => heat?.dispose(), [heat])

  // Arrows: static, set once per result.
  useEffect(() => {
    const mesh = arrowsRef.current
    if (!mesh || !result) return
    const L = state.size / 10
    const n = new THREE.Vector3()
    result.cells.forEach((c, i) => {
      n.fromArray(c.normal)
      const len = Math.max(0.15, L * Math.min(1, Math.abs(c.pressure) / maxAbs))
      if (c.pressure >= 0) {
        // Points into the surface, tip on it.
        dummy.position.set(c.x + n.x * len, c.y + n.y * len, c.z + n.z * len)
        dummy.quaternion.setFromUnitVectors(Y, n.clone().negate())
      } else {
        dummy.position.set(c.x, c.y, c.z)
        dummy.quaternion.setFromUnitVectors(Y, n)
      }
      const thick = Math.max(0.6, len * 0.6)
      dummy.scale.set(thick, len, thick)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, c.pressure >= 0 ? PRESS : SUCK)
    })
    mesh.count = result.cells.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    dummy.quaternion.identity()
  }, [result, state, maxAbs])

  // Streamlines: one line batch, plus beads that move with the wind.
  const flow = useMemo(() => {
    if (!state) return null
    const pts = []
    for (const l of state.lines) {
      for (let i = 1; i < l.points.length; i++) pts.push(...l.points[i - 1], ...l.points[i])
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return { geometry: g, measured: state.lines.map(l => ({ ...l, cum: measure(l.points) })) }
  }, [state])
  useEffect(() => () => flow?.geometry.dispose(), [flow])

  const beadCount = flow ? flow.measured.length * BEADS_PER_LINE : 0
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    const mesh = beadsRef.current
    if (!mesh || !flow) return
    const t = clock.elapsedTime
    const visualSpeed = 1 + windSpeed * 0.25 // m/s on screen, not to scale
    flow.measured.forEach((l, i) => {
      const total = l.cum[l.cum.length - 1] || 1
      for (let k = 0; k < BEADS_PER_LINE; k++) {
        const s = ((t * visualSpeed * l.speed) / total + k / BEADS_PER_LINE + i * 0.13) % 1 * total
        let j = 1
        while (j < l.cum.length - 1 && l.cum[j] < s) j++
        const seg = l.cum[j] - l.cum[j - 1] || 1
        const f = (s - l.cum[j - 1]) / seg
        const a = l.points[j - 1], b = l.points[j]
        tmp.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f)
        dummy.position.copy(tmp)
        dummy.scale.setScalar(Math.max(1, state.size / 25))
        dummy.updateMatrix()
        mesh.setMatrixAt(i * BEADS_PER_LINE + k, dummy.matrix)
      }
    })
    mesh.count = beadCount
    mesh.instanceMatrix.needsUpdate = true
  })

  if (!result) return null
  const peakCell = result.cells.reduce((m, c) => (c.pressure > (m?.pressure ?? -Infinity) ? c : m), null)
  const suctionCell = result.cells.reduce((m, c) => (c.pressure < (m?.pressure ?? Infinity) ? c : m), null)

  return (
    <group>
      {heat && (
        <mesh geometry={heat} renderOrder={2}>
          <meshBasicMaterial vertexColors transparent opacity={0.6} depthWrite={false} side={THREE.DoubleSide}
            polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      )}
      <instancedMesh key={`a${result.cells.length}`} ref={arrowsRef} args={[arrowGeo, null, Math.max(1, result.cells.length)]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.9} />
      </instancedMesh>
      {flow && (
        <lineSegments geometry={flow.geometry}>
          <lineBasicMaterial color="#64748b" transparent opacity={0.35} depthWrite={false} />
        </lineSegments>
      )}
      <instancedMesh key={`b${beadCount}`} ref={beadsRef} args={[null, null, Math.max(1, beadCount)]} frustumCulled={false}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.65} />
      </instancedMesh>
      {peakCell && peakCell.pressure > 0 && (
        <Html position={[peakCell.x, peakCell.y, peakCell.z]} center style={{ pointerEvents: 'none' }}>
          <div className="wind-label wind-label--press">Pressure {(peakCell.pressure / 1000).toFixed(2)} kPa</div>
        </Html>
      )}
      {suctionCell && suctionCell.pressure < 0 && (
        <Html position={[suctionCell.x, suctionCell.y, suctionCell.z]} center style={{ pointerEvents: 'none' }}>
          <div className="wind-label wind-label--suck">Suction {(suctionCell.pressure / 1000).toFixed(2)} kPa</div>
        </Html>
      )}
    </group>
  )
}
