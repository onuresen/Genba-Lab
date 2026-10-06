import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const LOW  = new THREE.Color('#bfdbfe')
const MID  = new THREE.Color('#2563eb')
const HIGH = new THREE.Color('#dc2626')

// Map a pressure score (0–20) to a colour: light blue → deep blue → red
function pressureColor(score) {
  const t = Math.min(score / 20, 1)
  if (t < 0.5) return LOW.clone().lerp(MID, t * 2)
  return MID.clone().lerp(HIGH, (t - 0.5) * 2)
}

export default function WaterPressure({ parts, visible, windSpeed }) {
  const t = useRef(0)
  const matRefs = useRef([])

  useFrame((_, delta) => {
    t.current += delta
    const opacity = 0.25 + 0.1 * Math.sin(t.current * 2)
    for (const mat of matRefs.current) {
      if (mat) mat.opacity = opacity
    }
  })

  if (!parts || !visible) return null

  const ws = windSpeed ?? 8
  const faces = []

  for (const part of parts) {
    if (!visible[part.id]) continue
    const [px, py, pz] = part.pos
    const [W, H, D] = part.size

    faces.push(
      // Windward (+X) — highest driving-rain pressure
      { pos: [px + W / 2 + 0.02, py, pz], rot: [0,  Math.PI / 2, 0], w: D, h: H, score: ws * 0.8 },
      // Leeward  (-X) — suction, very low
      { pos: [px - W / 2 - 0.02, py, pz], rot: [0, -Math.PI / 2, 0], w: D, h: H, score: ws * 0.1 },
      // Roof     (+Y) — ponding risk
      { pos: [px, py + H / 2 + 0.02, pz], rot: [-Math.PI / 2, 0, 0], w: W, h: D, score: ws * 0.4 },
      // Side     (+Z)
      { pos: [px, py, pz + D / 2 + 0.02], rot: [0, 0, 0],            w: W, h: H, score: ws * 0.5 },
      // Side     (-Z)
      { pos: [px, py, pz - D / 2 - 0.02], rot: [0, Math.PI, 0],      w: W, h: H, score: ws * 0.5 },
    )
  }

  return (
    <group>
      {faces.map((f, i) => (
        <mesh key={i} position={f.pos} rotation={f.rot}>
          <planeGeometry args={[f.w, f.h]} />
          <meshBasicMaterial
            ref={el => { matRefs.current[i] = el }}
            color={pressureColor(f.score)}
            transparent
            opacity={0.3}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}
