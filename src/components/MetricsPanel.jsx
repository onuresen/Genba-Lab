import { useState } from 'react'
import { useKit } from './KitContext'
import { generatePDF } from '../utils/pdfGenerator'
import { exportIFC } from '../utils/ifcExporter'
import AIOptimiserPanel from './AIOptimiserPanel'
import GanttPanel from './GanttPanel'
import SupplyRiskPanel from './SupplyRiskPanel'
import { getSupplyRiskMeta } from '../utils/materialMetrics'

const FOOTPRINT_M2 = 16
const RIBA_BUDGET = 300
const RIBA_BUDGET_TOTAL = RIBA_BUDGET * FOOTPRINT_M2

// CASBEE embodied carbon benchmarks (kg CO₂e/m²) for residential
const CASBEE_BENCHMARKS = {
  S:  { max: 200, label: 'S', color: '#27ae60' },
  A:  { max: 350, label: 'A', color: '#2980b9' },
  'B+': { max: 500, label: 'B+', color: '#f39c12' },
  'B-': { max: 700, label: 'B-', color: '#e67e22' },
  C:  { max: Infinity, label: 'C', color: '#e74c3c' },
}

function getCasbeeRank(carbonPerM2) {
  for (const [, v] of Object.entries(CASBEE_BENCHMARKS)) {
    if (carbonPerM2 <= v.max) return v
  }
  return CASBEE_BENCHMARKS.C
}

const SEISMIC_COLOR = { 1: '#f39c12', 2: '#3498db', 3: '#27ae60' }
const SEISMIC_LABEL = { 1: '耐震等級1', 2: '耐震等級2', 3: '耐震等級3' }

