import { useMemo, useRef } from 'react'
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function boundsFor(parts, visible) {
  const active = (parts ?? []).filter(part => visible[part.id])
  if (!active.length) return { minX: -4, maxX: 4, minY: 0, maxY: 4, minZ: -3, maxZ: 3 }
  return active.reduce((b, part) => {
    const [x, y, z] = part.pos
    const [w, h, d] = part.size
    return {
      minX: Math.min(b.minX, x - w / 2),
      maxX: Math.max(b.maxX, x + w / 2),
      minY: Math.min(b.minY, y - h / 2),
      maxY: Math.max(b.maxY, y + h / 2),
      minZ: Math.min(b.minZ, z - d / 2),
      maxZ: Math.max(b.maxZ, z + d / 2),
    }
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity })
}

export default function WindStreamlines({ parts, visible, windSpeed }) {
  const groupRef = useRef()
  const beadRefs = useRef([])
  const speed = Math.max(0.5, windSpeed ?? 8)

  const paths = useMemo(() => {
    const b = boundsFor(parts, visible)
    const minX = b.minX - 2.7
    const maxX = b.maxX + 2.8
    const zSpan = Math.max(4, b.maxZ - b.minZ + 2.2)
    const yBase = Math.max(0.45, b.minY + 0.8)
    const yTop = Math.max(yBase + 1.2, b.maxY + 1.1)
    return Array.from({ length: 9 }, (_, i) => {
      const z = b.minZ - 1.1 + (i / 8) * zSpan
      const y = yBase + (i % 3) * ((yTop - yBase) / 3)
      const phase = i * 0.7
      const points = Array.from({ length: 22 }, (_, j) => {
        const t = j / 21
        const x = maxX + (minX - maxX) * t
        return new THREE.Vector3(
          x,
          y + Math.sin(t * Math.PI * 2 + phase) * 0.16,
          z + Math.sin(t * Math.PI * 3 + phase) * 0.24
        )
      })
      return { points, phase, color: i % 3 === 0 ? '#60a5fa' : i % 3 === 1 ? '#a78bfa' : '#f59e0b' }
    })
  }, [parts, visible])

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.6) * 0.015
    }
    beadRefs.current.forEach((mesh, i) => {
      if (!mesh) return
      const path = paths[i % paths.length]
      if (!path) return
      const t = (clock.elapsedTime * (0.08 + speed * 0.012) + i * 0.19) % 1
      const idx = Math.floor(t * (path.points.length - 1))
      const a = path.points[idx]
      const b = path.points[Math.min(idx + 1, path.points.length - 1)]
      mesh.position.lerpVectors(a, b, t * (path.points.length - 1) - idx)
      mesh.scale.setScalar(0.8 + Math.sin(clock.elapsedTime * 6 + i) * 0.25)
    })
  })

  return (
    <group ref={groupRef}>
      {paths.map((path, i) => (
        <Line
          key={i}
          points={path.points}
          color={path.color}
          lineWidth={1.2 + Math.min(speed / 20, 1.4)}
          transparent
          opacity={0.34}
        />
      ))}
      {Array.from({ length: 18 }, (_, i) => (
        <mesh key={i} ref={el => { beadRefs.current[i] = el }}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshBasicMaterial color={paths[i % paths.length]?.color ?? '#60a5fa'} transparent opacity={0.78} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
