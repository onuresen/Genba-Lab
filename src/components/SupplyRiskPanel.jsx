import { AlertTriangle, CheckCircle2, Shuffle } from 'lucide-react'
import { getSupplyRiskMeta, inferSupplyRisk, SUPPLY_RISK } from '../utils/materialMetrics'

function variantScore(variant) {
  const risk = getSupplyRiskMeta(variant).rank
  const lead = Number(variant?.lead_time_days ?? 999)
  const cost = Number(variant?.unit_cost_usd ?? 0) + Number(variant?.labor_cost_usd ?? 0)
  return risk * 100000 + lead * 100 + cost / 100
}

export default function SupplyRiskPanel({ parts, selectedVariants, visible, onVariantChange }) {
  const activeParts = parts.filter(part => visible[part.id])
  const rows = activeParts.map(part => {
    const idx = selectedVariants[part.id] ?? 0
    const variant = part.variants[idx]
    const meta = getSupplyRiskMeta(variant)
    return { part, idx, variant, meta }
  })

  const counts = rows.reduce((acc, row) => {
    acc[row.meta.label.toLowerCase()] += 1
    return acc
  }, { low: 0, medium: 0, high: 0 })

  const weightedRisk = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.meta.rank, 0) / (rows.length * 2) * 100)
    : 0
  const longestLead = rows.reduce((max, row) => Math.max(max, row.variant?.lead_time_days ?? 0), 0)
  const verdict = counts.high > 0 ? 'Shortage exposure' : counts.medium > 0 ? 'Watch list' : 'Stable'
  const verdictColor = counts.high > 0 ? SUPPLY_RISK.high.color : counts.medium > 0 ? SUPPLY_RISK.medium.color : SUPPLY_RISK.low.color

  function findReplacement(part, currentIdx) {
    const current = part.variants[currentIdx]
    const currentRank = getSupplyRiskMeta(current).rank
    return part.variants
      .map((variant, idx) => ({ variant, idx }))
      .filter(item => item.idx !== currentIdx && getSupplyRiskMeta(item.variant).rank < currentRank)
      .sort((a, b) => variantScore(a.variant) - variantScore(b.variant))[0]
  }

  function simulateShortage() {
    rows.forEach(row => {
      const replacement = findReplacement(row.part, row.idx)
      if (replacement) onVariantChange(row.part.id, replacement.idx)
    })
  }

  const switchable = rows.filter(row => findReplacement(row.part, row.idx)).length

  return (
    <div className="supply-panel">
      <div className="supply-summary">
        <div className="supply-score" style={{ borderColor: verdictColor }}>
          <span className="supply-score__value" style={{ color: verdictColor }}>{weightedRisk}%</span>
          <span className="supply-score__label">{verdict}</span>
        </div>
        <div className="supply-kpis">
          <div><strong>{counts.high}</strong><span>high risk</span></div>
          <div><strong>{counts.medium}</strong><span>medium</span></div>
          <div><strong>{longestLead}d</strong><span>longest lead</span></div>
        </div>
      </div>

      <button className="supply-shortage-btn" onClick={simulateShortage} disabled={switchable === 0}>
        <Shuffle size={14} />
        Simulate shortage
        <span>{switchable} switchable</span>
      </button>

      <div className="supply-list">
        {rows.map(row => {
          const replacement = findReplacement(row.part, row.idx)
          return (
            <div key={row.part.id} className="supply-row">
              <div className="supply-row__main">
                <span className="bom-swatch" style={{ background: row.variant.color }} />
                <div>
                  <div className="supply-row__part">{row.part.id}</div>
                  <div className="supply-row__variant">{row.variant.label}</div>
                </div>
              </div>
              <div className="supply-row__risk">
                <span className="supply-risk-badge" style={{ color: row.meta.color, borderColor: row.meta.color }}>
                  {row.meta.rank === 2 ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
                  {row.meta.label}
                </span>
                <span className="supply-lead">{row.variant.lead_time_days ?? '-'}d</span>
                {replacement && (
                  <button className="supply-switch-btn" onClick={() => onVariantChange(row.part.id, replacement.idx)}>
                    Use {inferSupplyRisk(replacement.variant)}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
