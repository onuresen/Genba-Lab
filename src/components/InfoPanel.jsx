import { useState } from 'react'
import { useKit } from './KitContext'
import { TYPE_COLOR } from './Connection'
import { getSupplyRiskMeta, inferStcRating, inferThermalConductivity } from '../utils/materialMetrics'

// Readable labels for the IFC summary saved on imported variants.
const IFC_FIELDS = [
  ['Material', 'Material'],
  ['Reference', 'Type'],
  ['LoadBearing', 'Load bearing'],
  ['IsExternal', 'External'],
  ['FireRatingMinutes', 'Fire rating (min)'],
  ['ThermalTransmittance', 'U-value (W/m²K)'],
  ['AcousticRating', 'Acoustic rating'],
  ['ElementCount', 'Elements'],
  ['GlobalId', 'GlobalId'],
]

function formatIfcValue(v) {
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3)
  return String(v)
}

function IfcDataSection({ variant }) {
  const [showAll, setShowAll] = useState(false)
  const summary = variant.ifc_property_set ?? {}
  const psets = variant.ifc_psets ?? {}
  const rows = IFC_FIELDS.filter(([k]) => summary[k] !== undefined)
  const psetNames = Object.keys(psets)
  if (rows.length === 0 && psetNames.length === 0) return null
  return (
    <div className="ipr-section">
      <div className="ipr-section-label">IFC data · {variant.ifc_entity}</div>
      <dl className="ifc-data">
        {rows.map(([k, label]) => (
          <div key={k} className="ifc-data-row">
            <dt>{label}</dt>
            <dd title={formatIfcValue(summary[k])}>{formatIfcValue(summary[k])}</dd>
          </div>
        ))}
      </dl>
      {psetNames.length > 0 && (
        <button className="ifc-data-toggle" onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Hide' : 'Show'} all property sets ({psetNames.length})
        </button>
      )}
      {showAll && psetNames.map(name => (
        <div key={name} className="ifc-pset">
          <div className="ifc-pset-name">{name}</div>
          <dl className="ifc-data">
            {Object.entries(psets[name]).map(([k, v]) => (
              <div key={k} className="ifc-data-row">
                <dt>{k}</dt>
                <dd title={formatIfcValue(v)}>{formatIfcValue(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

const CONN_TYPES = ['bolted', 'dry-fit', 'welded', 'adhesive', 'damper', 'base-isolation']

const SEISMIC_COLOR = { 1: '#f39c12', 2: '#3498db', 3: '#27ae60' }
const SEISMIC_LABEL = { 1: '耐震等級1', 2: '耐震等級2', 3: '耐震等級3' }
const FIRE_COLOR = { '1hr': '#e67e22', '2hr': '#e74c3c', 'non-rated': '#95a5a6' }
const FIRE_LABEL = { '1hr': '耐火1時間', '2hr': '耐火2時間', 'non-rated': '非耐火' }

export default function InfoPanel({
  selected, selectedVariants, onVariantChange,
  sequenceMode, sequenceStep, maxStep, onStepForward, onStepBack,
  sectionCutActive, sectionCutY, onSectionCutY,
  envSettings, setEnvSettings,
  showAcoustic,
}) {
  const { parts, addConnection, removeConnection: removeConn, formatCurrency } = useKit()
  const [addingConn, setAddingConn] = useState(false)
  const [newConn, setNewConn] = useState({ to: '', type: 'bolted', hardware: '' })

  const part = selected ? parts.find(p => p.id === selected.id) : null
  const activeIdx = part ? (selectedVariants[part.id] ?? 0) : 0
  const activeVariant = part ? part.variants[activeIdx] : null
  const supplyRisk = activeVariant ? getSupplyRiskMeta(activeVariant) : null

  const otherParts = part ? parts.filter(p => p.id !== part.id) : []
  const connections = part?.connections ?? []

  function removeConnection(connTo) {
    removeConn(part.id, connTo)
  }

  function saveConnection() {
    if (!newConn.to) return
    addConnection(part.id, { ...newConn })
    setAddingConn(false)
    setNewConn({ to: '', type: 'bolted', hardware: '' })
  }

  return (
    <div className={`info-panel-right${part ? ' info-panel-right--open' : ''}`}>

      {part ? (
        /* ── Part selected ── */
        <>
          <div className="ipr-part-header" style={{ borderLeftColor: activeVariant.color }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <h3 className="ipr-title">{selected.id}</h3>
              {part.factory_work != null && (
                <span className={`ipr-badge ${part.factory_work ? 'ipr-badge--factory' : 'ipr-badge--site'}`}>
                  {part.factory_work ? 'Factory' : 'Site'}
                </span>
              )}
              {part.structural_role === 'primary' && (
                <span className="ipr-badge ipr-badge--structural">主構造</span>
              )}
              {part.structural_role === 'secondary' && (
                <span className="ipr-badge ipr-badge--secondary">二次</span>
              )}
            </div>
            <p className="ipr-meta">{activeVariant.meta}</p>
          </div>

          {/* Seismic / fire compliance badges */}
          {(activeVariant.seismic_grade || activeVariant.fire_resistance_grade) && (
            <div className="ipr-compliance-row">
              {activeVariant.seismic_grade && (
                <span
                  className="ipr-compliance-badge"
                  style={{ background: SEISMIC_COLOR[activeVariant.seismic_grade] + '22', color: SEISMIC_COLOR[activeVariant.seismic_grade], borderColor: SEISMIC_COLOR[activeVariant.seismic_grade] }}
                  title={activeVariant.bsl_notes ?? ''}
                >
                  {SEISMIC_LABEL[activeVariant.seismic_grade]}
                </span>
              )}
              {activeVariant.fire_resistance_grade && activeVariant.fire_resistance_grade !== 'non-rated' && (
                <span
                  className="ipr-compliance-badge"
                  style={{ background: FIRE_COLOR[activeVariant.fire_resistance_grade] + '22', color: FIRE_COLOR[activeVariant.fire_resistance_grade], borderColor: FIRE_COLOR[activeVariant.fire_resistance_grade] }}
                >
                  {FIRE_LABEL[activeVariant.fire_resistance_grade]}
                </span>
              )}
              {activeVariant.bsl_compliant && (
                <span className="ipr-compliance-badge ipr-compliance-badge--bsl" title={activeVariant.bsl_notes ?? ''}>
                  建基法適合
                </span>
              )}
            </div>
          )}

          {activeVariant.ifc_property_set && <IfcDataSection key={part.id} variant={activeVariant} />}

          {part.variants.length > 1 && (
            <div className="ipr-section">
              <div className="ipr-section-label">Variants</div>
              <div className="info-variants">
                {part.variants.map((v, i) => (
                  <button
                    key={i}
                    className={`variant-btn ${i === activeIdx ? 'variant-btn--active' : ''}`}
                    style={i === activeIdx ? { borderColor: v.color, background: v.color + '22' } : {}}
                    onClick={() => onVariantChange(part.id, i)}
                    title={v.meta}
                  >
                    <span className="variant-swatch" style={{ background: v.color }} />
                    {v.label}
              {v.lead_time_days != null && (
                <span className="variant-lead-badge">{v.lead_time_days}d</span>
              )}
              <span
                className="variant-risk-dot"
                style={{ background: getSupplyRiskMeta(v).color }}
                title={`${getSupplyRiskMeta(v).label} supply risk`}
              />
            </button>
          ))}
              </div>
            </div>
          )}

          <div className="ipr-stats">
            <div className="info-stat">
              <span className="info-stat-label">Weight</span>
              <span className="info-stat-value">{activeVariant.weight_kg.toLocaleString()} kg</span>
            </div>
            <div className="info-stat">
              <span className="info-stat-label">Material Cost</span>
              <span className="info-stat-value">{formatCurrency(activeVariant.unit_cost_usd)}</span>
            </div>
            {activeVariant.labor_cost_usd != null && (
              <div className="info-stat">
                <span className="info-stat-label">Labour Cost</span>
                <span className="info-stat-value">{formatCurrency(activeVariant.labor_cost_usd)}</span>
              </div>
            )}
            <div className="info-stat">
              <span className="info-stat-label">CO₂e</span>
              <span className="info-stat-value">{activeVariant.carbon_kgco2e.toLocaleString()} kg</span>
            </div>
            {activeVariant.load_bearing_kn != null && (
              <div className="info-stat">
                <span className="info-stat-label">耐荷重</span>
                <span className="info-stat-value">{activeVariant.load_bearing_kn.toLocaleString()} kN</span>
              </div>
            )}
            {activeVariant.assembly_time_min != null && (
              <div className="info-stat">
                <span className="info-stat-label">Install Time</span>
                <span className="info-stat-value">{activeVariant.assembly_time_min} min</span>
              </div>
            )}
            {activeVariant.lead_time_days != null && (
              <div className="info-stat">
                <span className="info-stat-label">Lead Time</span>
                <span className="info-stat-value">{activeVariant.lead_time_days} days</span>
              </div>
            )}
            <div className="info-stat">
              <span className="info-stat-label">Thermal</span>
              <span className="info-stat-value">{inferThermalConductivity(activeVariant).toFixed(2)} W/mK</span>
            </div>
            <div className="info-stat">
              <span className="info-stat-label">STC</span>
              <span className="info-stat-value">{inferStcRating(activeVariant)}</span>
            </div>
          </div>

          <div className="ipr-section">
            <div className="ipr-section-label">Material Risk</div>
            <div className="ipr-material-row">
              <span className="supply-risk-badge" style={{ color: supplyRisk.color, borderColor: supplyRisk.color }}>
                {supplyRisk.label} supply risk
              </span>
              <span className="ipr-dim-sub">
                {showAcoustic ? `Acoustic overlay active · STC ${inferStcRating(activeVariant)}` : 'Lead-time derived unless explicit on variant'}
              </span>
            </div>
          </div>

          <div className="ipr-section">
            <div className="ipr-section-label">Dimensions</div>
            <div className="ipr-dimensions">
              {(part.size[0] * 1000).toFixed(0)} × {(part.size[1] * 1000).toFixed(0)} × {(part.size[2] * 1000).toFixed(0)} mm
              <span className="ipr-dim-sub">W × H × D</span>
            </div>
          </div>

          {/* JIS Standards */}
          {activeVariant.jis_standards && activeVariant.jis_standards.length > 0 && (
            <div className="ipr-section">
              <div className="ipr-section-label">JIS規格</div>
              <div className="ipr-jis-row">
                {activeVariant.jis_standards.map(std => (
                  <span key={std} className="ipr-jis-badge">{std}</span>
                ))}
              </div>
            </div>
          )}

          {activeVariant.dfma_notes && (
            <div className="ipr-section">
              <div className="ipr-section-label">施工要領 / Install Notes</div>
              <div className="ipr-dfma-notes">{activeVariant.dfma_notes}</div>
            </div>
          )}

          {activeVariant.supplier && (
            <div className="ipr-section">
              <div className="ipr-section-label">Supplier</div>
              <div className="ipr-supplier-row">
                <span>{activeVariant.supplier}</span>
                {activeVariant.sku && <span className="ipr-sku">{activeVariant.sku}</span>}
              </div>
            </div>
          )}

          {/* ── Connections ── */}
          <div className="ipr-section">
            <div className="ipr-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Connections</span>
              <button className="conn-add-toggle" onClick={() => { setAddingConn(s => !s); setNewConn({ to: otherParts[0]?.id ?? '', type: 'bolted', hardware: '' }) }}>
                {addingConn ? '✕' : '+'}
              </button>
            </div>

            {connections.length === 0 && !addingConn && (
              <div className="conn-empty">No connections defined</div>
            )}

            {connections.map((conn, i) => {
              const color = TYPE_COLOR[conn.type] ?? '#95a5a6'
              return (
                <div key={i} className="conn-row">
                  <span className="conn-type-dot" style={{ background: color }} />
                  <span className="conn-type-label" style={{ color }}>{conn.type}</span>
                  <span className="conn-arrow">→</span>
                  <span className="conn-target">{conn.to}</span>
                  {conn.hardware && <span className="conn-hardware">{conn.hardware}</span>}
                  <button className="conn-remove" onClick={() => removeConnection(conn.to)} title="Remove connection">✕</button>
                </div>
              )
            })}

            {addingConn && (
              <div className="conn-form">
                <select className="conn-select" value={newConn.to} onChange={e => setNewConn(s => ({ ...s, to: e.target.value }))}>
                  <option value="">— select part —</option>
                  {otherParts.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                </select>
                <select className="conn-select" value={newConn.type} onChange={e => setNewConn(s => ({ ...s, type: e.target.value }))}>
                  {CONN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  className="conn-input"
                  type="text"
                  placeholder="Hardware detail (optional)"
                  value={newConn.hardware}
                  onChange={e => setNewConn(s => ({ ...s, hardware: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') saveConnection() }}
                />
                <button className="conn-save" onClick={saveConnection} disabled={!newConn.to}>Add</button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── Global settings ── */
        <>
          <div className="ipr-settings-header">
            <span className="ipr-settings-title">Settings</span>
          </div>

          {sequenceMode && (
            <div className="ipr-section">
              <div className="ipr-section-label">Sequence</div>
              <div className="seq-label" style={{ marginBottom: 6 }}>
                {sequenceStep === 0
                  ? 'Press NEXT to start'
                  : `Step ${sequenceStep} / ${maxStep}`}
              </div>
              <div className="btn-row">
                <button className="seq-btn" onClick={onStepBack} disabled={sequenceStep === 0}>← PREV</button>
                <button className="seq-btn" onClick={onStepForward} disabled={sequenceStep === maxStep}>NEXT →</button>
              </div>
            </div>
          )}

          {sectionCutActive && (
            <div className="ipr-section">
              <div className="ipr-section-label">Section Cut</div>
              <div className="section-slider-label">Height: {sectionCutY.toFixed(1)} m <span className="ipr-dim-sub">({Math.round(sectionCutY * 1000)} mm)</span></div>
              <input
                type="range"
                className="section-slider"
                min="-0.5" max="3.5" step="0.05"
                value={sectionCutY}
                onChange={e => onSectionCutY(parseFloat(e.target.value))}
              />
              <div className="section-slider-ends">
                <span>Bottom</span><span>Top</span>
              </div>
            </div>
          )}

          <div className="ipr-section">
            <div className="ipr-section-label">Environment</div>
            <div className="ipr-env-controls">
              <label className="ipr-env-row">
                <span>Grass Floor</span>
                <input type="checkbox" checked={envSettings.grass}
                  onChange={e => setEnvSettings(s => ({ ...s, grass: e.target.checked }))} />
              </label>
              <label className="ipr-env-row">
                <span>Clouds</span>
                <input type="checkbox" checked={envSettings.clouds}
                  onChange={e => setEnvSettings(s => ({ ...s, clouds: e.target.checked }))} />
              </label>
              <label className="ipr-env-row">
                <span>Stars (Night)</span>
                <input type="checkbox" checked={envSettings.stars}
                  onChange={e => setEnvSettings(s => ({ ...s, stars: e.target.checked }))} />
              </label>
              <label className="ipr-env-row">
                <span>Ken Grid (910mm)</span>
                <input type="checkbox" checked={!!envSettings.kenGrid}
                  onChange={e => setEnvSettings(s => ({ ...s, kenGrid: e.target.checked }))} />
              </label>
              <div className="ipr-env-row ipr-env-row--time">
                <span>
                  Time of Day
                  <span className="ipr-time-val">{envSettings.time.toString().padStart(2, '0')}:00</span>
                </span>
                <input type="range" min="0" max="23" step="1"
                  value={envSettings.time}
                  onChange={e => setEnvSettings(s => ({ ...s, time: parseInt(e.target.value) }))} />
              </div>
            </div>
          </div>

          <div className="ipr-hint">Click a part in the scene to inspect</div>
        </>
      )}
    </div>
  )
}
