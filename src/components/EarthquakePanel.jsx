// Earthquake panel: ground shaking, structure system, and the storey response.
import { DRIFT_LEVELS, ISO_CLEARANCE_CM, MOTIONS, SYSTEMS, jmaIntensity, swayScale } from '../utils/seismic'

const PRESETS = [
  { pga: 0.2, label: '5強' },
  { pga: 0.35, label: '6弱' },
  { pga: 0.55, label: '6強' },
  { pga: 0.85, label: '7' },
]

function fmt(n, d = 0) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })
}
const oneIn = r => (r > 0 ? `1/${fmt(1 / r)}` : '—')

// Ground acceleration and roof movement over time.
function Trace({ ground, roof }) {
  const W = 240, H = 64, n = ground.length
  if (n < 2) return null
  const gMax = Math.max(1e-6, ...ground.map(Math.abs))
  const rMax = Math.max(1e-6, ...roof.map(Math.abs))
  const line = (arr, max, y0, h) => arr.map((v, i) => `${((i / (n - 1)) * W).toFixed(1)},${(y0 - (v / max) * h).toFixed(1)}`).join(' ')
  return (
    <svg className="eq-trace" viewBox={`0 0 ${W} ${H + 10}`} width="100%">
      <polyline points={line(ground, gMax, 16, 13)} fill="none" stroke="#94a3b8" strokeWidth="1" />
      <polyline points={line(roof, rMax, 48, 14)} fill="none" stroke="#e67e22" strokeWidth="1.4" />
      <text x="0" y="8" className="wind-profile__axis">Ground ±{fmt(gMax, 2)} g</text>
      <text x="0" y={H + 8} className="wind-profile__axis">Top floor ±{fmt(rMax * 100, 1)} cm</text>
    </svg>
  )
}

