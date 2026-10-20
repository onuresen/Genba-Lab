import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const LOW  = new THREE.Color('#bfdbfe')
const MID  = new THREE.Color('#2563eb')
const HIGH = new THREE.Color('#dc2626')
const PLANE = new THREE.PlaneGeometry(1, 1)
const tmp = new THREE.Object3D()

// Map a pressure score (0–20) to a colour: light blue → deep blue → red
function pressureColor(score) {
  const t = Math.min(score / 20, 1)
  if (t < 0.5) return LOW.clone().lerp(MID, t * 2)
  return MID.clone().lerp(HIGH, (t - 0.5) * 2)
}

function buildFaces(parts, visible) {
  const faces = []
  for (const part of parts) {
    if (!visible[part.id]) continue
    const [px, py, pz] = part.pos
    const [W, H, D] = part.size
    faces.push(
      // Windward (+X) — highest driving-rain pressure
      { pos: [px + W / 2 + 0.02, py, pz], rot: [0,  Math.PI / 2, 0], w: D, h: H, k: 0.8 },
      // Leeward  (-X) — suction, very low
      { pos: [px - W / 2 - 0.02, py, pz], rot: [0, -Math.PI / 2, 0], w: D, h: H, k: 0.1 },
      // Roof     (+Y) — ponding risk
      { pos: [px, py + H / 2 + 0.02, pz], rot: [-Math.PI / 2, 0, 0], w: W, h: D, k: 0.4 },
      // Side     (+Z)
      { pos: [px, py, pz + D / 2 + 0.02], rot: [0, 0, 0],            w: W, h: H, k: 0.5 },
      // Side     (-Z)
      { pos: [px, py, pz - D / 2 - 0.02], rot: [0, Math.PI, 0],      w: W, h: H, k: 0.5 },
    )
  }
  return faces
}

// All pressure planes in one instanced mesh with one pulsing material
// (was a mesh + material per face: ~200 draw calls on a 40-part model).
export default function WaterPressure({ parts, visible, windSpeed }) {
  const meshRef = useRef()
  const matRef = useRef()
  const faces = useMemo(() => buildFaces(parts ?? [], visible ?? {}), [parts, visible])
  const ws = windSpeed ?? 8

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    faces.forEach((f, i) => {
      tmp.position.set(...f.pos)
      tmp.rotation.set(...f.rot)
      tmp.scale.set(f.w, f.h, 1)
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
      mesh.setColorAt(i, pressureColor(ws * f.k))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [faces, ws])

  useFrame(({ clock }) => {
    if (matRef.current) matRef.current.opacity = 0.25 + 0.1 * Math.sin(clock.elapsedTime * 2)
  })

  if (!faces.length) return null

  return (
    <instancedMesh key={faces.length} ref={meshRef} args={[PLANE, null, faces.length]}>
      <meshBasicMaterial
        ref={matRef}
        transparent
        opacity={0.3}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  )
}
