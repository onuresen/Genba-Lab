import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const WIND_DIR = new THREE.Vector3(-1, 0, 0) // wind blows in -X direction

// For each visible box part, emit arrows on windward, leeward, and roof faces
function buildArrows(parts, visible) {
  const arrows = []
  for (const part of parts) {
    if (!visible[part.id]) continue
    const [px, py, pz] = part.pos
    const [W, H, D] = part.size

    // Windward face (facing +X — perpendicular to wind direction)
    arrows.push({ pos: [px + W / 2, py, pz], dir: [1, 0, 0], type: 'windward', partId: part.id })
    // Leeward face (facing -X — suction)
    arrows.push({ pos: [px - W / 2, py, pz], dir: [-1, 0, 0], type: 'leeward', partId: part.id })
    // Roof face (uplift)
    arrows.push({ pos: [px, py + H / 2, pz], dir: [0, 1, 0], type: 'roof', partId: part.id })
    // Side faces
    arrows.push({ pos: [px, py, pz + D / 2], dir: [0, 0, 1], type: 'side', partId: part.id })
    arrows.push({ pos: [px, py, pz - D / 2], dir: [0, 0, -1], type: 'side', partId: part.id })
  }
  return arrows
}

// One arrow = a cone (head) + a thin cylinder (shaft)
function Arrow({ position, direction, color, scale }) {
  const shaftLen = 0.6 * scale
  const coneH = 0.28 * scale
  const coneR = 0.1 * scale
  const shaftR = 0.035 * scale

  // Quaternion to align Y-axis with direction
  const dir = new THREE.Vector3(...direction).normalize()
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)

  const shaftOffset = dir.clone().multiplyScalar(shaftLen / 2)
  const coneOffset  = dir.clone().multiplyScalar(shaftLen + coneH / 2)

  return (
    <group position={position}>
      {/* Shaft */}
      <mesh
        position={[shaftOffset.x, shaftOffset.y, shaftOffset.z]}
        quaternion={[quat.x, quat.y, quat.z, quat.w]}
      >
        <cylinderGeometry args={[shaftR, shaftR, shaftLen, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
      {/* Head */}
      <mesh
        position={[coneOffset.x, coneOffset.y, coneOffset.z]}
        quaternion={[quat.x, quat.y, quat.z, quat.w]}
      >
        <coneGeometry args={[coneR, coneH, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} />
      </mesh>
    </group>
  )
}

export default function WindArrows({ parts, visible, windSpeed }) {
  const groupRef = useRef()
  const t = useRef(0)

  useFrame((_, delta) => {
    t.current += delta
    // Pulse scale with wind speed
    if (groupRef.current) {
      const pulse = 1 + Math.sin(t.current * 3) * 0.12 * (windSpeed / 12)
      groupRef.current.scale.setScalar(pulse)
    }
  })

  if (!parts || !visible) return null

  const arrows = buildArrows(parts, visible)
  const speedScale = Math.max(0.5, Math.min(2, windSpeed / 10))

  return (
    <group ref={groupRef}>
      {arrows.map((a, i) => {
        let color, scale
        if (a.type === 'windward') {
          color = '#3498db'   // blue — pressure in
          scale = speedScale * 1.1
        } else if (a.type === 'leeward') {
          color = '#e74c3c'   // red — suction out
          scale = speedScale * 0.7
        } else if (a.type === 'roof') {
          color = '#f39c12'   // orange — uplift
          scale = speedScale * 0.85
        } else {
          color = '#9b59b6'   // purple — side pressure
          scale = speedScale * 0.5
        }
        return (
          <Arrow
            key={i}
            position={a.pos}
            direction={a.dir}
            color={color}
            scale={scale}
          />
        )
      })}
    </group>
  )
}
