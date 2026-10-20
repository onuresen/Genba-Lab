import { Building2, HardHat, Activity, Flame, Wind, Leaf, Factory, Upload } from 'lucide-react'
import IfcLoadButton, { ImportStatus } from './IfcLoadButton'

const FEATURES = [
  { icon: HardHat, label: 'Crane' },
  { icon: Activity, label: 'Earthquake' },
  { icon: Flame, label: 'Fire' },
  { icon: Wind, label: 'Wind' },
  { icon: Leaf, label: 'Carbon' },
  { icon: Factory, label: 'Factory' },
]

// First screen: one click to a sample, or open / drop your own IFC.
export default function StartScreen({ ifc, darkMode }) {
  const busy = ifc.status?.busy
  return (
    <div id="root-container" className="empty-start" data-theme={darkMode ? 'dark' : 'light'}>
      <div className="empty-start-card">
        <div className="empty-start-kicker">現場 · BIM simulation playground</div>
        <h1>Genba Lab</h1>
        <p className="empty-start-lead">Real building models, real what-ifs.</p>

        <button className="start-sample-btn" onClick={ifc.importSample} disabled={busy}>
          <Building2 size={18} />
          <span>
            <strong>Try the sample building</strong>
            <small>3-storey office · 114 IFC elements</small>
          </span>
        </button>

        <div className="start-or">or use your own model</div>
        <IfcLoadButton ifc={ifc} label="Open IFC file" showStatus={false} />
        <div className="start-drop-hint"><Upload size={12} /> Drop an .ifc file anywhere</div>

        {ifc.status && <ImportStatus status={ifc.status} />}

        <div className="start-features" aria-label="What you can test">
          {FEATURES.map(({ icon, label }) => {
            const Icon = icon
            return <span key={label}><Icon size={12} />{label}</span>
          })}
        </div>
        <p className="empty-start-note">Your file stays in your browser. Nothing is uploaded.</p>
      </div>
    </div>
  )
}
