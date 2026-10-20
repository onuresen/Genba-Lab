import { useKit } from './KitContext'
import { RICHTER_LABELS, getSeismicScore, getVerdict, gradeOf, seismicParts } from '../utils/seismic'

const GRADE_COLOR = { 1: '#f39c12', 2: '#3498db', 3: '#27ae60' }
const LIST_LIMIT = 8

export default function EarthquakePanel({ magnitude, onMagnitude, isShaking, countdown, onShake, hasShaken, selectedVariants }) {
  const { parts } = useKit()
  const structure = seismicParts(parts)
  const verdict = hasShaken ? getVerdict(magnitude, structure, selectedVariants) : null
  const richterLabel = RICHTER_LABELS[Math.floor(magnitude)] ?? 'Major'
  const trackColor = magnitude < 5 ? '#27ae60' : magnitude < 7 ? '#f39c12' : '#e74c3c'
  const seismicScore = getSeismicScore(magnitude, structure, selectedVariants)
  const isPrimed = countdown != null
  const isLocked = isShaking || isPrimed
  // Indicative near-field peak ground acceleration (g): ≈0.13 at M5, 0.5 at M7,
  // 2 at M9. The old curve hit its 2.4 g cap above M5.2, so every quake read the same.
  const pga = Math.min(2.4, Math.pow(10, 0.3 * magnitude - 2.4))

  // Parts per 耐震等級, and what each grade does at this magnitude.
  const byGrade = [1, 2, 3]
    .map(grade => ({ grade, count: structure.filter(p => gradeOf(p, selectedVariants) === grade).length }))
    .filter(g => g.count > 0)

  return (
    <div
      className="metrics-panel eq-panel"
      style={{ bottom: 20, right: 304, left: 'auto', top: 'auto', width: 280, maxHeight: '80vh', overflow: 'auto' }}
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
          aria-label="Magnitude"
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

      {/* Structure by grade: holds / at risk / fails at this magnitude */}
      <div className="ipr-section" style={{ padding: '0 14px 10px' }}>
        <div className="ipr-section-label">Structure · {structure.length} parts</div>
        {byGrade.map(({ grade, count }) => {
          const state = magnitude > grade * 3 ? 'fails' : magnitude > grade * 2.2 ? 'at risk' : 'holds'
          const color = state === 'fails' ? '#e74c3c' : state === 'at risk' ? '#f39c12' : '#27ae60'
          return (
            <div key={grade} className="eq-grade-row">
              <span className="eq-grade-chip" style={{ color: GRADE_COLOR[grade], borderColor: GRADE_COLOR[grade] }}>耐震等級{grade}</span>
              <span className="eq-grade-count">{count} parts</span>
              <span className="eq-grade-state" style={{ color }}>{state}</span>
            </div>
          )
        })}
        <div className="eq-grade-note">Grade 1 holds to M3.0, grade 2 to M6.0, grade 3 to M9.0 (indicative).</div>
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
          {isPrimed ? `⚡ BRACE ${countdown}` : isShaking ? '⚡ SHAKING…' : hasShaken ? '⚡ SHAKE AGAIN' : '⚡ SIMULATE EARTHQUAKE'}
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
              {verdict.parts.slice(0, LIST_LIMIT).map(p => (
                <span key={p.id} className="eq-part-chip">{p.id}</span>
              ))}
              {verdict.parts.length > LIST_LIMIT && (
                <span className="eq-part-chip eq-part-chip--more">+{verdict.parts.length - LIST_LIMIT} more</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
