import { useEffect, useRef } from 'react'
import { useKit } from './KitContext'

const KEN = 0.91 // 910mm module in metres

export default function FloorPlanPanel({ visible, showKenGrid, onClose }) {
  const { parts } = useKit()
  const canvasRef = useRef()

  const activeParts = parts.filter(p => visible[p.id])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const PAD = 36

    ctx.clearRect(0, 0, W, H)

    if (!activeParts.length) {
      ctx.fillStyle = '#aaa'
      ctx.font = '13px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('No visible parts', W / 2, H / 2)
      return
    }

    // Compute bounds from XZ plane (looking down)
    const minX = Math.min(...activeParts.map(p => p.pos[0] - p.size[0] / 2))
    const maxX = Math.max(...activeParts.map(p => p.pos[0] + p.size[0] / 2))
    const minZ = Math.min(...activeParts.map(p => p.pos[2] - p.size[2] / 2))
    const maxZ = Math.max(...activeParts.map(p => p.pos[2] + p.size[2] / 2))

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
    for (const part of activeParts) {
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

      // Label — centered
      ctx.fillStyle = '#222'
      ctx.font = `bold ${Math.max(8, Math.min(12, cw / 4))}px system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(part.id, cx + cw / 2, cz + ch / 2)

      // Dimension — width
      if (cw > 28) {
        ctx.fillStyle = '#555'
        ctx.font = `9px system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(`${pw.toFixed(1)}m`, cx + cw / 2, cz + ch + 2)
      }
    }

    // Compass indicator
    ctx.fillStyle = '#e74c3c'
    ctx.font = 'bold 11px system-ui'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText('N ↑', W - PAD, PAD / 2)
  }, [activeParts, visible, showKenGrid])

  function handleExportSVG() {
    if (!activeParts.length) return
    const W = 600, H = 500, PAD = 36
    const minX = Math.min(...activeParts.map(p => p.pos[0] - p.size[0] / 2))
    const maxX = Math.max(...activeParts.map(p => p.pos[0] + p.size[0] / 2))
    const minZ = Math.min(...activeParts.map(p => p.pos[2] - p.size[2] / 2))
    const maxZ = Math.max(...activeParts.map(p => p.pos[2] + p.size[2] / 2))
    const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanZ)
    const offX = PAD + ((W - PAD * 2) - spanX * scale) / 2
    const offZ = PAD + ((H - PAD * 2) - spanZ * scale) / 2
    function sc(wx, wz) { return [offX + (wx - minX) * scale, offZ + (wz - minZ) * scale] }

    const rects = activeParts.map(p => {
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
    a.download = 'floor-plan.svg'
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
        display: 'flex', flexDirection: 'column', gap: 12, minWidth: 520,
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
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={500}
          height={400}
          style={{ border: '1px solid #eee', borderRadius: 8, background: '#fafafa', display: 'block' }}
        />

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {activeParts.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: p.variants[0]?.color ?? '#999', display: 'inline-block' }} />
              {p.id}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
