// Wind panel: speed, direction, terrain, and the load on the model.
import { TERRAINS } from '../utils/windLoad'

const PRESETS = [
  { v: 15, label: 'Strong' },
  { v: 25, label: 'Storm' },
  { v: 34, label: 'Typhoon' },
  { v: 46, label: 'Super typhoon' },
]
const DIRS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]

function fmt(n, digits = 0) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

// Wind force by height: one bar per height band.
function ForceProfile({ bands }) {
  const max = Math.max(1, ...bands.map(b => Math.abs(b.forceKN)))
  const W = 230, H = 90, rowH = H / bands.length
  return (
    <svg className="wind-profile" viewBox={`0 0 ${W} ${H + 14}`} width="100%">
      {[...bands].reverse().map((b, i) => (
        <rect key={i} x={40} y={i * rowH + 1} height={rowH - 2}
          width={Math.max(1, (Math.abs(b.forceKN) / max) * (W - 50))} rx={1.5} fill="#2563eb" opacity={0.75} />
      ))}
      <text x={0} y={8} className="wind-profile__axis">{fmt(bands[bands.length - 1].z1)} m</text>
      <text x={0} y={H} className="wind-profile__axis">0 m</text>
      <text x={40} y={H + 12} className="wind-profile__axis">Force by height → (max {fmt(max)} kN)</text>
    </svg>
  )
}

export default function WindPanel({ windSpeed, onWindSpeed, windDir, onWindDir, terrain, onTerrain, result, parts, selectedVariants, onSelectPart }) {
  const busy = result?.busy
  const r = busy ? null : result

  // Parts the wind lifts harder than their own weight pulls down.
  const uplift = []
  if (r) {
    for (const p of parts) {
      const f = r.partForces.get(p.id)
      if (!f || f.fy <= 0) continue
      const v = p.variants[selectedVariants?.[p.id] ?? 0] ?? p.variants[0]
      const weightN = (v?.weight_kg ?? 0) * 9.81
      if (f.fy > weightN) uplift.push({ id: p.id, liftKN: f.fy / 1000, weightKN: weightN / 1000 })
    }
    uplift.sort((a, b) => b.liftKN - a.liftKN)
  }

  return (
    <div className="metrics-panel wind-panel" style={{ width: 280, maxHeight: '78vh', overflow: 'auto' }}>
      <div className="metrics-header" style={{ padding: '10px 14px 0' }}>
        <div className="wind-panel__title">🌬 Wind</div>
      </div>

      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div className="rain-panel__row">
          <span>Base wind speed V0</span>
          <strong>{windSpeed} m/s</strong>
        </div>
        <input type="range" min={5} max={60} step={1} value={windSpeed} onChange={e => onWindSpeed(Number(e.target.value))} style={{ width: '100%' }} />
        <div className="rain-presets">
          {PRESETS.map(p => (
            <button key={p.v} className={windSpeed === p.v ? 'active' : ''} onClick={() => onWindSpeed(p.v)}>
              {p.label}<span>{p.v}</span>
            </button>
          ))}
        </div>

        <div className="wind-row">
          <span className="wind-row__label">From</span>
          <div className="wind-dirs">
            {DIRS.map(([name, deg]) => (
              <button key={name} className={windDir === deg ? 'active' : ''} onClick={() => onWindDir(deg)}>{name}</button>
            ))}
          </div>
        </div>
        <div className="wind-row">
          <span className="wind-row__label">Terrain</span>
          <div className="wind-dirs wind-dirs--terrain">
            {Object.entries(TERRAINS).map(([key, t]) => (
              <button key={key} className={terrain === key ? 'active' : ''} onClick={() => onTerrain(key)} title={t.label}>
                {t.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        {busy && <div className="rain-panel__note">Computing wind on the model…</div>}
        {!busy && !r && <div className="rain-panel__note">No visible parts.</div>}
        {r && (
          <>
            <div className="rain-stats">
              <div><strong>{fmt(r.vTop, 1)}</strong><span>m/s at the top ({fmt(r.height, 1)} m)</span></div>
              <div><strong>{fmt(r.baseShearKN)}</strong><span>kN push on the building</span></div>
              <div><strong className="wind-press">{fmt(r.peakPa / 1000, 2)}</strong><span>kPa peak pressure</span></div>
              <div><strong className="wind-suck">{fmt(r.peakSuctionPa / 1000, 2)}</strong><span>kPa peak suction</span></div>
            </div>
            <div className="rain-panel__row" style={{ marginTop: 6 }}>
              <span>Overturning moment</span><strong>{fmt(r.overturnKNm)} kN·m</strong>
            </div>
            <ForceProfile bands={r.bands} />
            <div className="wind-legend">
              <span><i style={{ background: '#2563eb' }} />Pushes in</span>
              <span><i style={{ background: '#dc2626' }} />Pulls out</span>
            </div>
          </>
        )}
      </div>

      {r && uplift.length > 0 && (
        <div className="ipr-section" style={{ padding: '10px 14px' }}>
          <div className="ipr-section-label">Lifted more than its weight</div>
          {uplift.slice(0, 6).map(u => (
            <button key={u.id} className="rain-pond-row" onClick={() => onSelectPart?.(u.id)} title="Select part">
              <span>{u.id}</span>
              <strong>{fmt(u.liftKN, 1)} / {fmt(u.weightKN, 1)} kN</strong>
            </button>
          ))}
          <div className="rain-panel__note" style={{ marginTop: 4 }}>Needs fixing down (uplift / weight).</div>
        </div>
      )}

      <div className="ipr-section" style={{ padding: '8px 14px 12px' }}>
        <div className="rain-panel__note">
          BSL method, simplified. Gust factor {r ? fmt(r.gf, 1) : '—'} included.
          Faces behind other parts are sheltered. North = −Z of the model.
          Indicative only: no wind tunnel, no internal pressure.
        </div>
      </div>
    </div>
  )
}
