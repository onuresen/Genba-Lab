import { useState } from 'react'
import * as THREE from 'three'
import { Edges, Grid, Html } from '@react-three/drei'
import { useKit } from './KitContext'
import { useIfcGeometry } from '../utils/ifcGeometryStore'
import { BAY_SIZE, BAY_SPACING_X, BAY_SPACING_Z, factoryLayout } from '../utils/factoryLayout'

const WEIGHT_LIMIT_KG = 3000
const LEAD_LIMIT_DAYS = 45
// Typical road-transport limit in Japan (width × height × length, m). Indicative.
const TRANSPORT_LIMIT = [2.5, 3.8, 12]
// Above this many bays, per-bay labels only show on hover (each <Html> costs a reprojection per frame).
const LABEL_LIMIT = 30

function bayPosition(index, cols) {
  const col = index % cols
  const row = Math.floor(index / cols)
  return [
    (col - (cols - 1) / 2) * BAY_SPACING_X,
    0,
    row * BAY_SPACING_Z - 2.2,
  ]
}

function getBayWarnings(part, variant) {
  const warnings = []
  const weight = Number(variant?.weight_kg ?? 0)
  const lead = Number(variant?.lead_time_days ?? 0)
  // Smallest two sides vs width/height, longest side vs length.
  const [a, b, c] = [...part.size].sort((x, y) => x - y)
  const [lw, lh, ll] = TRANSPORT_LIMIT
  const oversize = a > lw || b > lh || c > ll

  if (weight > WEIGHT_LIMIT_KG) warnings.push({ key: 'weight', label: `${Math.round(weight).toLocaleString()} kg`, severity: weight > WEIGHT_LIMIT_KG * 1.5 ? 'high' : 'medium' })
  if (oversize) warnings.push({ key: 'size', label: `${c.toFixed(1)}×${b.toFixed(1)}×${a.toFixed(1)}m over transport`, severity: 'medium' })
  if (lead > LEAD_LIMIT_DAYS) warnings.push({ key: 'lead', label: `${lead}d lead`, severity: lead > LEAD_LIMIT_DAYS + 20 ? 'high' : 'medium' })
  return warnings
}

