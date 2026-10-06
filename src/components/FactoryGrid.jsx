import { useState } from 'react'
import { Edges, Grid, Html } from '@react-three/drei'
import { useKit } from './KitContext'

const BAY_SPACING_X = 4.6
const BAY_SPACING_Z = 4.2
const BAY_COLS = 3
const BAY_SIZE = [3.8, 3.4]
const WEIGHT_LIMIT_KG = 3000
const LEAD_LIMIT_DAYS = 45

function bayPosition(index) {
  const col = index % BAY_COLS
  const row = Math.floor(index / BAY_COLS)
  return [
    (col - (BAY_COLS - 1) / 2) * BAY_SPACING_X,
    0,
    row * BAY_SPACING_Z - 2.2,
  ]
}

function PartGeometry({ part }) {
  if (part.shape === 'cylinder') {
    return <cylinderGeometry args={part.cylinderArgs || [part.size[0] / 2, part.size[0] / 2, part.size[1], 32]} />
  }
  return <boxGeometry args={part.size} />
}

function getBayWarnings(part, variant) {
  const warnings = []
  const weight = Number(variant?.weight_kg ?? 0)
  const lead = Number(variant?.lead_time_days ?? 0)
  const footprintX = part.shape === 'cylinder' ? part.size[0] : part.size[0]
  const footprintZ = part.shape === 'cylinder' ? part.size[0] : part.size[2]

  if (weight > WEIGHT_LIMIT_KG) warnings.push({ key: 'weight', label: `${Math.round(weight).toLocaleString()} kg`, severity: weight > WEIGHT_LIMIT_KG * 1.5 ? 'high' : 'medium' })
  if (footprintX > BAY_SIZE[0] || footprintZ > BAY_SIZE[1]) warnings.push({ key: 'size', label: `${footprintX.toFixed(1)}×${footprintZ.toFixed(1)}m`, severity: 'medium' })
  if (lead > LEAD_LIMIT_DAYS) warnings.push({ key: 'lead', label: `${lead}d lead`, severity: lead > LEAD_LIMIT_DAYS + 20 ? 'high' : 'medium' })
  return warnings
}

function FactoryPart({ part, variant, index, draggedPartId, dropPartId, onDragStart, onDrop }) {
  const [x, y, z] = bayPosition(index)
  const scale = Math.min(1, 2.6 / Math.max(part.size[0], part.size[1], part.size[2]))
  const isWire = part.wire ?? false
  const isTrans = part.transparent ?? false
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
          if (draggedPartId && draggedPartId !== part.id) document.body.style.cursor = 'copy'
        }}
        onPointerOut={() => {
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
          <PartGeometry part={part} />
          <meshStandardMaterial
            color={variant?.color ?? '#95a5a6'}
            transparent={isTrans || isWire}
            opacity={isWire ? 0.12 : isTrans ? 0.58 : 1}
            depthWrite={!isWire}
            roughness={0.72}
          />
          <Edges color={isWire ? variant?.color ?? '#95a5a6' : '#26323d'} threshold={15} />
        </mesh>
      </group>

      <Html position={[0, 1.05, -1.45]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className={`factory-bay-label ${warnings.length ? 'factory-bay-label--warning' : ''}`}>
          <span>{bayLabel}</span>
          Seq {part.sequence ?? index + 1}
        </div>
      </Html>
      {warnings.length > 0 && (
        <Html position={[0, 0.92, 1.28]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className={`factory-warning-stack ${hasHighWarning ? 'factory-warning-stack--high' : ''}`}>
            {warnings.map(w => <span key={w.key}>{w.label}</span>)}
          </div>
        </Html>
      )}
      <Html position={[0, 0.12, 1.58]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div className={`factory-part-label ${draggedPartId === part.id ? 'factory-part-label--dragging' : ''}`}>
          <strong>{part.id}</strong>
          <span>{draggedPartId === part.id ? 'Drag to another bay' : part.factory_work ? 'Factory fabrication' : 'Site-prep item'}</span>
        </div>
      </Html>
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

  const rows = Math.max(1, Math.ceil(factoryParts.length / BAY_COLS))
  const width = BAY_COLS * BAY_SPACING_X + 1.6
  const depth = rows * BAY_SPACING_Z + 1.8

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
        position={[0, -0.03, (rows - 1) * BAY_SPACING_Z / 2 - 2.2]}
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
          {draggedPartId ? 'Drop on another bay to resequence' : `${factoryParts.length} visible parts · drag bays to reorder`}
        </div>
      </Html>

      {factoryParts.map((part, index) => (
        <FactoryPart
          key={part.id}
          part={part}
          variant={part.variants[selectedVariants[part.id] ?? 0]}
          index={index}
          draggedPartId={draggedPartId}
          dropPartId={dropPartId}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
        />
      ))}
    </group>
  )
}