export default function MetricsPanel({ selectedVariants, visible, onClose, onVariantChange, highlightedWeek, onHighlightWeek }) {
  const { parts, projectSettings, formatCurrency } = useKit()
  const [activeTab, setActiveTab] = useState('cost')

  function getVariant(part) {
    const idx = selectedVariants[part.id] ?? 0
    return part.variants[idx]
  }

  const activeParts = parts.filter(p => visible[p.id])
  const totalWeight   = activeParts.reduce((sum, p) => sum + getVariant(p).weight_kg, 0)
  const totalMaterial = activeParts.reduce((sum, p) => sum + getVariant(p).unit_cost_usd, 0)
  const totalLabour   = activeParts.reduce((sum, p) => sum + (getVariant(p).labor_cost_usd ?? 0), 0)
  const totalCost     = totalMaterial + totalLabour
  const costPerM2     = Math.round(totalCost / FOOTPRINT_M2)
  const totalCarbon   = activeParts.reduce((sum, p) => sum + getVariant(p).carbon_kgco2e, 0)
  const carbonPerM2   = Math.round(totalCarbon / FOOTPRINT_M2)

  // RIBA 2030
  const budgetPct     = Math.round((carbonPerM2 / RIBA_BUDGET) * 100)
  const budgetColor   = budgetPct < 80 ? '#27ae60' : budgetPct <= 100 ? '#f39c12' : '#e74c3c'
  const barWidth      = Math.min((totalCarbon / RIBA_BUDGET_TOTAL) * 100, 100) + '%'

  // CASBEE
  const casbeeRank = getCasbeeRank(carbonPerM2)
  const isJP = projectSettings.standard === 'JP'

  const hasLabourData = activeParts.some(p => getVariant(p).labor_cost_usd != null)

  const factoryParts = activeParts.filter(p => p.factory_work === true)
  const siteParts    = activeParts.filter(p => p.factory_work === false)
  const factoryRatio = activeParts.length > 0 ? Math.round((factoryParts.length / activeParts.length) * 100) : 0
  const materialPct   = totalCost > 0 ? (totalMaterial / totalCost) * 100 : 50
  const labourPct     = totalCost > 0 ? (totalLabour   / totalCost) * 100 : 50

  // Structural compliance summary
  const primaryParts = parts.filter(p => p.structural_role === 'primary')
  const minSeismicGrade = primaryParts.reduce((min, p) => {
    const g = getVariant(p).seismic_grade
    if (g == null) return min
    return min === null ? g : Math.min(min, g)
  }, null)
  const bslCompliantCount = parts.filter(p => getVariant(p).bsl_compliant).length

  function exportCSV() {
    const headers = [
      'Component', 'Factory/Site', 'Variant', 'SKU', 'Supplier',
      'Visible', 'Weight (kg)', 'Material Cost (USD)', 'Labour Cost (USD)',
      'Total Cost (USD)', 'Lead Time (days)', 'CO2e (kg)', 'Install Time (min)',
      'Seismic Grade', 'Fire Resistance', 'BSL Compliant', 'JIS Standards', 'DFMA Notes'
    ]
    const rows = parts.map(part => {
      const v = getVariant(part)
      const labour = v.labor_cost_usd ?? ''
      const total  = labour !== '' ? v.unit_cost_usd + labour : v.unit_cost_usd
      return [
        part.id,
        part.factory_work == null ? '' : part.factory_work ? 'Factory' : 'Site',
        v.label,
        v.sku ?? '',
        v.supplier ?? '',
        visible[part.id] ? 'Yes' : 'No',
        v.weight_kg,
        v.unit_cost_usd,
        labour,
        total,
        v.lead_time_days ?? '',
        v.carbon_kgco2e,
        v.assembly_time_min ?? '',
        v.seismic_grade != null ? `耐震等級${v.seismic_grade}` : '',
        v.fire_resistance_grade ?? '',
        v.bsl_compliant ? 'Yes' : '',
        (v.jis_standards ?? []).join('; '),
        v.dfma_notes ?? ''
      ]
    })
    const tw  = activeParts.reduce((s, p) => s + getVariant(p).weight_kg, 0)
    const tm  = activeParts.reduce((s, p) => s + getVariant(p).unit_cost_usd, 0)
    const tl  = activeParts.reduce((s, p) => s + (getVariant(p).labor_cost_usd ?? 0), 0)
    rows.push(['', '', '', '', '', 'TOTALS', tw, tm, tl, tm + tl, '', '', '', '', '', '', '', ''])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'IC-BOM.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function handleExportPDF() {
    generatePDF(parts, selectedVariants, visible, projectSettings, formatCurrency)
  }

  function handleExportIFC() {
    exportIFC(parts, selectedVariants)
  }

  const tabs = ['cost', 'carbon', 'bom', 'prefab', 'structural', 'supply', 'ai', 'schedule']

  return (
    <div className="metrics-panel">
      <div className="metrics-header">
        <div className="metrics-tabs">
          {tabs.map(tab => (
            <button
              key={tab}
              className={`metrics-tab ${activeTab === tab ? 'metrics-tab--active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'cost' ? 'Cost' :
               tab === 'carbon' ? 'Carbon' :
               tab === 'bom' ? 'BOM' :
               tab === 'prefab' ? 'Prefab' :
               tab === 'structural' ? '構造' :
               tab === 'supply' ? 'Supply' :
               tab === 'ai' ? '✦ AI' :
               '📅 Schedule'}
            </button>
          ))}
        </div>
        <button className="est-close" onClick={onClose}>✕</button>
      </div>

      {/* ── Cost tab ── */}
      {activeTab === 'cost' && (
        <>
          <div className="est-metrics">
            <div className="est-metric">
              <span className="est-value">{totalWeight.toLocaleString()}</span>
              <span className="est-unit">kg total weight</span>
            </div>
            <div className="est-divider" />
            <div className="est-metric">
              <span className="est-value">{formatCurrency(totalCost)}</span>
              <span className="est-unit">all-in cost</span>
            </div>
            <div className="est-divider" />
            <div className="est-metric">
              <span className="est-value">{formatCurrency(costPerM2)}</span>
              <span className="est-unit">per m² ({FOOTPRINT_M2} m²)</span>
            </div>
          </div>

          {hasLabourData && (
            <div className="cost-split-section">
              <div className="cost-split-label-row">
                <span className="cost-split-legend cost-split-legend--material">Material</span>
                <span className="cost-split-values">
                  {formatCurrency(totalMaterial)} · {materialPct.toFixed(0)}%
                </span>
              </div>
              <div className="cost-split-bar">
                <div className="cost-split-bar__material" style={{ width: `${materialPct}%` }} />
                <div className="cost-split-bar__labour"   style={{ width: `${labourPct}%` }} />
              </div>
              <div className="cost-split-label-row">
                <span className="cost-split-legend cost-split-legend--labour">Labour</span>
                <span className="cost-split-values">
                  {formatCurrency(totalLabour)} · {labourPct.toFixed(0)}%
                </span>
              </div>
            </div>
          )}

          <div className="est-breakdown">
            {activeParts.map(part => {
              const v = getVariant(part)
              const matCost = v.unit_cost_usd
              const labCost = v.labor_cost_usd ?? 0
              const partTotal = matCost + labCost
              const matPct = totalCost > 0 ? (matCost / totalCost) * 100 : 0
              const labPctBar = totalCost > 0 ? (labCost / totalCost) * 100 : 0
              return (
                <div key={part.id} className="est-bar-row">
                  <div className="est-bar-label">
                    <span className="est-bar-swatch" style={{ background: v.color }} />
                    <span>{part.id}</span>
                  </div>
                  <div className="est-bar-track">
                    <div className="est-bar-fill" style={{ width: `${matPct}%`, background: v.color }} />
                    {labCost > 0 && (
                      <div className="est-bar-fill est-bar-fill--labour" style={{ width: `${labPctBar}%` }} />
                    )}
                  </div>
                  <span className="est-bar-pct">{formatCurrency(partTotal)}</span>
                </div>
              )
            })}
          </div>

          {hasLabourData && (
            <div className="cost-split-legend-row">
              <span className="cost-split-pip cost-split-pip--material" />Material cost
              <span className="cost-split-pip cost-split-pip--labour" style={{ marginLeft: 12 }} />Labour cost
            </div>
          )}
        </>
      )}

      {/* ── Carbon tab ── */}
      {activeTab === 'carbon' && (
        <>
          <div className="est-metrics">
            <div className="est-metric">
              <span className="est-value">{totalCarbon.toLocaleString()}</span>
              <span className="est-unit">kg CO₂e total</span>
            </div>
            <div className="est-divider" />
            <div className="est-metric">
              <span className="est-value">{carbonPerM2.toLocaleString()}</span>
              <span className="est-unit">kg CO₂e / m²</span>
            </div>
            <div className="est-divider" />
            {isJP ? (
              <div className="est-metric">
                <span className="est-value" style={{ color: casbeeRank.color }}>
                  {casbeeRank.label}
                </span>
                <span className="est-unit">CASBEE rank</span>
              </div>
            ) : (
              <div className="est-metric">
                <span className="est-value" style={{ color: budgetColor }}>{budgetPct}%</span>
                <span className="est-unit">vs RIBA 2030</span>
              </div>
            )}
          </div>

          {/* Standard toggle */}
          <div className="carbon-standard-toggle">
            <button
              className={`carbon-std-btn ${!isJP ? 'carbon-std-btn--active' : ''}`}
              onClick={() => {/* setProjectSettings handled via InfoPanel — show both */}}
            >
              RIBA 2030 (UK)
            </button>
            <button
              className={`carbon-std-btn ${isJP ? 'carbon-std-btn--active' : ''}`}
            >
              CASBEE (JP)
            </button>
          </div>

          {/* RIBA budget bar */}
          <div className="carbon-budget-wrap">
            <div className="carbon-budget-label">RIBA 2030 Budget — 300 kg CO₂e / m²</div>
            <div className="carbon-budget-track">
              <div className="carbon-budget-fill" style={{ width: barWidth }} />
              <div className="carbon-budget-marker" />
            </div>
            <div className="carbon-budget-pct" style={{ color: budgetColor }}>{budgetPct}% of budget</div>
          </div>

          {/* CASBEE benchmark */}
          <div className="carbon-budget-wrap">
            <div className="carbon-budget-label">CASBEE (JP) 建設時CO₂ — {casbeeRank.label} ランク</div>
            <div className="casbee-rank-row">
              {Object.entries(CASBEE_BENCHMARKS).filter(([k]) => k !== 'C').map(([k, v]) => (
                <div
                  key={k}
                  className={`casbee-rank-cell ${casbeeRank.label === k ? 'casbee-rank-cell--active' : ''}`}
                  style={{ borderColor: v.color, color: casbeeRank.label === k ? '#fff' : v.color, background: casbeeRank.label === k ? v.color : 'transparent' }}
                >
                  {k}
                </div>
              ))}
            </div>
            <div className="carbon-budget-label" style={{ color: casbeeRank.color, marginTop: 4 }}>
              {carbonPerM2} kg CO₂e/m² → {casbeeRank.label} (≤{casbeeRank.max === Infinity ? '∞' : casbeeRank.max} kg/m²)
            </div>
          </div>

          <div className="est-breakdown">
            {activeParts.map(part => {
              const v = getVariant(part)
              const pct = totalCarbon > 0 ? (v.carbon_kgco2e / totalCarbon) * 100 : 0
              return (
                <div key={part.id} className="est-bar-row">
                  <div className="est-bar-label">
                    <span className="est-bar-swatch" style={{ background: v.color }} />
                    <span>{part.id}</span>
                  </div>
                  <div className="est-bar-track">
                    <div className="est-bar-fill" style={{ width: `${Math.max(pct, 0)}%`, background: v.color }} />
                  </div>
                  <span className="est-bar-pct">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
          <div className="carbon-footer-note">Based on ICE Database v3.0 · CASBEE 2022 住宅版</div>
        </>
      )}

      {/* ── BOM tab ── */}
      {activeTab === 'bom' && (
        <>
          <table className="bom-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Variant</th>
                <th>kg</th>
                <th>Material</th>
                {hasLabourData && <th>Labour</th>}
                <th>Lead</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              {parts.map(part => {
                const v = getVariant(part)
                const isHidden = !visible[part.id]
                return (
                  <tr key={part.id} className={isHidden ? 'bom-row--hidden' : ''}>
                    <td>
                      <span className="bom-swatch" style={{ background: v.color }} />
                      {part.id}
                      {part.factory_work != null && (
                        <span className={`bom-badge ${part.factory_work ? 'bom-badge--factory' : 'bom-badge--site'}`}>
                          {part.factory_work ? 'F' : 'S'}
                        </span>
                      )}
                    </td>
                    <td className="bom-variant">
                      {v.label}
                      {v.sku && <span className="bom-sku">{v.sku}</span>}
                    </td>
                    <td className="bom-num">{v.weight_kg.toLocaleString()}</td>
                    <td className="bom-num">{formatCurrency(v.unit_cost_usd)}</td>
                    {hasLabourData && (
                      <td className="bom-num">{v.labor_cost_usd != null ? formatCurrency(v.labor_cost_usd) : '—'}</td>
                    )}
                    <td className="bom-num">{v.lead_time_days != null ? `${v.lead_time_days}d` : '—'}</td>
                    <td className="bom-num">
                      {(() => {
                        const risk = getSupplyRiskMeta(v)
                        return (
                          <span className="supply-risk-mini" style={{ color: risk.color, borderColor: risk.color }}>
                            {risk.label}
                          </span>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bom-total">
                <td colSpan={2}>Active Totals ({activeParts.length} components)</td>
                <td className="bom-num">{totalWeight.toLocaleString()}</td>
                <td className="bom-num">{formatCurrency(totalMaterial)}</td>
                {hasLabourData && <td className="bom-num">{formatCurrency(totalLabour)}</td>}
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
          <div className="bom-export-row">
            <button className="bom-export" onClick={exportCSV}>Export CSV</button>
            <button className="bom-export bom-export--pdf" onClick={handleExportPDF}>Export 施工要領書 PDF</button>
            <button className="bom-export bom-export--ifc" onClick={handleExportIFC}>Export IFC</button>
          </div>
        </>
      )}

      {/* ── Prefab tab (工場製作比率) ── */}
      {activeTab === 'prefab' && (
        <>
          <div className="est-metrics">
            <div className="est-metric">
              <span className="est-value">{factoryRatio}%</span>
              <span className="est-unit">factory work ratio</span>
            </div>
            <div className="est-divider" />
            <div className="est-metric">
              <span className="est-value">{factoryParts.length}</span>
              <span className="est-unit">factory parts</span>
            </div>
            <div className="est-divider" />
            <div className="est-metric">
              <span className="est-value">{siteParts.length}</span>
              <span className="est-unit">site parts</span>
            </div>
          </div>
          <div className="cost-split-section">
            <div className="cost-split-label-row">
              <span className="cost-split-legend cost-split-legend--material">Factory</span>
              <span className="cost-split-values">{factoryParts.length} parts · {factoryRatio}%</span>
            </div>
            <div className="cost-split-bar">
              <div className="cost-split-bar__material" style={{ width: `${factoryRatio}%` }} />
              <div className="cost-split-bar__labour"   style={{ width: `${100 - factoryRatio}%` }} />
            </div>
            <div className="cost-split-label-row">
              <span className="cost-split-legend cost-split-legend--labour">Site</span>
              <span className="cost-split-values">{siteParts.length} parts · {100 - factoryRatio}%</span>
            </div>
          </div>
          <div className="est-breakdown">
            {activeParts.map(part => (
              <div key={part.id} className="est-bar-row">
                <div className="est-bar-label">
                  <span className="est-bar-swatch" style={{ background: getVariant(part).color }} />
                  <span>{part.id}</span>
                </div>
                {part.factory_work != null && (
                  <span className={`bom-badge ${part.factory_work ? 'bom-badge--factory' : 'bom-badge--site'}`}>
                    {part.factory_work ? 'Factory' : 'Site'}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="carbon-footer-note">工場製作比率 — Japan DfMA KPI</div>
        </>
      )}

      {/* ── Structural tab (構造) ── */}
      {activeTab === 'structural' && (
        <>
          <div className="est-metrics">
            <div className="est-metric">
              <span
                className="est-value"
                style={{ color: minSeismicGrade ? SEISMIC_COLOR[minSeismicGrade] : '#95a5a6' }}
              >
                {minSeismicGrade ? `等級${minSeismicGrade}` : 'N/A'}
              </span>
              <span className="est-unit">耐震等級 (assembly min)</span>
            </div>
            <div className="est-divider" />
            <div className="est-metric">
              <span className="est-value">{bslCompliantCount}</span>
              <span className="est-unit">建基法適合 parts</span>
            </div>
            <div className="est-divider" />
            <div className="est-metric">
              <span className="est-value">{primaryParts.length}</span>
              <span className="est-unit">primary structure</span>
            </div>
          </div>

          <div className="structural-table-wrap">
            <table className="bom-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Role</th>
                  <th>耐震</th>
                  <th>耐火</th>
                  <th>kN</th>
                  <th>建基法</th>
                </tr>
              </thead>
              <tbody>
                {parts.map(part => {
                  const v = getVariant(part)
                  return (
                    <tr key={part.id} className={!visible[part.id] ? 'bom-row--hidden' : ''}>
                      <td>
                        <span className="bom-swatch" style={{ background: v.color }} />
                        {part.id}
                      </td>
                      <td className="bom-num" style={{ fontSize: 10 }}>
                        {part.structural_role === 'primary' ? '主構造' :
                         part.structural_role === 'secondary' ? '二次' :
                         part.structural_role === 'non-structural' ? '非構造' : '—'}
                      </td>
                      <td className="bom-num">
                        {v.seismic_grade != null ? (
                          <span style={{ color: SEISMIC_COLOR[v.seismic_grade], fontWeight: 600 }}>
                            {v.seismic_grade}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="bom-num" style={{ fontSize: 10 }}>
                        {v.fire_resistance_grade === '2hr' ? '2h' :
                         v.fire_resistance_grade === '1hr' ? '1h' : '—'}
                      </td>
                      <td className="bom-num">
                        {v.load_bearing_kn != null ? v.load_bearing_kn.toLocaleString() : '—'}
                      </td>
                      <td className="bom-num">
                        {v.bsl_compliant ? <span style={{ color: '#27ae60' }}>✓</span> : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* JIS Standards summary */}
          <div className="jis-summary-section">
            <div className="ipr-section-label" style={{ marginBottom: 6 }}>JIS規格 適用一覧</div>
            {parts.filter(p => getVariant(p).jis_standards?.length > 0).map(part => {
              const v = getVariant(part)
              return (
                <div key={part.id} className="jis-summary-row">
                  <span className="bom-swatch" style={{ background: v.color }} />
                  <span className="jis-summary-part">{part.id}</span>
                  <div className="jis-summary-tags">
                    {(v.jis_standards ?? []).map(std => (
                      <span key={std} className="ipr-jis-badge">{std}</span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="carbon-footer-note">建築基準法 = Building Standards Act Japan · JIS = 日本工業規格</div>
        </>
      )}

      {/* ── AI Optimiser tab ── */}
      {activeTab === 'ai' && (
        <AIOptimiserPanel
          parts={parts}
          selectedVariants={selectedVariants}
          onVariantChange={onVariantChange}
        />
      )}

      {/* ── Supply chain risk tab ── */}
      {activeTab === 'supply' && (
        <SupplyRiskPanel
          parts={parts}
          selectedVariants={selectedVariants}
          visible={visible}
          onVariantChange={onVariantChange}
        />
      )}

      {/* ── Schedule / Gantt tab ── */}
      {activeTab === 'schedule' && (
        <GanttPanel
          selectedVariants={selectedVariants}
          visible={visible}
          highlightedWeek={highlightedWeek}
          onHighlightWeek={onHighlightWeek}
        />
      )}
    </div>
  )
}
