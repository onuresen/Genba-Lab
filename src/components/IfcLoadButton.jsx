import { FolderOpen } from 'lucide-react'

// "Open IFC" button with progress / result line. Import state comes from
// useIfcImport (shared with the start screen and drag-and-drop).
export default function IfcLoadButton({ ifc, label = 'Open IFC file', compact = false, showStatus = true }) {
  const { status, importFile } = ifc
  return (
    <>
      <button className={`tool-btn ifc-load-btn${compact ? ' ifc-load-btn--compact' : ''}`} disabled={status?.busy}>
        <FolderOpen size={14} />
        {status?.busy ? 'Importing…' : label}
        <input
          type="file"
          accept=".ifc"
          disabled={status?.busy}
          aria-label={label}
          onChange={e => { importFile(e.target.files[0]); e.target.value = '' }}
        />
      </button>
      {showStatus && status && <ImportStatus status={status} />}
    </>
  )
}

export function ImportStatus({ status }) {
  return (
    <div className={`ifc-status${status.error ? ' ifc-status--error' : ''}`} role="status">
      {status.busy && (
        <div className="ifc-progress">
          <div className="ifc-progress__bar" style={{ width: `${Math.round((status.progress ?? 0) * 100)}%` }} />
        </div>
      )}
      {status.text}
    </div>
  )
}
