import { useKit } from './KitContext'
import { countFire, fireGradeOf, fireRoundResult } from '../utils/fireSim'

const FIRE_COLORS = { ok: '#27ae60', burning: '#e67e22', failed: '#7f1f1f', out: '#2e86de' }
const FIRE_LABELS = { burning: '🔥 Burning', failed: '💀 Lost', out: '💧 Out' }
const ORDER = { burning: 0, failed: 1, out: 2 }
const LIST_LIMIT = 12

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${s}s`
}

export default function FirePanel({
  fireState, fireElapsed, fireIntensity, onFireIntensity, onIgniteFirst, onExtinguish, selectedVariants,
}) {
  const { parts } = useKit()
  if (!parts) return null

  const { burning, failed, out } = countFire(fireState)
  const anyFire = burning + failed + out > 0
  const result = fireRoundResult(fireState, parts.length, fireElapsed)
  const affected = parts
    .filter(p => fireState[p.id] && fireState[p.id] !== 'ok')
    .sort((a, b) => ORDER[fireState[a.id]] - ORDER[fireState[b.id]])

  return (
    <div
      className="metrics-panel fire-sim-panel"
      style={{ right: 304, bottom: 20, left: 'auto', top: 'auto', width: 270, maxHeight: '70vh', overflow: 'auto', position: 'fixed' }}
    >
      <div className="metrics-header" style={{ padding: '10px 14px 0' }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#e74c3c' }}>
          🔥 Fire Simulation
        </div>
      </div>

      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div className="fire-howto">
          {burning > 0
            ? <><strong>Put it out:</strong> click burning parts before the fire spreads.</>
            : <><strong>Start:</strong> click any part, or use the button below.</>}
        </div>

        <div className="fire-stats">
          <div><strong style={{ color: '#e74c3c' }}>{fmt(fireElapsed)}</strong><span>time</span></div>
          <div><strong style={{ color: '#e67e22' }}>{burning}</strong><span>burning</span></div>
          <div><strong style={{ color: '#2e86de' }}>{out}</strong><span>put out</span></div>
          <div><strong style={{ color: '#7f1f1f' }}>{failed}</strong><span>lost</span></div>
        </div>

        {result && (
          <div className={`fire-result fire-result--${result.tone}`}>
            <strong>{result.title}</strong>
            <span>{result.subtitle}</span>
          </div>
        )}

        <div className="fire-risk-meter__label">
          <span>Fire load</span>
          <strong>{fireIntensity}%</strong>
        </div>
        <input
          className="fire-intensity-slider"
          type="range"
          min="10"
          max="100"
          step="5"
          value={fireIntensity}
          onChange={e => onFireIntensity?.(Number(e.target.value))}
          title="Higher load: faster spread and failure"
          aria-label="Fire load"
        />

        <div className="fire-actions">
          <button className="fire-ignite-btn" onClick={onIgniteFirst}>
            {anyFire ? 'Restart at the weakest part' : 'Start at the weakest part'}
          </button>
          {anyFire && (
            <button className="fire-reset-btn" onClick={onExtinguish}>Reset</button>
          )}
        </div>
        <div className="fire-rule">Non-rated parts spread fast, 1hr slowly, 2hr never.</div>
      </div>

      {affected.length > 0 && (
        <div className="ipr-section" style={{ padding: '0 14px 12px' }}>
          <div className="ipr-section-label">Affected parts</div>
          {affected.slice(0, LIST_LIMIT).map(p => {
            const status = fireState[p.id]
            return (
              <div key={p.id} className="fire-part-row">
                <span className="fire-part-row__name" title={p.id}>{p.id}</span>
                <span className="fire-part-row__grade">{fireGradeOf(p, selectedVariants)}</span>
                <span className="fire-part-row__status" style={{ color: FIRE_COLORS[status], background: FIRE_COLORS[status] + '22' }}>
                  {FIRE_LABELS[status]}
                </span>
              </div>
            )
          })}
          {affected.length > LIST_LIMIT && (
            <div className="fire-part-more">+{affected.length - LIST_LIMIT} more · {parts.length - affected.length} untouched</div>
          )}
        </div>
      )}
    </div>
  )
}
