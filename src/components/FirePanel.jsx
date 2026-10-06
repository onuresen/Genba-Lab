import { useKit } from './KitContext'

const FIRE_COLORS = { ok: '#27ae60', burning: '#e67e22', failed: '#7f1f1f' }
const FIRE_LABELS = { ok: 'OK', burning: '🔥 Burning', failed: '💀 Failed' }

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

  const burning = Object.values(fireState).filter(s => s === 'burning').length
  const failed  = Object.values(fireState).filter(s => s === 'failed').length
  const anyFire = burning + failed > 0
  const damagePct = parts.length > 0 ? Math.round(((burning * 0.6 + failed) / parts.length) * 100) : 0

  return (
    <div
      className="metrics-panel fire-sim-panel"
      style={{ right: 280, bottom: 20, left: 'auto', top: 'auto', width: 260, maxHeight: '70vh', overflow: 'auto', position: 'fixed' }}
    >
      <div className="metrics-header" style={{ padding: '10px 14px 0' }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#e74c3c' }}>
          🔥 Fire Simulation
        </div>
      </div>

      {/* Timer + stats */}
      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div className="fire-risk-meter">
          <div className="fire-risk-meter__bar" style={{ width: `${Math.min(fireIntensity, 100)}%` }} />
        </div>
        <div className="fire-risk-meter__label">
          <span>Scenario intensity</span>
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
          title="Adjust fire load and visual intensity"
        />
        <div className="fire-damage-readout">
          Spread impact <strong>{damagePct}%</strong>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e74c3c' }}>{fmt(fireElapsed)}</div>
            <div style={{ fontSize: 10, color: '#888' }}>elapsed</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#e67e22' }}>{burning}</div>
            <div style={{ fontSize: 10, color: '#888' }}>burning</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#7f1f1f' }}>{failed}</div>
            <div style={{ fontSize: 10, color: '#888' }}>failed</div>
          </div>
        </div>
        {!anyFire && (
          <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic', textAlign: 'center' }}>
            Click a part in the 3D view to ignite it
          </div>
        )}
        <button className="fire-ignite-btn" onClick={onIgniteFirst}>
          Ignite Test Part
        </button>
      </div>

      {/* Parts list */}
      <div className="ipr-section" style={{ padding: '0 14px 10px' }}>
        <div className="ipr-section-label">Parts Status</div>
        {parts.map(p => {
          const status = fireState[p.id] ?? 'ok'
          const varIdx = selectedVariants?.[p.id] ?? 0
          const grade = p.variants[varIdx]?.fire_resistance_grade ?? 'non-rated'
          return (
            <div key={p.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '3px 0', borderBottom: '1px solid #f0f0f0', fontSize: 11,
            }}>
              <span style={{ fontWeight: status !== 'ok' ? 700 : 400 }}>{p.id}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#aaa' }}>{grade}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: FIRE_COLORS[status],
                  background: FIRE_COLORS[status] + '22', padding: '1px 6px', borderRadius: 8,
                }}>
                  {FIRE_LABELS[status]}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Extinguish */}
      {anyFire && (
        <div style={{ padding: '0 14px 12px' }}>
          <button
            onClick={onExtinguish}
            style={{
              width: '100%', padding: '6px 0', border: 'none', borderRadius: 6, cursor: 'pointer',
              background: '#2980b9', color: '#fff', fontWeight: 700, fontSize: 12,
            }}
          >
            💧 Extinguish All
          </button>
        </div>
      )}
    </div>
  )
}