function FactoryPart({ part, variant, index, cols, compact, draggedPartId, dropPartId, onDragStart, onDrop }) {
  const [hovered, setHovered] = useState(false)
  const ifcGeometry = useIfcGeometry(part.shape === 'ifc' ? part.ifcGeometry : null)
  const showDetails = !compact || hovered || draggedPartId === part.id
  const [x, y, z] = bayPosition(index, cols)
  const scale = Math.min(1, 2.6 / Math.max(part.size[0], part.size[1], part.size[2]))
  const bayLabel = `Bay ${String(index + 1).padStart(2, '0')}`
  const warnings = getBayWarnings(part, variant)
  const hasHighWarning = warnings.some(w => w.severity === 'high')
  const bayColor = draggedPartId === part.id ? '#8e44ad'
    : dropPartId === part.id ? '#2ecc71'
    : warnings.length ? (hasHighWarning ? '#e74c3c' : '#f39c12')
    : part.factory_work ? '#3498db' : '#f39c12'
  const bayFill = warnings.length ? (hasHighWarning ? '#fdecea' : '#fff3cd') : part.factory_work ? '#d6eaf8' : '#fdebd0'

  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={BAY_SIZE} />
        <meshBasicMaterial color={bayFill} transparent opacity={warnings.length ? 0.34 : 0.22} depthWrite={false} />
      </mesh>
      <mesh
        position={[0, 0.025, 0]}
        onPointerDown={(e) => {
          e.stopPropagation()
          onDragStart(part.id)
          document.body.style.cursor = 'grabbing'
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          if (draggedPartId && draggedPartId !== part.id) document.body.style.cursor = 'copy'
        }}
        onPointerOut={() => {
          setHovered(false)
          if (draggedPartId) document.body.style.cursor = 'grabbing'
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          onDrop(part.id)
          document.body.style.cursor = 'auto'
        }}
      >
        <boxGeometry args={[BAY_SIZE[0], 0.02, BAY_SIZE[1]]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color={bayColor} />
      </mesh>

      <group position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[scale, scale, scale]}>
        <mesh castShadow receiveShadow>
          {ifcGeometry
            ? <primitive object={ifcGeometry} attach="geometry" dispose={null} />
            : <boxGeometry args={part.size} />}
          <meshStandardMaterial
            color={variant?.color ?? '#95a5a6'}
            roughness={0.72}
            side={ifcGeometry ? THREE.DoubleSide : THREE.FrontSide}
          />
          <Edges color="#26323d" threshold={ifcGeometry ? 30 : 15} />
        </mesh>
      </group>

      {showDetails && <Html position={[0, 1.05, -1.45]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className={`factory-bay-label ${warnings.length ? 'factory-bay-label--warning' : ''}`}>
          <span>{bayLabel}</span>
          Seq {part.sequence ?? index + 1}
        </div>
      </Html>}
      {showDetails && warnings.length > 0 && (
        <Html position={[0, 0.92, 1.28]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className={`factory-warning-stack ${hasHighWarning ? 'factory-warning-stack--high' : ''}`}>
            {warnings.map(w => <span key={w.key}>{w.label}</span>)}
          </div>
        </Html>
      )}
      {showDetails && <Html position={[0, 0.12, 1.58]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className={`factory-part-label ${draggedPartId === part.id ? 'factory-part-label--dragging' : ''}`}>
          <strong>{part.id}</strong>
          <span>{draggedPartId === part.id ? 'Drag to another bay' : part.factory_work ? 'Factory fabrication' : 'Site-prep item'}</span>
        </div>
      </Html>}
    </group>
  )
}

export default function FactoryGrid({ parts, visible, selectedVariants }) {
  const { updatePartSequences } = useKit()
  const [draggedPartId, setDraggedPartId] = useState(null)
  const [dropPartId, setDropPartId] = useState(null)
  const factoryParts = (parts ?? [])
    .filter(part => visible[part.id])
    .slice()
    .sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99))

  const { cols, width, depth, centerZ } = factoryLayout(factoryParts.length)
  const compact = factoryParts.length > LABEL_LIMIT

  function handleDragStart(partId) {
    setDraggedPartId(partId)
    setDropPartId(null)
  }

  function handleDrop(targetPartId) {
    if (!draggedPartId) return
    setDropPartId(targetPartId)
    if (draggedPartId !== targetPartId) {
      const visibleIds = factoryParts.map(part => part.id)
      const from = visibleIds.indexOf(draggedPartId)
      const to = visibleIds.indexOf(targetPartId)
      if (from >= 0 && to >= 0) {
        const nextVisibleIds = [...visibleIds]
        const [moved] = nextVisibleIds.splice(from, 1)
        nextVisibleIds.splice(to, 0, moved)
        const hiddenIds = (parts ?? [])
          .filter(part => !visible[part.id])
          .slice()
          .sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99))
          .map(part => part.id)
        updatePartSequences([...nextVisibleIds, ...hiddenIds])
      }
    }
    window.setTimeout(() => setDropPartId(null), 450)
    setDraggedPartId(null)
  }

  return (
    <group>
      <Grid
        position={[0, -0.03, centerZ]}
        args={[width, depth]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#cbd5df"
        sectionSize={BAY_SPACING_X}
        sectionThickness={1.5}
        sectionColor="#94a3b8"
        fadeDistance={60}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />

      <Html position={[0, 1.25, -4.4]} center distanceFactor={11} style={{ pointerEvents: 'none' }}>
        <div className="factory-title-label">
          <span>Prefab Factory Layout</span>
          {draggedPartId ? 'Drop on another bay to resequence' : `${factoryParts.length} visible parts · drag bays to reorder${compact ? ' · hover a bay for details' : ''}`}
        </div>
      </Html>

      {factoryParts.map((part, index) => (
        <FactoryPart
          key={part.id}
          part={part}
          variant={part.variants[selectedVariants[part.id] ?? 0]}
          index={index}
          cols={cols}
          compact={compact}
          draggedPartId={draggedPartId}
          dropPartId={dropPartId}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
        />
      ))}
    </group>
  )
}
