import { useLayoutEffect, useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { inferThermalConductivity, thermalColor } from '../utils/materialMetrics'

// Labels only for the worst bridges: every <Html> reprojects each frame, and
// a 100-node cloud of labels is unreadable anyway.
const LABEL_LIMIT = 8
const SPHERE = new THREE.SphereGeometry(1, 20, 14)
const RING = new THREE.TorusGeometry(1.7, 0.08, 8, 36)
const tmp = new THREE.Object3D()
const tmpColor = new THREE.Color()

function midPoint(a, b) {
  return [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
  ]
}

// One node per visible connection, at its midpoint, coloured by the worse λ.
// Spheres and rings are two instanced meshes (was 2 meshes + 1 label per node).
export default function ThermalOverlay({ parts, visible, selectedVariants, frame }) {
  const sphereRef = useRef()
  const ringRef = useRef()
  const unit = Math.max(1, (frame?.radius ?? 4) / 4.5)

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
          position: [center[0], center[1] + 0.18 * unit, center[2]],
          conductivity,
          color,
          risk,
          phase: idx + partA.sequence * 0.7,
          radius: unit * Math.max(0.09, Math.min(0.22, 0.08 + Math.log10(Math.max(conductivity, 0.05) + 1) * 0.055)),
        }]
      })
    })
  }, [parts, visible, selectedVariants, unit])

  const labelled = useMemo(
    () => [...nodes].sort((a, b) => b.conductivity - a.conductivity).slice(0, LABEL_LIMIT),
    [nodes]
  )

  useLayoutEffect(() => {
    nodes.forEach((n, i) => {
      tmpColor.set(n.color)
      sphereRef.current?.setColorAt(i, tmpColor)
      ringRef.current?.setColorAt(i, tmpColor)
      tmp.position.set(...n.position)
      tmp.rotation.set(Math.PI / 2, 0, 0)
      tmp.scale.setScalar(n.radius)
      tmp.updateMatrix()
      ringRef.current?.setMatrixAt(i, tmp.matrix)
    })
    for (const ref of [sphereRef, ringRef]) {
      if (!ref.current) continue
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    }
  }, [nodes])

  useFrame(({ clock }) => {
    const mesh = sphereRef.current
    if (!mesh) return
    nodes.forEach((n, i) => {
      tmp.position.set(...n.position)
      tmp.rotation.set(0, 0, 0)
      tmp.scale.setScalar(n.radius * (1 + Math.sin(clock.elapsedTime * 3.2 + n.phase) * 0.18))
      tmp.updateMatrix()
      mesh.setMatrixAt(i, tmp.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  if (!nodes.length) return null

  return (
    <group>
      <instancedMesh key={`s${nodes.length}`} ref={sphereRef} args={[SPHERE, null, nodes.length]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.85} depthWrite={false} />
      </instancedMesh>
      <instancedMesh key={`r${nodes.length}`} ref={ringRef} args={[RING, null, nodes.length]} frustumCulled={false}>
        <meshBasicMaterial transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      {labelled.map(item => (
        <Html key={item.key} position={[item.position[0], item.position[1] + item.radius + 0.18 * unit, item.position[2]]} center style={{ pointerEvents: 'none' }}>
          <div className="thermal-label">
            <span>{item.risk}</span>
            {item.conductivity.toFixed(item.conductivity >= 10 ? 0 : 2)} W/mK
          </div>
        </Html>
      ))}
    </group>
  )
}
