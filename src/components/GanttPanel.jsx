import { useState } from 'react'
import { useKit } from './KitContext'

// Derive week from sequence if not explicitly set
function getWeek(part) {
  if (part.week != null) return part.week
  return Math.ceil((part.sequence ?? 1) / 2)
}

const WEEK_COLORS = [
  '#3498db', '#27ae60', '#f39c12', '#9b59b6',
  '#1abc9c', '#e74c3c', '#2980b9', '#e67e22',
]

export default function GanttPanel({ selectedVariants, visible, onHighlightWeek, highlightedWeek }) {
  const { parts } = useKit()
  const activeParts = parts.filter(p => visible[p.id])
  const sorted = [...activeParts].sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99))

  // Group by week
  const weekMap = {}
  for (const p of sorted) {
    const w = getWeek(p)
    if (!weekMap[w]) weekMap[w] = []
    weekMap[w].push(p)
  }
  const weeks = Object.keys(weekMap).map(Number).sort((a, b) => a - b)
  const maxWeek = weeks[weeks.length - 1] ?? 1

  // Total labour hours derived from assembly_time_min
  function totalHours(weekParts) {
    return weekParts.reduce((s, p) => {
      const v = p.variants[selectedVariants[p.id] ?? 0]
      return s + Math.round((v?.assembly_time_min ?? 60) / 60 * 10) / 10
    }, 0)
  }

  return (
    <div style={{ padding: '14px 16px', overflowX: 'auto' }}>

      {/* Timeline header */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
        {weeks.map(w => (
          <div
            key={w}
            onClick={() => onHighlightWeek(highlightedWeek === w ? null : w)}
            style={{
              flex: 1, minWidth: 28, textAlign: 'center',
              fontSize: 10, fontWeight: 700, padding: '3px 0',
              borderRadius: 4, cursor: 'pointer',
              background: highlightedWeek === w ? WEEK_COLORS[(w - 1) % WEEK_COLORS.length] : 'rgba(0,0,0,0.06)',
              color: highlightedWeek === w ? '#fff' : '#666',
              transition: 'background 0.15s',
            }}
          >
            W{w}
          </div>
        ))}
      </div>

      {/* Gantt rows */}
      {sorted.map(part => {
        const v = part.variants[selectedVariants[part.id] ?? 0]
        const week = getWeek(part)
        const weekIdx = weeks.indexOf(week)
        const color = WEEK_COLORS[(week - 1) % WEEK_COLORS.length]
        const isHighlighted = highlightedWeek === week
        const barLeft = (weekIdx / weeks.length) * 100
        const barWidth = Math.max(4, (1 / weeks.length) * 100)

        return (
          <div key={part.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            opacity: highlightedWeek != null && !isHighlighted ? 0.3 : 1,
            transition: 'opacity 0.2s',
          }}>
            <span className="bom-swatch" style={{ background: v?.color ?? '#999', flexShrink: 0 }} />
            <span style={{ width: 80, fontSize: 10, fontWeight: 600, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {part.id}
            </span>
            <div style={{ flex: 1, height: 14, background: 'rgba(0,0,0,0.06)', borderRadius: 3, position: 'relative', minWidth: 80 }}>
              <div style={{
                position: 'absolute', top: 0, height: '100%',
                left: `${barLeft}%`, width: `${barWidth}%`,
                background: color, borderRadius: 3,
                boxShadow: isHighlighted ? `0 0 0 2px ${color}66` : 'none',
                transition: 'box-shadow 0.2s',
              }} />
            </div>
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right', flexShrink: 0 }}>
              W{week}
            </span>
          </div>
        )
      })}

      {/* Week summary */}
      <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 6, letterSpacing: '0.04em' }}>
          WEEKLY SUMMARY
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {weeks.map(w => {
            const wParts = weekMap[w]
            const color = WEEK_COLORS[(w - 1) % WEEK_COLORS.length]
            const hrs = totalHours(wParts)
            return (
              <div
                key={w}
                onClick={() => onHighlightWeek(highlightedWeek === w ? null : w)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#555', width: 32 }}>Wk {w}</span>
                <span style={{ fontSize: 11, color: '#888', flex: 1 }}>
                  {wParts.length} part{wParts.length !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#444' }}>{hrs}h</span>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 10, color: '#bbb' }}>
          Install hours derived from assembly_time_min. Click week to highlight in 3D.
        </div>
      </div>
    </div>
  )
}
