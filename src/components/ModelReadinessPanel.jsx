import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react'
import { useKit } from './KitContext'
import { assessModelReadiness } from '../utils/modelReadiness'

const LEVEL_LABEL = { strong: 'Declared', partial: 'Partial', limited: 'Mostly inferred' }
const TOOL_LABEL = { ready: 'Ready', indicative: 'Indicative', limited: 'Limited' }
const ICON = { strong: CheckCircle2, partial: AlertTriangle, limited: XCircle }

function pct(value) {
  return `${Math.round(value * 100)}%`
}

export default function ModelReadinessPanel({ onClose }) {
  const { parts, projectSettings } = useKit()
  const report = assessModelReadiness(parts, projectSettings.source)

  return (
    <aside className="readiness-panel" aria-label="Model readiness">
      <header className="readiness-panel__header">
        <div>
          <span>IFC evidence</span>
          <h2>Model readiness</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close model readiness"><X size={17} /></button>
      </header>

      <div className="readiness-panel__source">
        <div><span>Schema</span><strong>{report.source.schema}</strong></div>
        <div><span>Parts tested</span><strong>{report.counts.parts}</strong></div>
        <div><span>OpenBIM Core</span><strong>{report.source.coreVersion ?? 'Not recorded'}</strong></div>
        {report.source.digest && <small title={report.source.digest}>Source digest recorded · {report.source.digest.slice(0, 18)}…</small>}
      </div>

      <section className="readiness-panel__section">
        <div className="readiness-panel__section-title">
          <strong>Imported evidence</strong>
          <span>Coverage across projected parts</span>
        </div>
        <div className="readiness-checks">
          {report.checks.map(check => {
            const Icon = ICON[check.level]
            return (
              <div className={`readiness-check readiness-check--${check.level}`} key={check.id}>
                <Icon size={15} />
                <div>
                  <div><strong>{check.label}</strong><span>{pct(check.coverage)}</span></div>
                  <p>{check.note}</p>
                  <div className="readiness-check__bar"><i style={{ width: pct(check.coverage) }} /></div>
                </div>
                <em>{LEVEL_LABEL[check.level]}</em>
              </div>
            )
          })}
        </div>
      </section>

      <section className="readiness-panel__section">
        <div className="readiness-panel__section-title">
          <strong>Investigation readiness</strong>
          <span>What each Genba test will rely on</span>
        </div>
        <div className="readiness-tools">
          {report.tools.map(tool => (
            <article key={tool.id} className={`readiness-tool readiness-tool--${tool.status}`}>
              <div><strong>{tool.label}</strong><span>{TOOL_LABEL[tool.status]}</span></div>
              <p>{tool.basis}</p>
              <small>{tool.caveat}</small>
            </article>
          ))}
        </div>
      </section>

      <footer className="readiness-panel__footer">
        Readiness describes the evidence available to Genba Lab. It is not an IFC certification or an engineering approval.
      </footer>
    </aside>
  )
}
