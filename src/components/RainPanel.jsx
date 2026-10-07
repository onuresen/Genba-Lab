// Rain & water flow panel: rainfall input and runoff results.
const PRESETS = [
  { mm: 10, label: 'Rain' },
  { mm: 30, label: 'Heavy' },
  { mm: 50, label: 'Very heavy' },
  { mm: 100, label: 'ゲリラ豪雨' },
]

function Bar({ label, share, color }) {
  const pct = Math.round(share * 100)
  return (
    <div className="rain-bar">
      <div className="rain-bar__label"><span>{label}</span><strong>{pct}%</strong></div>
      <div className="rain-bar__track"><div className="rain-bar__fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  )
}

export default function RainPanel({ rainfall, onRainfall, result, onSelectPart }) {
  const busy = result?.busy
  const r = busy ? null : result
  return (
    <div
      className="metrics-panel rain-panel"
      style={{ right: 280, bottom: 20, left: 'auto', top: 'auto', width: 270, maxHeight: '75vh', overflow: 'auto', position: 'fixed' }}
    >
      <div className="metrics-header" style={{ padding: '10px 14px 0' }}>
        <div className="rain-panel__title">💧 Rain & water flow</div>
      </div>

      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        <div className="rain-panel__row">
          <span>Rainfall</span>
          <strong>{rainfall} mm/h</strong>
        </div>
        <input type="range" min={5} max={150} step={5} value={rainfall} onChange={e => onRainfall(Number(e.target.value))} style={{ width: '100%' }} />
        <div className="rain-presets">
          {PRESETS.map(p => (
            <button key={p.mm} className={rainfall === p.mm ? 'active' : ''} onClick={() => onRainfall(p.mm)}>
              {p.label}<span>{p.mm}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="ipr-section" style={{ padding: '10px 14px' }}>
        {busy && <div className="rain-panel__note">Tracing water on the model…</div>}
        {!busy && !r && <div className="rain-panel__note">No visible parts to rain on.</div>}
        {r && (
          <>
            <div className="rain-stats">
              <div><strong>{Math.round(r.catchmentM2).toLocaleString()}</strong><span>m² catches rain</span></div>
              <div><strong>{r.runoffM3h.toFixed(1)}</strong><span>m³/h runoff</span></div>
            </div>
            <Bar label="Ponds on the building" share={r.share.pond} color="#1d4ed8" />
            <Bar label="Runs off to the ground" share={r.share.ground} color="#0891b2" />
            <Bar label="Caught by drains" share={r.share.drain} color="#16a34a" />
          </>
        )}
      </div>

      {r && r.pondParts.length > 0 && (
        <div className="ipr-section" style={{ padding: '10px 14px' }}>
          <div className="ipr-section-label">Where water collects</div>
          {r.pondParts.slice(0, 6).map(p => (
            <button key={p.partId} className="rain-pond-row" onClick={() => onSelectPart?.(p.partId)} title="Select part">
              <span>{p.partId}</span>
              <strong>{p.flow.toFixed(2)} m³/h</strong>
            </button>
          ))}
        </div>
      )}

      <div className="ipr-section" style={{ padding: '8px 14px 12px' }}>
        <div className="rain-panel__note">
          Surfaces under 0.5% fall hold water. Many IFC flat roofs are drawn with no fall.
          Drains: pipe / flow-terminal elements, or names with drain, gutter, 樋.
          Indicative only: no soaking-in, no gutter capacity.
        </div>
      </div>
    </div>
  )
}
