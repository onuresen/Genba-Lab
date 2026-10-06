import { useKit } from './KitContext'

const RICHTER_LABELS = { 3: 'Minor', 4: 'Light', 5: 'Moderate', 6: 'Strong', 7: 'Major', 8: 'Great', 9: 'Catastrophic' }

function getVerdict(magnitude, parts, selectedVariants) {
  if (!parts.length) return null
  const atRisk = parts.filter(p => {
    const grade = p.variants[selectedVariants[p.id] ?? 0]?.seismic_grade ?? 1
    return magnitude > grade * 3
  })
  const caution = parts.filter(p => {
    const grade = p.variants[selectedVariants[p.id] ?? 0]?.seismic_grade ?? 1
    return magnitude > grade * 2.2 && magnitude <= grade * 3
  })
  if (atRisk.length > 0) return { level: 'critical', label: 'CRITICAL FAILURE', color: '#e74c3c', parts: atRisk }
  if (caution.length > 0) return { level: 'caution', label: 'AT RISK', color: '#f39c12', parts: caution }
  return { level: 'safe', label: 'STRUCTURE SURVIVED', color: '#27ae60', parts: [] }
}

function getSeismicScore(magnitude, parts, selectedVariants) {
  if (!parts.length) return 100
  const total = parts.reduce((sum, part) => {
    const grade = part.variants[selectedVariants[part.id] ?? 0]?.seismic_grade ?? 1
    const hasBaseIso = (part.connections ?? []).some(c => c.type === 'base-isolation')
    const capacity = grade * 3 + (hasBaseIso ? 1.1 : 0)
    const margin = capacity - magnitude
    let partScore
    if (margin < 0) {
      partScore = Math.max(18, 52 + margin * 12)
    } else if (magnitude > grade * 2.2) {
      partScore = Math.min(78, 62 + margin * 8)
    } else {
      partScore = Math.min(100, 84 + margin * 5)
    }
    return sum + partScore
  }, 0)
  return Math.round(total / parts.length)
}

