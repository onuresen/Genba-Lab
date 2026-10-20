import { useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Above this many fire parts: no per-part labels, embers or rings.
const DETAIL_LIMIT = 12
// Point lights are expensive per pixel, and changing their number recompiles
// every material. A fixed pool follows the first burning parts instead of one
// light per part.
const LIGHT_POOL = 3

// Flames sized for a ≈1 m kit part, scaled with the part's volume.
function partScale(part) {
  const [w, h, d] = part.size
  return Math.min(3.5, Math.max(0.6, Math.cbrt(w * h * d) / 1.5))
}

function FireColumn({ part, status, intensity, detailed }) {
  const flameRef = useRef()
  const smokeRef = useRef()
  const ringRef = useRef()
  const emberRef = useRef()
  const intensityScale = 0.75 + (intensity / 100) * 1.25
  const k = partScale(part)

  const embers = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    angle: i * 0.91,
    radius: 0.22 + (i % 5) * 0.09,
    lift: 0.2 + (i % 5) * 0.18,
  })), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const isFailed = status === 'failed'
    const pulse = 1 + Math.sin(t * 7 + part.sequence) * 0.18
    if (flameRef.current) {
      flameRef.current.scale.set(
        intensityScale * pulse,
        isFailed ? 0.25 : intensityScale * (1.25 + Math.sin(t * 4) * 0.12),
        intensityScale * pulse
      )
      flameRef.current.rotation.y = t * 0.9
    }
    if (smokeRef.current) {
      smokeRef.current.position.y = 0.9 + Math.sin(t * 1.4 + part.sequence) * 0.12
      smokeRef.current.scale.setScalar(isFailed ? 1.7 : intensityScale * (1.1 + Math.sin(t * 1.8) * 0.08))
    }
    if (ringRef.current) {
      const s = 1.2 + ((t * 0.7 + part.sequence * 0.13) % 1) * 1.7
      ringRef.current.scale.setScalar(s * intensityScale)
      ringRef.current.material.opacity = isFailed ? 0.08 : 0.28 * (2.9 - s) / 1.7
    }
    if (emberRef.current) {
      emberRef.current.children.forEach((child, i) => {
        const e = embers[i]
        const a = e.angle + t * (1.4 + i * 0.04)
        child.position.set(
          Math.cos(a) * e.radius * intensityScale,
          e.lift + ((t * 0.8 + i * 0.17) % 1) * 1.1 * intensityScale,
          Math.sin(a) * e.radius * intensityScale
        )
        child.scale.setScalar(0.55 + Math.sin(t * 5 + i) * 0.18)
      })
    }
  })

  const [px, py, pz] = part.pos
  const topY = py + part.size[1] / 2
  const isFailed = status === 'failed'

  return (
    <group position={[px, topY + 0.08, pz]} scale={k}>
      {!isFailed && (
        <>
          <mesh ref={flameRef} position={[0, 0.55, 0]}>
            <coneGeometry args={[0.42, 1.35, 14]} />
            <meshBasicMaterial color="#ff7a18" transparent opacity={0.82} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh position={[0, 0.7, 0]} scale={[0.7 * intensityScale, 1.15 * intensityScale, 0.7 * intensityScale]}>
            <coneGeometry args={[0.32, 1.0, 14]} />
            <meshBasicMaterial color="#ffe08a" transparent opacity={0.76} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh position={[0, 0.35, 0]} scale={[1.35 * intensityScale, 0.4, 1.35 * intensityScale]}>
            <sphereGeometry args={[0.36, 16, 10]} />
            <meshBasicMaterial color="#ff2d1a" transparent opacity={0.26} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {detailed && (
            <group ref={emberRef}>
              {embers.map((_, i) => (
                <mesh key={i}>
                  <sphereGeometry args={[0.035, 6, 6]} />
                  <meshBasicMaterial color={i % 3 === 0 ? '#ffd166' : '#ff5f1f'} transparent opacity={0.72} depthWrite={false} />
                </mesh>
              ))}
            </group>
          )}
        </>
      )}

      <mesh ref={smokeRef} position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.46, 14, 10]} />
        <meshBasicMaterial color={isFailed ? '#2b2d31' : '#5f6872'} transparent opacity={isFailed ? 0.34 : 0.22} depthWrite={false} />
      </mesh>
      {detailed && (
        <mesh ref={ringRef} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.025, 8, 48]} />
          <meshBasicMaterial color={isFailed ? '#331111' : '#ff5f1f'} transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      {detailed && (
        <Html position={[0, 1.65, 0]} center style={{ pointerEvents: 'none' }}>
          <div className={`hazard-fx-label ${isFailed ? 'hazard-fx-label--failed' : ''}`}>
            {isFailed ? 'FAILED' : 'BURNING'}
          </div>
        </Html>
      )}
    </group>
  )
}

function FireLights({ burning, intensity }) {
  const refs = useRef([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    refs.current.forEach((light, i) => {
      if (!light) return
      light.intensity = burning[i] ? 1.6 + (intensity / 100) * 2.2 + Math.sin(t * 8 + i) * 0.35 : 0
    })
  })
  return Array.from({ length: LIGHT_POOL }, (_, i) => {
    const part = burning[i]
    const k = part ? partScale(part) : 1
    const pos = part ? [part.pos[0], part.pos[1] + part.size[1] / 2 + 0.9 * k, part.pos[2]] : [0, -100, 0]
    return (
      <pointLight
        key={i}
        ref={el => { refs.current[i] = el }}
        position={pos}
        color="#ff7a18"
        intensity={0}
        distance={(5 + (0.75 + intensity / 80) * 2) * k}
        decay={2}
      />
    )
  })
}

export default function FireEffects({ parts, visible, fireState, intensity = 65 }) {
  if (!parts || !visible || !fireState) return null
  const onFire = parts.filter(part => visible[part.id] && (fireState[part.id] === 'burning' || fireState[part.id] === 'failed'))
  const burning = onFire.filter(part => fireState[part.id] === 'burning')
  const detailed = onFire.length <= DETAIL_LIMIT
  return (
    <group>
      <FireLights burning={burning} intensity={intensity} />
      {onFire.map(part => (
        <FireColumn key={part.id} part={part} status={fireState[part.id]} intensity={intensity} detailed={detailed} />
      ))}
    </group>
  )
}
