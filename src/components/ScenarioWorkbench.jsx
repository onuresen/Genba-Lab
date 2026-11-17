import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { compareScenarioSnapshots } from '../utils/scenarioComparison'

const STAGES = ['Question', 'Inputs', 'Run', 'Evidence', 'Alternative']

function formatValue(value, unit) {
  const digits = Math.abs(value) < 10 ? 2 : 1
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`
}

export default function ScenarioWorkbench({ scenarios, activeId, onSelect, records, onCapture, onClear }) {
  const [collapsed, setCollapsed] = useState(false)
  const active = scenarios.find(s => s.id === activeId) ?? scenarios[0]
  if (!active) return null
  const record = records[active.id] ?? {}
  const comparison = compareScenarioSnapshots(record.baseline, record.alternative)

  return (
    <section className={`scenario-workbench${collapsed ? ' scenario-workbench--collapsed' : ''}`} aria-label="Scenario workbench">
      <header className="scenario-workbench__header">
        <div>
          <span className="scenario-workbench__eyebrow">Scenario workbench</span>
          <strong>{active.label}</strong>
        </div>
        <button type="button" onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Expand scenario workbench' : 'Collapse scenario workbench'}>
          {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </header>

      {!collapsed && (
        <>
          {scenarios.length > 1 && (
            <div className="scenario-workbench__tabs" role="tablist" aria-label="Active scenarios">
              {scenarios.map(s => (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === active.id}
                  className={s.id === active.id ? 'active' : ''} onClick={() => onSelect(s.id)}>
                  {s.shortLabel ?? s.label}
                </button>
              ))}
            </div>
          )}

          <div className="scenario-workbench__question">
            <span>Question</span>
            <p>{active.question}</p>
          </div>

          <ol className="scenario-workbench__stages" aria-label="Investigation progress">
            {STAGES.map((stage, index) => (
              <li key={stage} className={index < active.stage ? 'done' : index === active.stage ? 'current' : ''}>
                <i>{index + 1}</i><span>{stage}</span>
              </li>
            ))}
          </ol>

          <div className="scenario-workbench__evidence">
            <span>{active.stage >= 3 ? 'Finding so far' : 'Current step'}</span>
            <strong>{active.evidence}</strong>
          </div>

          <div className="scenario-workbench__alternative">
            <span>Compare next</span>
            <p>{active.alternative}</p>
            <small>Indicative comparison only. Changing an input is not a verified redesign.</small>
          </div>

          <div className="scenario-compare">
            <div className="scenario-compare__title">
              <span>Controlled comparison</span>
              {(record.baseline || record.alternative) && <button type="button" onClick={() => onClear(active.id)}>Clear</button>}
            </div>
            <div className="scenario-compare__capture">
              <button type="button" disabled={!active.snapshot} className={record.baseline ? 'captured' : ''}
                onClick={() => onCapture(active.id, 'baseline', active.snapshot)}>
                {record.baseline ? '✓ Baseline captured' : 'Capture baseline'}
              </button>
              <button type="button" disabled={!active.snapshot || !record.baseline} className={record.alternative ? 'captured' : ''}
                onClick={() => onCapture(active.id, 'alternative', active.snapshot)}>
                {record.alternative ? '✓ Alternative captured' : 'Capture alternative'}
              </button>
            </div>
            {!active.snapshot && <p className="scenario-compare__hint">Complete this run before capturing evidence.</p>}
            {comparison && (
              <div className="scenario-compare__results">
                {comparison.metrics.map(metric => (
                  <div key={metric.key} className="scenario-compare__metric">
                    <span>{metric.label}</span>
                    <strong>{formatValue(metric.baseline, metric.unit)} → {formatValue(metric.alternative, metric.unit)}</strong>
                    <em className={metric.delta > 0 ? 'up' : metric.delta < 0 ? 'down' : ''}>
                      {metric.delta > 0 ? '+' : ''}{formatValue(metric.delta, metric.unit)}
                    </em>
                  </div>
                ))}
                <div className="scenario-compare__elements">
                  <span><strong>{comparison.newlyAffected.length}</strong> newly affected</span>
                  <span><strong>{comparison.relieved.length}</strong> relieved</span>
                  <span><strong>{comparison.unchanged.length}</strong> unchanged</span>
                </div>
                {(comparison.newlyAffected.length > 0 || comparison.relieved.length > 0) && (
                  <details>
                    <summary>Element-level changes</summary>
                    {comparison.newlyAffected.length > 0 && <p><b>New:</b> {comparison.newlyAffected.slice(0, 8).join(', ')}</p>}
                    {comparison.relieved.length > 0 && <p><b>Relieved:</b> {comparison.relieved.slice(0, 8).join(', ')}</p>}
                  </details>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
