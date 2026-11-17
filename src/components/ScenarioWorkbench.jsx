import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const STAGES = ['Question', 'Inputs', 'Run', 'Evidence', 'Alternative']

export default function ScenarioWorkbench({ scenarios, activeId, onSelect }) {
  const [collapsed, setCollapsed] = useState(false)
  const active = scenarios.find(s => s.id === activeId) ?? scenarios[0]
  if (!active) return null

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
        </>
      )}
    </section>
  )
}
