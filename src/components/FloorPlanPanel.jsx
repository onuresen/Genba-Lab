import { useEffect, useMemo, useRef, useState } from 'react'
import { useKit } from './KitContext'

const KEN = 0.91 // 910mm module in metres
const LEGEND_LIMIT = 14

// Storeys (fire compartments) from lowest to highest.
function storeysOf(parts) {
  const low = new Map()
  for (const p of parts) {
    const name = p.fire_compartment
    if (!name) continue
    low.set(name, Math.min(low.get(name) ?? Infinity, p.pos[1] - p.size[1] / 2))
  }
  return [...low.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name)
}

function shortClass(part) {
  const entity = part.variants[0]?.ifc_entity
  return entity ? entity.replace(/^Ifc/, '').replace(/([a-z])([A-Z])/g, '$1 $2') : part.id
}

export default function FloorPlanPanel({ visible, showKenGrid, onClose }) {
  const { parts } = useKit()
  const canvasRef = useRef()

  const visibleParts = parts.filter(p => visible[p.id])
  const storeys = useMemo(() => storeysOf(parts), [parts])
  // One storey at a time: all storeys stacked in one plan are unreadable.
  const [storey, setStorey] = useState(() => (storeys.length > 1 ? storeys[0] : 'all'))
  const activeParts = storey === 'all' ? visibleParts : visibleParts.filter(p => p.fire_compartment === storey)
  // Big footprints first, so slabs do not cover columns and walls.
  const drawOrder = [...activeParts].sort((a, b) => b.size[0] * b.size[2] - a.size[0] * a.size[2])

  // Legend by element type (a model can have hundreds of parts).
  const legend = []
  for (const p of activeParts) {
    const label = shortClass(p)
    if (!legend.some(l => l.label === label)) legend.push({ label, color: p.variants[0]?.color ?? '#999' })
  }

  // Shared plan bounds: every storey uses the same scale, so plans line up.
  const bounds = useMemo(() => {
    if (!visibleParts.length) return null
    return {
      minX: Math.min(...visibleParts.map(p => p.pos[0] - p.size[0] / 2)),
      maxX: Math.max(...visibleParts.map(p => p.pos[0] + p.size[0] / 2)),
      minZ: Math.min(...visibleParts.map(p => p.pos[2] - p.size[2] / 2)),
      maxZ: Math.max(...visibleParts.map(p => p.pos[2] + p.size[2] / 2)),
    }
  }, [visibleParts])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const PAD = 36

    ctx.clearRect(0, 0, W, H)

    if (!activeParts.length || !bounds) {
      ctx.fillStyle = '#aaa'
      ctx.font = '13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('No visible parts', W / 2, H / 2)
      return
    }

    // Compute bounds from XZ plane (looking down)
    const { minX, maxX, minZ, maxZ } = bounds

    const spanX = maxX - minX || 1
    const spanZ = maxZ - minZ || 1
    const scaleX = (W - PAD * 2) / spanX
    const scaleZ = (H - PAD * 2) / spanZ
    const scale  = Math.min(scaleX, scaleZ)

    const offX = PAD + ((W - PAD * 2) - spanX * scale) / 2
    const offZ = PAD + ((H - PAD * 2) - spanZ * scale) / 2

    function toCanvas(wx, wz) {
      return [offX + (wx - minX) * scale, offZ + (wz - minZ) * scale]
    }

    // Ken grid
    if (showKenGrid) {
      ctx.strokeStyle = 'rgba(139,115,85,0.25)'
      ctx.lineWidth = 0.5
      for (let x = minX; x <= maxX + KEN; x += KEN) {
        const [cx] = toCanvas(x, minZ)
        ctx.beginPath(); ctx.moveTo(cx, PAD); ctx.lineTo(cx, H - PAD); ctx.stroke()
      }
      for (let z = minZ; z <= maxZ + KEN; z += KEN) {
        const [, cz] = toCanvas(minX, z)
        ctx.beginPath(); ctx.moveTo(PAD, cz); ctx.lineTo(W - PAD, cz); ctx.stroke()
      }
    }

    // Parts footprints
    for (const part of drawOrder) {
      const [px, , pz] = part.pos
      const [pw, , pd] = part.size
      const [cx, cz] = toCanvas(px - pw / 2, pz - pd / 2)
      const cw = pw * scale
      const ch = pd * scale

      const variant = part.variants[0]
      const color = variant?.color ?? '#95a5a6'

      // Fill
      ctx.fillStyle = color + '55'
      ctx.fillRect(cx, cz, cw, ch)

      // Stroke
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.strokeRect(cx, cz, cw, ch)

      // Label — centered, only when it fits inside the footprint
      ctx.font = `bold ${Math.max(8, Math.min(12, cw / 4))}px system-ui`
      if (ctx.measureText(part.id).width < cw - 4 && ch > 12) {
        ctx.fillStyle = '#222'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(part.id, cx + cw / 2, cz + ch / 2)
      }
    }

    // Compass indicator
    ctx.fillStyle = '#e74c3c'
    ctx.font = 'bold 11px system-ui'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText('N ↑', W - PAD, PAD / 2)
  }, [activeParts, drawOrder, bounds, showKenGrid])

  function handleExportSVG() {
    if (!activeParts.length || !bounds) return
    const W = 600, H = 500, PAD = 36
    const { minX, maxX, minZ, maxZ } = bounds
    const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanZ)
    const offX = PAD + ((W - PAD * 2) - spanX * scale) / 2
    const offZ = PAD + ((H - PAD * 2) - spanZ * scale) / 2
    function sc(wx, wz) { return [offX + (wx - minX) * scale, offZ + (wz - minZ) * scale] }

    const rects = drawOrder.map(p => {
      const [px, , pz] = p.pos
      const [pw, , pd] = p.size
      const [cx, cz] = sc(px - pw / 2, pz - pd / 2)
      const color = p.variants[0]?.color ?? '#95a5a6'
      return `  <rect x="${cx.toFixed(1)}" y="${cz.toFixed(1)}" width="${(pw * scale).toFixed(1)}" height="${(pd * scale).toFixed(1)}" fill="${color}55" stroke="${color}" stroke-width="1.5"/>
  <text x="${(cx + pw * scale / 2).toFixed(1)}" y="${(cz + pd * scale / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-family="system-ui" font-weight="bold" fill="#222">${p.id}</text>`
    }).join('\n')

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="white"/>
  <text x="${W - PAD}" y="${PAD / 2}" text-anchor="end" font-size="11" font-family="system-ui" font-weight="bold" fill="#e74c3c">N ↑</text>
