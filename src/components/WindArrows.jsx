import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Wind blows in -X. Face types: windward (+X, pressure), leeward (-X, suction),
// roof (uplift) and sides.
const TYPES = {
  windward: { color: '#3498db', scale: 1.1 },
  leeward:  { color: '#e74c3c', scale: 0.7 },
  roof:     { color: '#f39c12', scale: 0.85 },
  side:     { color: '#9b59b6', scale: 0.5 },
}

const UP = new THREE.Vector3(0, 1, 0)
const SHAFT = new THREE.CylinderGeometry(1, 1, 1, 8)
const HEAD = new THREE.ConeGeometry(1, 1, 10)
const tmp = new THREE.Object3D()
const tmpColor = new THREE.Color()

// For each visible part, emit arrows on windward, leeward, roof and side faces.
function buildArrows(parts, visible) {
  const arrows = []
  for (const part of parts) {
    if (!visible[part.id]) continue
    const [px, py, pz] = part.pos
    const [W, H, D] = part.size
    arrows.push({ pos: [px + W / 2, py, pz], dir: [1, 0, 0], type: 'windward' })
    arrows.push({ pos: [px - W / 2, py, pz], dir: [-1, 0, 0], type: 'leeward' })
    arrows.push({ pos: [px, py + H / 2, pz], dir: [0, 1, 0], type: 'roof' })
    arrows.push({ pos: [px, py, pz + D / 2], dir: [0, 0, 1], type: 'side' })
    arrows.push({ pos: [px, py, pz - D / 2], dir: [0, 0, -1], type: 'side' })
  }
  return arrows.map(a => ({
    ...a,
    quat: new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...a.dir)),
  }))
}

// All shafts in one instanced mesh and all heads in another
// (was two meshes per arrow: ~400 draw calls on a 40-part model).
export default function WindArrows({ parts, visible, windSpeed, frame }) {
  const shaftRef = useRef()
  const headRef = useRef()
  const arrows = useMemo(() => buildArrows(parts ?? [], visible ?? {}), [parts, visible])
  // Sized for the 5 m kit, then scaled with the model.
  const unit = Math.max(1, (frame?.radius ?? 4) / 4.5)
  const speedScale = Math.max(0.5, Math.min(2, windSpeed / 10))

  useLayoutEffect(() => {
    arrows.forEach((a, i) => {
      tmpColor.set(TYPES[a.type].color)
      shaftRef.current?.setColorAt(i, tmpColor)
      headRef.current?.setColorAt(i, tmpColor)
    })
    if (shaftRef.current?.instanceColor) shaftRef.current.instanceColor.needsUpdate = true
    if (headRef.current?.instanceColor) headRef.current.instanceColor.needsUpdate = true
  }, [arrows])

  useFrame(({ clock }) => {
    if (!shaftRef.current || !headRef.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.12 * (windSpeed / 12)
    arrows.forEach((a, i) => {
      const s = speedScale * TYPES[a.type].scale * unit * pulse
      const shaftLen = 0.6 * s
      const coneH = 0.28 * s
      const [x, y, z] = a.pos
      const [dx, dy, dz] = a.dir
      tmp.quaternion.copy(a.quat)

      tmp.position.set(x + dx * shaftLen / 2, y + dy * shaftLen / 2, z + dz * shaftLen / 2)
      tmp.scale.set(0.035 * s, shaftLen, 0.035 * s)
      tmp.updateMatrix()
      shaftRef.current.setMatrixAt(i, tmp.matrix)

      const c = shaftLen + coneH / 2
      tmp.position.set(x + dx * c, y + dy * c, z + dz * c)
      tmp.scale.set(0.1 * s, coneH, 0.1 * s)
      tmp.updateMatrix()
      headRef.current.setMatrixAt(i, tmp.matrix)
    })
    shaftRef.current.instanceMatrix.needsUpdate = true
    headRef.current.instanceMatrix.needsUpdate = true
  })

  if (!arrows.length) return null

  return (
    <group>
      <instancedMesh key={`s${arrows.length}`} ref={shaftRef} args={[SHAFT, null, arrows.length]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.85} />
      </instancedMesh>
      <instancedMesh key={`h${arrows.length}`} ref={headRef} args={[HEAD, null, arrows.length]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.85} />
      </instancedMesh>
    </group>
  )
}
