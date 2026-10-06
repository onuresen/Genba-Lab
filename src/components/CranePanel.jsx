import { useState, useEffect, useRef, useMemo } from 'react'
import { useKit } from './KitContext'
import { capacityAt, computeCraneLayout, reachTo } from '../utils/craneLayout'

function beaufort(ws) {
  if (ws < 1)  return 0
  if (ws < 3)  return 1
  if (ws < 6)  return 2
  if (ws < 9)  return 3
  if (ws < 12) return 4
  if (ws < 16) return 5
  if (ws < 20) return 6
  return 7
}

// Specs follow the crane sized to the loaded model (indicative).
function craneSpecs(layout) {
  return [
    ['Jib span',     `${layout.jibLen} m`],
    ['Counter-jib',  `${layout.ctrLen} m`],
    ['Hook height',  `${(layout.jibY - 0.5).toFixed(1)} m`],
    ['Max capacity', `${layout.maxCapacity / 1000} t`],
    ['Tip capacity', `${(capacityAt(layout, layout.jibLen) / 1000).toFixed(1)} t`],
    ['Rated moment', `${Math.round(layout.ratedMoment / 1000)} t·m`],
  ]
}

export default function CranePanel({ sequenceMode, sequenceStep, currentPartWeight, showRadius, onToggleRadius, onWindChange, liveWind, showSecondCrane, onToggleSecondCrane, secondCraneX, onSecondCraneX, liftPlanMode, liftStart, liftEnd, onToggleLiftPlan, craneCabView, onToggleCabView }) {
  const { parts } = useKit()
  const layout = useMemo(() => computeCraneLayout(parts), [parts])
  const SPECS = craneSpecs(layout)

  // ── Wind simulation ─────────────────────────────────────
  const [windSpeed, setWindSpeed] = useState(8.0)
  const windRef = useRef(8.0)
  useEffect(() => {
    const id = setInterval(() => {
      windRef.current = Math.max(0, Math.min(25, windRef.current + (Math.random() - 0.5) * 0.6))
      const ws = +(windRef.current.toFixed(1))
      setWindSpeed(ws)
      if (liveWind) onWindChange?.(ws)
    }, 2000)
    return () => clearInterval(id)
  }, [liveWind, onWindChange])

  // ── Active lift data ────────────────────────────────────
  const { activeRadius, partName } = useMemo(() => {
    if (!sequenceMode || !parts || sequenceStep <= 0) return { activeRadius: 0, partName: null }
    const sorted = [...parts].sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99))
    const part = sorted[sequenceStep - 1]
    if (!part) return { activeRadius: 0, partName: null }
    const { radius } = reachTo(layout, part.pos[0], part.pos[2])
    return { activeRadius: +radius.toFixed(1), partName: part.id }
  }, [parts, sequenceStep, sequenceMode, layout])

  const capacityAtRadius = activeRadius > 0
    ? Math.round(capacityAt(layout, activeRadius))
    : layout.maxCapacity

  const loadPct   = (capacityAtRadius > 0 && currentPartWeight > 0)
    ? Math.min(1, currentPartWeight / capacityAtRadius) : 0
  const loadPctN  = Math.round(loadPct * 100)
  const loadColor = loadPct >= 0.9 ? '#e74c3c' : loadPct >= 0.7 ? '#f39c12' : '#27ae60'
  const loadLabel = loadPct >= 0.9 ? 'OVERLOAD RISK' : loadPct >= 0.7 ? 'CAUTION' : 'SAFE'

  const windColor = windSpeed > 20 ? '#e74c3c' : windSpeed > 12 ? '#f39c12' : '#27ae60'
  const windLabel = windSpeed > 20 ? 'STOP' : windSpeed > 12 ? 'CAUTION' : 'OK'
  const bf        = beaufort(windSpeed)

  const liftActive = sequenceMode && currentPartWeight > 0

  return (
    <div
      className="metrics-panel crane-panel"
      style={{ bottom: 20, right: 280, left: 'auto', top: 'auto', width: 290, maxHeight: '80vh', overflow: 'auto' }}
    >
      {/* Header */}
      <div className="metrics-header" style={{ padding: '10px 14px 0' }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#e8a200' }}>
          🏗 Tower Crane
        </div>
      </div>

      {/* ── Crane Specs ──────────────────────────────────── */}
      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div className="ipr-section-label">Crane Specs</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 5 }}>
          {SPECS.map(([label, value]) => (
            <div key={label} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gridColumn: 'span 2' }}>
              <span style={{ color: '#aaa' }}>{label}</span>
              <span style={{ fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Current Lift ─────────────────────────────────── */}
      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div className="ipr-section-label">Current Lift</div>

        <div className="est-metrics" style={{ padding: '6px 0' }}>
          <div className="est-metric">
            <span className="est-value">{sequenceMode && activeRadius > 0 ? `${activeRadius}` : '—'}</span>
            <span className="est-unit">radius (m)</span>
          </div>
          <div className="est-divider" />
          <div className="est-metric">
            <span className="est-value">{sequenceMode ? `${(capacityAtRadius / 1000).toFixed(1)}t` : '—'}</span>
            <span className="est-unit">capacity</span>
          </div>
          <div className="est-divider" />
          <div className="est-metric">
            <span className="est-value">{currentPartWeight > 0 ? `${(currentPartWeight / 1000).toFixed(1)}t` : '—'}</span>
            <span className="est-unit">{partName ?? 'weight'}</span>
          </div>
        </div>

        {liftActive && (
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3, color: '#888' }}>
              <span>Load utilisation</span>
              <span style={{ fontWeight: 700, color: loadColor }}>{loadPctN}%</span>
            </div>
            <div style={{ height: 6, background: '#ebebeb', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${loadPctN}%`,
                background: loadColor, borderRadius: 3,
                transition: 'width 0.4s ease, background 0.4s ease',
              }} />
            </div>
            <div style={{ marginTop: 5, textAlign: 'right' }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: loadColor,
                background: loadColor + '22', padding: '2px 8px', borderRadius: 10,
              }}>
                {loadLabel}
              </span>
            </div>
          </div>
        )}

        {!liftActive && (
          <div style={{ fontSize: 11, color: '#bbb', fontStyle: 'italic', marginTop: 4 }}>
            {sequenceMode ? 'No part selected' : 'Enter Sequence mode to see lift data'}
          </div>
        )}
      </div>

      {/* ── Environment ──────────────────────────────────── */}
      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div className="ipr-section-label">Environment</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Wind speed</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: windColor }}>{windSpeed} m/s</span>
        </div>
        <div style={{ height: 5, background: '#ebebeb', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{
            height: '100%',
            width: `${Math.min(100, (windSpeed / 25) * 100)}%`,
            background: windColor, borderRadius: 3,
            transition: 'width 1.8s ease, background 0.4s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888' }}>
          <span>Beaufort {bf} · EN 14439 limit 20 m/s</span>
          <span style={{
            fontWeight: 700, color: windColor,
            background: windColor + '22', padding: '1px 7px', borderRadius: 10,
          }}>
            {windLabel}
          </span>
        </div>
      </div>

      {/* ── Reach rings toggle ───────────────────────────── */}
      <div style={{ padding: '10px 14px' }}>
        <button
          className={`view-btn ${showRadius ? 'view-btn--active' : ''}`}
          style={{ width: '100%' }}
          onClick={onToggleRadius}
        >
          {showRadius ? 'Hide Reach Rings' : 'Show Reach Rings'}
        </button>
      </div>

      {/* ── Cab View ─────────────────────────────────────── */}
      <div style={{ padding: '0 14px 10px' }}>
        <button
          onClick={onToggleCabView}
          style={{
            width: '100%', padding: '6px 0', border: 'none', borderRadius: 6, cursor: 'pointer',
            fontSize: 12, fontWeight: 600,
            background: craneCabView ? '#e74c3c' : '#7f8c8d', color: '#fff',
          }}
        >
          {craneCabView ? '🏗 Exit Cab View' : '🏗 Cab View'}
        </button>
      </div>

      {/* ── Lift Plan ────────────────────────────────────── */}
      {(
        <div className="ipr-section" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="ipr-section-label" style={{ margin: 0 }}>Lift Path Planner</div>
            <button
              onClick={onToggleLiftPlan}
              style={{
                padding: '3px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: liftPlanMode ? '#e74c3c' : '#2980b9', color: '#fff',
              }}
            >
              {liftPlanMode ? 'Cancel' : 'Plan Lift'}
            </button>
          </div>
          {liftPlanMode && (
            <div style={{ fontSize: 11, color: '#888' }}>
              {!liftStart && <span>Click a <strong>pick-up point</strong> on the ground</span>}
              {liftStart && !liftEnd && (
                <span>
                  <span style={{ color: '#27ae60' }}>✓ Pick-up set</span> — now click an <strong>installation point</strong>
                </span>
              )}
              {liftStart && liftEnd && (
                <span style={{ color: '#2980b9' }}>✓ Lift path planned — click to reset</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Second Crane ─────────────────────────────────── */}
      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="ipr-section-label" style={{ margin: 0 }}>Second Crane</div>
          <button
            onClick={onToggleSecondCrane}
            style={{
              padding: '3px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: showSecondCrane ? '#e74c3c' : '#2980b9', color: '#fff',
            }}
          >
            {showSecondCrane ? 'Remove' : '+ Add Crane'}
          </button>
        </div>
        {showSecondCrane && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#888' }}>X offset from Crane 1</span>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{secondCraneX > 0 ? '+' : ''}{secondCraneX} m</span>
            </div>
            <input
              type="range" min={-layout.jibLen * 2} max={layout.jibLen * 2} step={0.5}
              value={secondCraneX}
              onChange={e => onSecondCraneX(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#e74c3c' }}
            />
            {(() => {
              const dist = Math.abs(secondCraneX)
              // Jib circles overlap below 2 × jib; mast inside the other jib's reach below ~1.1 × jib.
              const hasCollision = dist < layout.jibLen * 2
              const severe = dist < layout.jibLen * 1.1
              const color = hasCollision ? (severe ? '#e74c3c' : '#f39c12') : '#27ae60'
              const label = hasCollision ? (severe ? '⚠ COLLISION ZONE ACTIVE' : '⚠ JIB RADII OVERLAP') : '✓ CLEAR'
              return (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color, textAlign: 'center', padding: '4px 0', background: color + '18', borderRadius: 5 }}>
                  {label}
                </div>
              )
            })()}
          </>
        )}
      </div>
    </div>
  )
}
