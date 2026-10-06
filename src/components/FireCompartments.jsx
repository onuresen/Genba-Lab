import { useMemo } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

const GRADE_ORDER = { 'non-rated': 0, '1hr': 1, '2hr': 2 }
const COMPARTMENT_COLORS = {
  'non-rated': '#e74c3c',
  '1hr':       '#f39c12',
  '2hr':       '#27ae60',
}
const BSL_LIMIT_M2 = 500 // unsprinklered max

function worstGrade(grades) {
  return grades.reduce((worst, g) =>
    (GRADE_ORDER[g] ?? 0) < (GRADE_ORDER[worst] ?? 0) ? g : worst
  , '2hr')
}

export default function FireCompartments({ parts, visible, selectedVariants }) {
  const compartments = useMemo(() => {
    if (!parts) return []
    const map = new Map()
    for (const part of parts) {
      if (!visible[part.id]) continue
      const label = part.fire_compartment ?? 'default'
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(part)
    }

    return Array.from(map.entries()).map(([label, grp]) => {
      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity
      let minZ = Infinity, maxZ = -Infinity
      const grades = []

      for (const part of grp) {
        const [px, py, pz] = part.pos
        const [W, H, D] = part.size
        minX = Math.min(minX, px - W / 2); maxX = Math.max(maxX, px + W / 2)
        minY = Math.min(minY, py - H / 2); maxY = Math.max(maxY, py + H / 2)
        minZ = Math.min(minZ, pz - D / 2); maxZ = Math.max(maxZ, pz + D / 2)
        const vi = selectedVariants?.[part.id] ?? 0
        grades.push(part.variants[vi]?.fire_resistance_grade ?? 'non-rated')
      }

      const w = maxX - minX, h = maxY - minY, d = maxZ - minZ
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const cz = (minZ + maxZ) / 2
      const area = +(w * d).toFixed(1)
      const grade = worstGrade(grades)
      const compliant = area <= BSL_LIMIT_M2

      return { label, w, h, d, cx, cy, cz, area, grade, compliant }
    })
  }, [parts, visible, selectedVariants])

  return (
    <group>
      {compartments.map(({ label, w, h, d, cx, cy, cz, area, grade, compliant }) => {
        const color = COMPARTMENT_COLORS[grade] ?? '#888'
        return (
          <group key={label}>
            {/* Wireframe bounding box */}
            <mesh position={[cx, cy, cz]}>
              <boxGeometry args={[w + 0.1, h + 0.1, d + 0.1]} />
              <meshBasicMaterial color={color} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <lineSegments position={[cx, cy, cz]}>
              <edgesGeometry args={[new THREE.BoxGeometry(w + 0.1, h + 0.1, d + 0.1)]} />
              <lineBasicMaterial color={color} transparent opacity={0.7} />
            </lineSegments>

            {/* Label above compartment */}
            <Html position={[cx, cy + h / 2 + 0.5, cz]} center distanceFactor={12}>
              <div style={{
                background: color + 'dd', color: '#fff', fontSize: 10, fontWeight: 700,
                fontFamily: "'Segoe UI', sans-serif", padding: '3px 8px', borderRadius: 4,
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                {label} · {area} m² · {grade}
                {!compliant && <span style={{ marginLeft: 4 }}>⚠ &gt;{BSL_LIMIT_M2}m²</span>}
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
