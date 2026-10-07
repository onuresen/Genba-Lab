import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { partWorldEntries } from '../utils/worldMesh'
import { buildCollisionMesh, isDrainPart, simulateRunoff } from '../utils/waterFlow'

const MAX_DROPS = 320
const MAX_POOLS = 240
const MAX_STREAKS = 220
const DROP_SPEED = 2.2 // m/s along a path (visual only)
const COLORS = { pond: '#1d4ed8', ground: '#0891b2', drain: '#16a34a' }
const dummy = new THREE.Object3D()

// Surfaces to rain on, plus drain boxes that catch water.
function collectEntries(parts, visible) {
  const drains = parts.filter(p => visible[p.id] && isDrainPart(p)).map(p => {
    const h = p.size.map(s => s / 2)
    return {
      partId: p.id,
      box: new THREE.Box3(
        new THREE.Vector3(p.pos[0] - h[0], p.pos[1] - h[1], p.pos[2] - h[2]),
        new THREE.Vector3(p.pos[0] + h[0], p.pos[1] + h[1], p.pos[2] + h[2]),
      ),
    }
  })
  return { entries: partWorldEntries(parts, visible, isDrainPart), drains }
}

// Path polyline → cumulative lengths, for moving droplets along it.
function measure(path) {
  const cum = [0]
  for (let i = 1; i < path.length; i++) {
    const [ax, ay, az] = path[i - 1], [bx, by, bz] = path[i]
    cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay, bz - az))
  }
  return { path, cum, length: cum[cum.length - 1] }
}

function pointAt(m, s, out) {
  const { path, cum } = m
  let i = 1
  while (i < cum.length - 1 && cum[i] < s) i++
  const t = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0
  const a = path[i - 1], b = path[i]
  out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)
}

/**
 * Rain runoff on the real model: flow lines, moving droplets, ponds and drip zones.
 * Recomputes when the visible parts or the rainfall change.
 */