${rects}
</svg>`
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = storey === 'all' ? 'floor-plan.svg' : `floor-plan-${storey}.svg`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column', gap: 12,
        width: 'min(560px, calc(100vw - 24px))', maxHeight: '92vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Floor Plan</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleExportSVG}
              style={{ padding: '5px 12px', background: '#2980b9', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Export SVG
            </button>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        </div>

        {storeys.length > 1 && (
          <div className="section-storeys" role="group" aria-label="Storey" style={{ marginTop: 0 }}>
            {storeys.map(name => (
              <button key={name} onClick={() => setStorey(name)} style={storey === name ? { background: '#2c3e50', borderColor: '#2c3e50', color: '#fff' } : undefined}>{name}</button>
            ))}
            <button onClick={() => setStorey('all')} style={storey === 'all' ? { background: '#2c3e50', borderColor: '#2c3e50', color: '#fff' } : undefined}>All</button>
          </div>
        )}

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={500}
          height={400}
          style={{ width: '100%', maxWidth: 500, height: 'auto', alignSelf: 'center', border: '1px solid #eee', borderRadius: 8, background: '#fafafa', display: 'block' }}
        />

        {/* Legend by element type */}
        <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap' }}>
          {legend.slice(0, LEGEND_LIMIT).map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
              {l.label}
            </div>
          ))}
          {legend.length > LEGEND_LIMIT && <div style={{ fontSize: 11, color: '#95a5a6' }}>+{legend.length - LEGEND_LIMIT} more</div>}
        </div>
        <div style={{ fontSize: 10, color: '#a3adb7' }}>{activeParts.length} parts · footprints from bounding boxes</div>
      </div>
    </div>
  )
}
