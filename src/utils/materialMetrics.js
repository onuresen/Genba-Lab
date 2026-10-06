export const SUPPLY_RISK = {
  low: { label: 'Low', color: '#27ae60', rank: 0 },
  medium: { label: 'Medium', color: '#f39c12', rank: 1 },
  high: { label: 'High', color: '#e74c3c', rank: 2 },
}

function labelOf(variant) {
  return `${variant?.label ?? ''} ${variant?.meta ?? ''}`.toLowerCase()
}

export function inferThermalConductivity(variant) {
  if (variant?.thermal_conductivity_wpmk != null) return Number(variant.thermal_conductivity_wpmk)
  const label = labelOf(variant)
  if (label.includes('steel')) return 50
  if (label.includes('aluminum') || label.includes('aluminium')) return 205
  if (label.includes('titanium')) return 22
  if (label.includes('glass')) return 1
  if (label.includes('concrete') || label.includes('slab') || label.includes('plinth')) return 1.7
  if (label.includes('clt') || label.includes('timber') || label.includes('wood')) return 0.13
  if (label.includes('cork')) return 0.04
  if (label.includes('bamboo')) return 0.16
  if (label.includes('earth')) return 1.1
  if (label.includes('mycelium')) return 0.05
  return 0.8
}

export function inferSupplyRisk(variant) {
  if (variant?.supply_risk) return variant.supply_risk
  const lead = Number(variant?.lead_time_days ?? 0)
  if (lead > 60) return 'high'
  if (lead > 30) return 'medium'
  return 'low'
}

export function inferStcRating(variant) {
  if (variant?.stc_rating != null) return Number(variant.stc_rating)
  const label = labelOf(variant)
  if (label.includes('concrete') || label.includes('slab') || label.includes('earth')) return 55
  if (label.includes('brick') || label.includes('stone')) return 52
  if (label.includes('clt') || label.includes('timber') || label.includes('wood')) return 44
  if (label.includes('glass')) return 38
  if (label.includes('cork') || label.includes('mycelium')) return 48
  if (label.includes('pod') || label.includes('bathroom') || label.includes('cabin')) return 42
  if (label.includes('steel') || label.includes('aluminum') || label.includes('aluminium')) return 34
  return 40
}

export function getSupplyRiskMeta(variant) {
  return SUPPLY_RISK[inferSupplyRisk(variant)] ?? SUPPLY_RISK.low
}

export function thermalColor(conductivity) {
  const t = Math.max(0, Math.min(1, Math.log10(Math.max(conductivity, 0.04) / 0.04) / Math.log10(205 / 0.04)))
  const stops = [
    [52, 152, 219],
    [46, 204, 113],
    [243, 156, 18],
    [231, 76, 60],
  ]
  const scaled = t * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(scaled))
  const f = scaled - i
  const rgb = stops[i].map((c, idx) => Math.round(c + (stops[i + 1][idx] - c) * f))
  return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`
}

export function acousticColor(stc) {
  const t = Math.max(0, Math.min(1, stc / 60))
  const r = Math.round(231 + (39 - 231) * t)
  const g = Math.round(76 + (174 - 76) * t)
  const b = Math.round(60 + (96 - 60) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
