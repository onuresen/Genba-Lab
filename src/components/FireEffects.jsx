import { useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function FireColumn({ part, status, intensity }) {
  const flameRef = useRef()
  const smokeRef = useRef()
  const ringRef = useRef()
  const emberRef = useRef()
  const lightRef = useRef()
  const intensityScale = 0.75 + (intensity / 100) * 1.25

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
      smokeRef.current.position.y = part.size[1] / 2 + 0.9 + Math.sin(t * 1.4 + part.sequence) * 0.12
      smokeRef.current.scale.setScalar(isFailed ? 1.7 : intensityScale * (1.1 + Math.sin(t * 1.8) * 0.08))
    }
    if (ringRef.current) {
      const s = 1.2 + ((t * 0.7 + part.sequence * 0.13) % 1) * 1.7
      ringRef.current.scale.setScalar(s * intensityScale)
      ringRef.current.material.opacity = isFailed ? 0.08 : 0.28 * (2.9 - s) / 1.7
    }
    if (lightRef.current) {
      lightRef.current.intensity = isFailed ? 0.4 : 1.6 + (intensity / 100) * 2.2 + Math.sin(t * 8) * 0.35
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
    <group position={[px, topY + 0.08, pz]}>
      {!isFailed && (
        <>
          <pointLight ref={lightRef} position={[0, 0.85, 0]} color="#ff7a18" distance={5 + intensityScale * 2} decay={2} />
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
          <group ref={emberRef}>
            {embers.map((_, i) => (
              <mesh key={i}>
                <sphereGeometry args={[0.035, 6, 6]} />
                <meshBasicMaterial color={i % 3 === 0 ? '#ffd166' : '#ff5f1f'} transparent opacity={0.72} depthWrite={false} />
              </mesh>
            ))}
          </group>
        </>
      )}

      <mesh ref={smokeRef} position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.46, 14, 10]} />
        <meshBasicMaterial color={isFailed ? '#2b2d31' : '#5f6872'} transparent opacity={isFailed ? 0.34 : 0.22} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.025, 8, 48]} />
        <meshBasicMaterial color={isFailed ? '#331111' : '#ff5f1f'} transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      <Html position={[0, 1.65, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className={`hazard-fx-label ${isFailed ? 'hazard-fx-label--failed' : ''}`}>
          {isFailed ? 'FAILED' : 'BURNING'}
        </div>
      </Html>
    </group>
  )
}

export default function FireEffects({ parts, visible, fireState, intensity = 65 }) {
  if (!parts || !visible || !fireState) return null
  return (
    <group>
      {parts
        .filter(part => visible[part.id] && (fireState[part.id] === 'burning' || fireState[part.id] === 'failed'))
        .map(part => (
          <FireColumn key={part.id} part={part} status={fireState[part.id]} intensity={intensity} />
        ))}
    </group>
  )
}