export default function EarthquakePanel({ magnitude, onMagnitude, isShaking, countdown, onShake, hasShaken, selectedVariants }) {
  const { parts } = useKit()
  const primaryParts = parts.filter(p => !p.structural_role || p.structural_role === 'primary')
  const verdict = hasShaken ? getVerdict(magnitude, primaryParts, selectedVariants) : null
  const richterLabel = RICHTER_LABELS[Math.floor(magnitude)] ?? 'Major'
  const trackColor = magnitude < 5 ? '#27ae60' : magnitude < 7 ? '#f39c12' : '#e74c3c'
  const seismicScore = getSeismicScore(magnitude, primaryParts, selectedVariants)
  const isPrimed = countdown != null
  const isLocked = isShaking || isPrimed
  const pga = Math.min(2.4, 0.016 * Math.pow(10, 0.42 * magnitude))

  return (
    <div
      className="metrics-panel eq-panel"
      style={{ bottom: 20, right: 280, left: 'auto', top: 'auto', width: 280, maxHeight: '80vh', overflow: 'auto' }}
    >
      <div className="metrics-header" style={{ padding: '10px 14px 0' }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: trackColor }}>
          ⚡ Earthquake Simulation
        </div>
      </div>

      <div className={`eq-status-strip ${isShaking ? 'eq-status-strip--active' : isPrimed ? 'eq-status-strip--countdown' : ''}`}>
        <span>{isShaking ? 'SEISMIC EVENT' : isPrimed ? 'COUNTDOWN' : hasShaken ? 'POST-EVENT REVIEW' : 'READY'}</span>
        <strong>{isPrimed ? countdown : isShaking ? 'LIVE' : `${seismicScore}/100`}</strong>
      </div>

      {/* Magnitude slider */}
      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Magnitude</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: trackColor }}>M {magnitude.toFixed(1)}</span>
        </div>
        <input
          type="range" min={3} max={9} step={0.1}
          value={magnitude}
          onChange={e => onMagnitude(parseFloat(e.target.value))}
          disabled={isLocked}
          style={{ width: '100%', accentColor: trackColor }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#888', marginTop: 4 }}>
          <span>3.0 Minor</span>
          <span style={{ fontWeight: 600, color: trackColor }}>{richterLabel}</span>
          <span>9.0 Catastrophic</span>
        </div>
        <div className="eq-presets" aria-label="Earthquake presets">
          {[5.5, 6.8, 7.6].map(preset => (
            <button
              key={preset}
              onClick={() => onMagnitude(preset)}
              disabled={isLocked}
              className={Math.abs(magnitude - preset) < 0.05 ? 'eq-preset--active' : ''}
            >
              M{preset}
            </button>
          ))}
        </div>
      </div>

      <div className="ipr-section eq-game-readout" style={{ padding: '0 14px 10px' }}>
        <div>
          <span>Indicative PGA</span>
          <strong>{pga.toFixed(2)}g</strong>
        </div>
        <div>
          <span>Seismic score</span>
          <strong style={{ color: seismicScore >= 82 ? '#27ae60' : seismicScore >= 62 ? '#f39c12' : '#e74c3c' }}>
            {seismicScore}/100
          </strong>
        </div>
        <div className="eq-score-meter">
          <div style={{ width: `${seismicScore}%`, background: seismicScore >= 82 ? '#27ae60' : seismicScore >= 62 ? '#f39c12' : '#e74c3c' }} />
        </div>
      </div>

      {/* Structural parts table */}
      <div className="ipr-section" style={{ padding: '0 14px 10px' }}>
        <div className="ipr-section-label">Structural Parts</div>
        {primaryParts.map(p => {
          const v = p.variants[selectedVariants[p.id] ?? 0]
          const grade = v?.seismic_grade ?? 1
          const isAtRisk = hasShaken && magnitude > grade * 3
          const isCaution = hasShaken && !isAtRisk && magnitude > grade * 2.2
          const statusColor = isAtRisk ? '#e74c3c' : isCaution ? '#f39c12' : '#27ae60'
          const hasBaseIso = (p.connections ?? []).some(c => c.type === 'base-isolation')
          return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span className="bom-swatch" style={{ background: v?.color ?? '#999', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 500 }}>{p.id}</span>
              {hasBaseIso && (
                <span style={{ fontSize: 9, background: '#1abc9c22', color: '#1abc9c', border: '1px solid #1abc9c55', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>
                  BASE ISO
                </span>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, color: hasShaken ? statusColor : '#aaa' }}>
                耐震{grade}
              </span>
            </div>
          )
        })}
      </div>

      {/* Shake button */}
      <div style={{ padding: '0 14px 10px' }}>
        <button
          onClick={onShake}
          disabled={isLocked}
          style={{
            width: '100%', padding: '9px 0', border: 'none', borderRadius: 6, cursor: isLocked ? 'default' : 'pointer',
            background: isLocked ? '#95a5a6' : `linear-gradient(135deg, ${trackColor}, #c0392b)`,
            color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '0.05em',
            transition: 'background 0.3s',
            animation: isShaking ? 'eq-shake-btn 0.15s infinite' : isPrimed ? 'eq-prime-btn 0.65s infinite' : 'none',
          }}
        >
          {isPrimed ? `⚡ BRACE ${countdown}` : isShaking ? '⚡ SHAKING…' : '⚡ SIMULATE EARTHQUAKE'}
        </button>
      </div>

      {/* Verdict */}
      {verdict && !isShaking && (
        <div style={{
          margin: '0 14px 14px', padding: '10px 12px', borderRadius: 8,
          border: `1.5px solid ${verdict.color}`,
          background: verdict.color + '18',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: verdict.color }}>{verdict.label}</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 3 }}>
            M{magnitude.toFixed(1)} · {richterLabel}
            {verdict.parts.length > 0 && ` · ${verdict.parts.length} part${verdict.parts.length !== 1 ? 's' : ''} compromised`}
          </div>
          {verdict.parts.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {verdict.parts.map(p => (
                <span key={p.id} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 10,
                  background: '#e74c3c22', color: '#e74c3c',
                  border: '1px solid #e74c3c55', fontWeight: 600,
                }}>
                  {p.id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
