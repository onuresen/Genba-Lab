import { useEffect, useMemo, useRef } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

function riskForPart(part, selectedVariants, magnitude, hasShaken) {
  const variant = part.variants?.[selectedVariants?.[part.id] ?? 0]
  const grade = variant?.seismic_grade ?? 1
  if (magnitude > grade * 3) return 'critical'
  if (magnitude > grade * 2.2) return hasShaken ? 'caution' : 'stress'
  return 'safe'
}

function ShockwaveRings({ magnitude, active }) {
  const rings = useRef([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    rings.current.forEach((ring, i) => {
      if (!ring) return
      const phase = (t * (0.55 + magnitude * 0.035) + i * 0.28) % 1
      const radius = 1.6 + phase * (5.5 + magnitude * 0.9)
      ring.scale.setScalar(radius)
      ring.material.opacity = active ? (1 - phase) * 0.35 : 0.08
    })
  })

  return (
    <group position={[0, -0.22, 0]}>
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} ref={el => { rings.current[i] = el }} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1, 0.018, 8, 96]} />
          <meshBasicMaterial color={magnitude >= 7 ? '#e74c3c' : '#f39c12'} transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function FaultLines({ magnitude, active }) {
  const lines = useMemo(() => {
    const reach = 3.5 + magnitude * 0.7
    return Array.from({ length: 7 }, (_, i) => {
      const a = -0.9 + i * 0.31
      const x = Math.cos(a) * reach * 0.25
      const z = Math.sin(a) * reach * 0.25
      return [
        [x - reach * 0.5, -0.18, z - Math.sin(i) * 0.45],
        [x - reach * 0.2, -0.17, z + Math.cos(i) * 0.28],
        [x + reach * 0.2, -0.17, z - Math.sin(i * 1.7) * 0.35],
        [x + reach * 0.56, -0.18, z + Math.cos(i * 0.8) * 0.4],
      ]
    })
  }, [magnitude])

  return (
    <group>
      {lines.map((points, i) => (
        <Line
          key={i}
          points={points}
          color={magnitude >= 7 ? '#e74c3c' : '#f39c12'}
          lineWidth={active ? 2.4 : 1.2}
          transparent
          opacity={active ? 0.45 : 0.18}
        />
      ))}
    </group>
  )
}

function StressMarkers({ parts, visible, selectedVariants, magnitude, hasShaken }) {
  return (
    <group>
      {parts
        .filter(part => visible?.[part.id] !== false)
        .map(part => {
          const risk = riskForPart(part, selectedVariants, magnitude, hasShaken)
          if (risk === 'safe') return null
          const [x, y, z] = part.pos
          const top = y + (part.size?.[1] ?? 1) / 2 + 0.55
          const color = risk === 'critical' ? '#e74c3c' : '#f39c12'
          return (
            <group key={part.id} position={[x, top, z]}>
              <mesh>
                <sphereGeometry args={[0.12, 12, 8]} />
                <meshBasicMaterial color={color} transparent opacity={0.82} depthWrite={false} />
              </mesh>
              <Html position={[0, 0.28, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
                <div className={`eq-stress-label eq-stress-label--${risk}`}>
                  {risk === 'critical' ? 'CRITICAL' : 'STRESS'}
                </div>
              </Html>
            </group>
          )
        })}
    </group>
  )
}

function CameraRumble({ active, magnitude }) {
  const { camera } = useThree()
  const base = useRef(null)

  useEffect(() => {
    if (active && !base.current) base.current = camera.position.clone()
    if (!active && base.current) {
      camera.position.copy(base.current)
      base.current = null
    }
    return () => {
      if (base.current) camera.position.copy(base.current)
    }
  }, [active, camera])

  useFrame(({ clock }) => {
    if (!active || !base.current) return
    const amp = Math.min(0.16, magnitude * 0.012)
    const t = clock.elapsedTime
    camera.position.x = base.current.x + Math.sin(t * 42) * amp + Math.sin(t * 17) * amp * 0.45
    camera.position.y = base.current.y + Math.sin(t * 33) * amp * 0.35
    camera.position.z = base.current.z + Math.cos(t * 39) * amp
  })

  return null
}

export default function EarthquakeEffects({
  parts,
  visible,
  selectedVariants,
  magnitude,
  isShaking,
  hasShaken,
}) {
  if (!parts?.length) return null
  const showStress = isShaking || hasShaken
  return (
    <group>
      <CameraRumble active={isShaking} magnitude={magnitude} />
      {(isShaking || hasShaken) && (
        <>
          <ShockwaveRings magnitude={magnitude} active={isShaking} />
          <FaultLines magnitude={magnitude} active={isShaking} />
        </>
      )}
      {showStress && (
        <StressMarkers
          parts={parts}
          visible={visible}
          selectedVariants={selectedVariants}
          magnitude={magnitude}
          hasShaken={hasShaken}
        />
      )}
    </group>
  )
}