export default function EarthquakePanel({
  pga, onPga, motion, onMotion, system, onSystem, dir, onDir,
  model, result, isShaking, countdown, onShake, hasShaken,
}) {
  const isPrimed = countdown != null
  const isLocked = isShaking || isPrimed
  const r = hasShaken && !isShaking ? result : null
  const level = r?.worst.level
  const trackColor = pga < 0.25 ? '#27ae60' : pga < 0.55 ? '#f39c12' : '#e74c3c'

  return (
    <div className="metrics-panel eq-panel" style={{ width: 290, maxHeight: '80vh', overflow: 'auto' }}>
      <div className="metrics-header" style={{ padding: '10px 14px 0' }}>
        <div className="eq-panel__title" style={{ color: trackColor }}>⚡ Earthquake</div>
      </div>

      <div className={`eq-status-strip ${isShaking ? 'eq-status-strip--active' : isPrimed ? 'eq-status-strip--countdown' : ''}`}>
        <span>{isShaking ? 'SHAKING' : isPrimed ? 'BRACE' : r ? 'RESULT' : 'READY'}</span>
        <strong>{isPrimed ? countdown : isShaking ? 'LIVE' : r ? level.label : ''}</strong>
      </div>

      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div className="rain-panel__row">
          <span>Ground shaking (PGA)</span>
          <strong style={{ color: trackColor }}>{fmt(pga, 2)} g · 震度 {jmaIntensity(pga)}</strong>
        </div>
        <input type="range" min={0.05} max={1.2} step={0.05} value={pga} disabled={isLocked}
          onChange={e => onPga(parseFloat(e.target.value))} style={{ width: '100%', accentColor: trackColor }} />
        <div className="rain-presets">
          {PRESETS.map(p => (
            <button key={p.label} disabled={isLocked} className={Math.abs(pga - p.pga) < 0.01 ? 'active' : ''} onClick={() => onPga(p.pga)}>
              震度{p.label}<span>{p.pga} g</span>
            </button>
          ))}
        </div>
        <div className="wind-row">
          <span className="wind-row__label">Type</span>
          <div className="wind-dirs wind-dirs--two">
            {Object.entries(MOTIONS).map(([k, m]) => (
              <button key={k} disabled={isLocked} className={motion === k ? 'active' : ''} onClick={() => onMotion(k)}>{m.label}</button>
            ))}
          </div>
        </div>
        <div className="wind-row">
          <span className="wind-row__label">Shake</span>
          <div className="wind-dirs wind-dirs--two">
            {['x', 'z'].map(d => (
              <button key={d} disabled={isLocked} className={dir === d ? 'active' : ''} onClick={() => onDir(d)}>Along {d.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <div className="wind-row">
          <span className="wind-row__label">System</span>
          <div className="wind-dirs wind-dirs--terrain">
            {Object.entries(SYSTEMS).map(([k, sys]) => (
              <button key={k} disabled={isLocked} className={system === k ? 'active' : ''} onClick={() => onSystem(k)} title={sys.label}>
                {sys.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {model && result && (
        <div className="ipr-section eq-building" style={{ padding: '8px 14px' }}>
          <span>{model.storeys.length} storeys · {fmt(model.height, 1)} m</span>
          <span>{fmt(model.totalMass / 1000)} t</span>
          <span>T = {fmt(result.period, 2)} s{result.isoPeriod ? ` (isolated ${result.isoPeriod} s)` : ''}</span>
          <span>耐震等級 {result.grade}</span>
        </div>
      )}
      {!model && <div className="rain-panel__note" style={{ padding: '8px 14px' }}>No visible parts with weight.</div>}

      <div style={{ padding: '10px 14px' }}>
        <button className="eq-shake-btn" onClick={onShake} disabled={isLocked || !result}
          style={{
            background: isLocked ? '#95a5a6' : `linear-gradient(135deg, ${trackColor}, #c0392b)`,
            animation: isShaking ? 'eq-shake-btn 0.15s infinite' : isPrimed ? 'eq-prime-btn 0.65s infinite' : 'none',
          }}>
          {isPrimed ? `⚡ BRACE ${countdown}` : isShaking ? '⚡ SHAKING…' : '⚡ SHAKE'}
        </button>
        {isShaking && model && result && (
          <div className="rain-panel__note" style={{ marginTop: 4 }}>Movement shown ×{swayScale(model, result)}.</div>
        )}
      </div>

      {r && (
        <>
          <div className="ipr-section" style={{ padding: '10px 14px' }}>
            <div className="eq-verdict" style={{ borderColor: level.color, background: level.color + '18' }}>
              <strong style={{ color: level.color }}>{level.label}</strong>
              <span>Worst storey: {r.worst.name}, drift {oneIn(r.worst.driftRatio)}</span>
            </div>
            <div className="rain-stats">
              <div><strong>{oneIn(r.worst.driftRatio)}</strong><span>max storey drift</span></div>
              <div><strong>{fmt(r.roofCm, 1)}</strong><span>cm top floor moves</span></div>
              <div><strong>{fmt(Math.max(...r.storeys.map(s => s.accel)), 2)}</strong><span>g max floor shaking</span></div>
              <div><strong>{fmt(r.strengthUsed * 100)}%</strong><span>of strength used{r.yields ? ' (yields)' : ''}</span></div>
            </div>
            {r.isoPeriod && (
              <div className="rain-panel__row" style={{ marginTop: 6 }}>
                <span>Isolators move</span>
                <strong style={{ color: r.isoOver ? '#e74c3c' : undefined }}>
                  {fmt(r.isoCm)} cm {r.isoOver ? `(over ${ISO_CLEARANCE_CM} cm gap)` : ''}
                </strong>
              </div>
            )}
            <Trace ground={r.groundTrace} roof={r.roofTrace} />
          </div>

          <div className="ipr-section" style={{ padding: '10px 14px' }}>
            <div className="ipr-section-label">Storeys (top first)</div>
            {[...r.storeys].reverse().map(s => (
              <div key={s.name + s.z0} className="rain-pond-row">
                <span><i className="eq-dot" style={{ background: s.level.color }} />{s.name}</span>
                <strong>{oneIn(s.driftRatio)} · {fmt(s.accel, 2)} g</strong>
              </div>
            ))}
            <div className="wind-legend" style={{ flexWrap: 'wrap', marginTop: 6 }}>
              {DRIFT_LEVELS.map(l => <span key={l.key}><i style={{ background: l.color }} />{l.label}</span>)}
            </div>
          </div>
        </>
      )}

      <div className="ipr-section" style={{ padding: '8px 14px 12px' }}>
        <div className="rain-panel__note">
          Shear-building model from IFC storeys and part weights. Period from the BSL formula.
          Synthetic ground motion. Drift limits: 1/200 no damage, 1/100 minor, 1/50 damage, 1/30 severe.
          Indicative only: no torsion, no soil.
        </div>
      </div>
    </div>
  )
}
