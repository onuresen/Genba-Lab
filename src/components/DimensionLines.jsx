import { Html, Line } from '@react-three/drei'

const LABEL_STYLE = {
  background: 'rgba(20,30,40,0.82)',
  color: '#fff',
  fontFamily: "'Segoe UI', sans-serif",
  fontSize: '11px',
  fontWeight: 700,
  padding: '2px 7px',
  borderRadius: '3px',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  letterSpacing: '0.04em',
}

const DIM_OFFSET = 0.55
const LINE_COLOR = '#3498db'
const TICK = 0.12

function mm(meters) {
  return `${Math.round(meters * 1000)} mm`
}

// Compute axis-aligned bounding box from visible assembled parts.
function computeBounds(parts, visible) {
  let xMin = Infinity, xMax = -Infinity
  let yMin = Infinity, yMax = -Infinity
  let zMin = Infinity, zMax = -Infinity

  for (const part of parts) {
    if (visible && visible[part.id] === false) continue
    const [px, py, pz] = part.pos
    const [sw, sh, sd] = part.size
    xMin = Math.min(xMin, px - sw / 2)
    xMax = Math.max(xMax, px + sw / 2)
    yMin = Math.min(yMin, py - sh / 2)
    yMax = Math.max(yMax, py + sh / 2)
    zMin = Math.min(zMin, pz - sd / 2)
    zMax = Math.max(zMax, pz + sd / 2)
  }

  // Fallback if no visible parts
  if (!isFinite(xMin)) return { xMin: -2, xMax: 2, yMin: -0.25, yMax: 2.55, zMin: -2, zMax: 2 }
  return { xMin, xMax, yMin, yMax, zMin, zMax }
}

export default function DimensionLines({ parts, visible }) {
  const { xMin, xMax, yMin, yMax, zMin, zMax } = computeBounds(parts, visible)

  const totalWidth  = xMax - xMin
  const totalDepth  = zMax - zMin
  const totalHeight = yMax - yMin

  // Width line — along X, in front of model (Z = zMax + offset), at base Y
  const wZ = zMax + DIM_OFFSET
  const wY = yMin

  // Depth line — along Z, to the right of model (X = xMax + offset), at base Y
  const dX = xMax + DIM_OFFSET
  const dY = yMin

  // Height line — along Y, to the right and behind model
  const hX = xMax + DIM_OFFSET
  const hZ = zMin - DIM_OFFSET

  return (
    <group>
      {/* ── Width (X axis) ── */}
      <Line points={[[xMin, wY, wZ], [xMax, wY, wZ]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[xMin, wY - TICK, wZ], [xMin, wY + TICK, wZ]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[xMax, wY - TICK, wZ], [xMax, wY + TICK, wZ]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[xMin, wY, zMax], [xMin, wY, wZ]]} color={LINE_COLOR} lineWidth={0.8} dashed dashSize={0.08} gapSize={0.06} />
      <Line points={[[xMax, wY, zMax], [xMax, wY, wZ]]} color={LINE_COLOR} lineWidth={0.8} dashed dashSize={0.08} gapSize={0.06} />
      <Html position={[(xMin + xMax) / 2, wY, wZ + 0.18]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={LABEL_STYLE}>{mm(totalWidth)}</div>
      </Html>

      {/* ── Depth (Z axis) ── */}
      <Line points={[[dX, dY, zMin], [dX, dY, zMax]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[dX - TICK, dY, zMin], [dX + TICK, dY, zMin]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[dX - TICK, dY, zMax], [dX + TICK, dY, zMax]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[xMax, dY, zMin], [dX, dY, zMin]]} color={LINE_COLOR} lineWidth={0.8} dashed dashSize={0.08} gapSize={0.06} />
      <Line points={[[xMax, dY, zMax], [dX, dY, zMax]]} color={LINE_COLOR} lineWidth={0.8} dashed dashSize={0.08} gapSize={0.06} />
      <Html position={[dX + 0.18, dY, (zMin + zMax) / 2]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={LABEL_STYLE}>{mm(totalDepth)}</div>
      </Html>

      {/* ── Height (Y axis) ── */}
      <Line points={[[hX, yMin, hZ], [hX, yMax, hZ]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[hX - TICK, yMin, hZ], [hX + TICK, yMin, hZ]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[hX - TICK, yMax, hZ], [hX + TICK, yMax, hZ]]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={[[xMax, yMin, zMin], [hX, yMin, hZ]]} color={LINE_COLOR} lineWidth={0.8} dashed dashSize={0.08} gapSize={0.06} />
      <Line points={[[xMax, yMax, zMin], [hX, yMax, hZ]]} color={LINE_COLOR} lineWidth={0.8} dashed dashSize={0.08} gapSize={0.06} />
      <Html position={[hX + 0.18, (yMin + yMax) / 2, hZ]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
        <div style={LABEL_STYLE}>{mm(totalHeight)}</div>
      </Html>
    </group>
  )
}
