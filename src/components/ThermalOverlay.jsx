import { useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { inferThermalConductivity, thermalColor } from '../utils/materialMetrics'

function midPoint(a, b) {
  return [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ]
}

function ThermalNode({ item }) {
  const ref = useRef()

  useFrame(({ clock }) => {
    if (!ref.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 3.2 + item.phase) * 0.18
    ref.current.scale.setScalar(pulse)
  })

  return (
    <group position={item.position}>
      <mesh ref={ref}>
        <sphereGeometry args={[item.radius, 20, 20]} />
        <meshStandardMaterial
          color={item.color}
          emissive={item.color}
          emissiveIntensity={0.75}
          transparent
          opacity={0.82}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[item.radius * 1.7, 0.018, 8, 36]} />
        <meshBasicMaterial color={item.color} transparent opacity={0.55} />
      </mesh>
      <Html position={[0, item.radius + 0.18, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className="thermal-label">
          <span>{item.risk}</span>
          {item.conductivity.toFixed(item.conductivity >= 10 ? 0 : 2)} W/mK
        </div>
      </Html>
    </group>
  )
}

export default function ThermalOverlay({ parts, visible, selectedVariants }) {
  const nodes = useMemo(() => {
    if (!parts) return []
    const byId = new Map(parts.map(part => [part.id, part]))
    const rendered = new Set()

    return parts.flatMap(partA => {
      if (!visible[partA.id]) return []
      return (partA.connections ?? []).flatMap((conn, idx) => {
        const partB = byId.get(conn.to)
        if (!partB || !visible[partB.id]) return []
        const key = [partA.id, partB.id].sort().join('|')
        if (rendered.has(key)) return []
        rendered.add(key)

        const variantA = partA.variants[selectedVariants[partA.id] ?? 0]
        const variantB = partB.variants[selectedVariants[partB.id] ?? 0]
        const conductivity = Math.max(inferThermalConductivity(variantA), inferThermalConductivity(variantB))
        const color = thermalColor(conductivity)
        const risk = conductivity > 30 ? 'High bridge' : conductivity > 2 ? 'Medium bridge' : 'Low bridge'
        const center = midPoint(partA.pos, partB.pos)

        return [{
          key,
          position: [center[0], center[1] + 0.18, center[2]],
          conductivity,
          color,
          risk,
          phase: idx + partA.sequence * 0.7,
          radius: Math.max(0.09, Math.min(0.22, 0.08 + Math.log10(Math.max(conductivity, 0.05) + 1) * 0.055)),
        }]
      })
    })
  }, [parts, visible, selectedVariants])

  return (
    <group>
      {nodes.map(item => <ThermalNode key={item.key} item={item} />)}
    </group>
  )
}