export default function WaterFlow({ parts, visible, rainfall, onResult }) {
  const [result, setResult] = useState(null)
  const dropsRef = useRef()
  const poolsRef = useRef()
  const streaksRef = useRef()
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    let cancelled = false
    onResult?.({ busy: true })
    // Next tick, so the "computing" state can render first.
    const id = setTimeout(() => {
      const { entries, drains } = collectEntries(parts, visible)
      if (!entries.length) { setResult(null); onResult?.(null); return }
      const mesh = buildCollisionMesh(entries)
      const r = simulateRunoff(mesh, { rainfallMmH: rainfall, drains })
      mesh.geometry.dispose()
      if (cancelled) return
      setResult(r)
      onResult?.(r)
    }, 30)
    return () => { cancelled = true; clearTimeout(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, visible, rainfall])

  // One line batch for all flow paths.
  const lines = useMemo(() => {
    if (!result) return null
    const pts = []
    for (const path of result.paths) {
      for (let i = 1; i < path.length; i++) pts.push(...path[i - 1], ...path[i])
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [result])
  useEffect(() => () => lines?.dispose(), [lines])

  const measured = useMemo(() => (result?.paths ?? []).map(measure).filter(m => m.length > 0.05), [result])
  const drops = useMemo(() => Array.from({ length: Math.min(MAX_DROPS, measured.length * 3) }, (_, i) => ({
    m: measured[i % Math.max(1, measured.length)],
    phase: (i * 0.618) % 1,
  })), [measured])

  const pools = useMemo(() => {
    if (!result) return []
    const maxFlow = result.collect[0]?.flow || 1
    return result.collect.slice(0, MAX_POOLS).map(c => ({
      ...c,
      r: 0.25 + 1.6 * Math.sqrt(c.flow / maxFlow),
    }))
  }, [result])

  const bounds = useMemo(() => {
    const b = new THREE.Box3()
    for (const p of parts) {
      if (!visible[p.id]) continue
      b.expandByPoint(new THREE.Vector3(p.pos[0] - p.size[0] / 2, 0, p.pos[2] - p.size[2] / 2))
      b.expandByPoint(new THREE.Vector3(p.pos[0] + p.size[0] / 2, p.pos[1] + p.size[1] / 2, p.pos[2] + p.size[2] / 2))
    }
    return b
  }, [parts, visible])

  const streaks = useMemo(() => Array.from({ length: MAX_STREAKS }, (_, i) => ({
    x: Math.random(), z: Math.random(), phase: (i * 0.37) % 1,
  })), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (dropsRef.current) {
      drops.forEach((d, i) => {
        if (!d.m) return
        const s = ((t * DROP_SPEED / d.m.length + d.phase) % 1) * d.m.length
        pointAt(d.m, s, tmp)
        dummy.position.copy(tmp)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        dropsRef.current.setMatrixAt(i, dummy.matrix)
      })
      dropsRef.current.count = drops.length
      dropsRef.current.instanceMatrix.needsUpdate = true
    }
    if (poolsRef.current) {
      pools.forEach((p, i) => {
        const pulse = 1 + Math.sin(t * 2 + i) * 0.04
        dummy.position.set(p.x, p.y + 0.02, p.z)
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.scale.setScalar(p.r * pulse)
        dummy.updateMatrix()
        poolsRef.current.setMatrixAt(i, dummy.matrix)
        poolsRef.current.setColorAt(i, new THREE.Color(COLORS[p.kind]))
      })
      dummy.rotation.set(0, 0, 0)
      poolsRef.current.count = pools.length
      poolsRef.current.instanceMatrix.needsUpdate = true
      if (poolsRef.current.instanceColor) poolsRef.current.instanceColor.needsUpdate = true
    }
    if (streaksRef.current && !bounds.isEmpty()) {
      const w = bounds.max.x - bounds.min.x + 4
      const d = bounds.max.z - bounds.min.z + 4
      const top = bounds.max.y + 6
      streaks.forEach((s, i) => {
        const fall = ((t * 0.9 + s.phase) % 1)
        dummy.position.set(bounds.min.x - 2 + s.x * w, top - fall * top, bounds.min.z - 2 + s.z * d)
        dummy.rotation.set(0.12, 0, 0.05)
        dummy.scale.setScalar(1)
        dummy.updateMatrix()
        streaksRef.current.setMatrixAt(i, dummy.matrix)
      })
      dummy.rotation.set(0, 0, 0)
      streaksRef.current.instanceMatrix.needsUpdate = true
    }
  })

  if (!result) return null
  const topPools = result.collect.filter(c => c.kind !== 'drain').slice(0, 3)

  return (
    <group>
      {lines && (
        <lineSegments geometry={lines}>
          <lineBasicMaterial color="#38bdf8" transparent opacity={0.55} depthWrite={false} />
        </lineSegments>
      )}
      <instancedMesh ref={dropsRef} args={[null, null, MAX_DROPS]} frustumCulled={false}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#0ea5e9" />
      </instancedMesh>
      <instancedMesh ref={poolsRef} args={[null, null, MAX_POOLS]} frustumCulled={false}>
        <circleGeometry args={[1, 24]} />
        <meshBasicMaterial transparent opacity={0.45} depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={streaksRef} args={[null, null, MAX_STREAKS]} frustumCulled={false}>
        <cylinderGeometry args={[0.012, 0.012, 0.5, 4]} />
        <meshBasicMaterial color="#93c5fd" transparent opacity={0.5} depthWrite={false} />
      </instancedMesh>
      {topPools.map((p, i) => (
        <Html key={i} position={[p.x, p.y + 0.6, p.z]} center style={{ pointerEvents: 'none' }}>
          <div className={`water-label water-label--${p.kind}`}>
            {p.kind === 'pond' ? 'Ponding' : 'Runoff'} {p.flow.toFixed(2)} m³/h
          </div>
        </Html>
      ))}
    </group>
  )
}
