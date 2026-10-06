import { useState } from 'react'
import { useKit } from './KitContext'
import { importIfcFile } from '../utils/ifcImport'

// "LOAD IFC" button with progress / result line. Used in the sidebar and the empty start screen.
export default function IfcLoadButton() {
  const { loadKitData } = useKit()
  const [status, setStatus] = useState(null) // null | { busy, text, error }

  async function handleFile(file) {
    if (!file) return
    setStatus({ busy: true, text: `Reading ${file.name}…` })
    try {
      const { kit, summary } = await importIfcFile(file, (done, total) => {
        setStatus({ busy: true, text: `Meshing ${done} / ${total}` })
      })
      loadKitData(kit)
      const groupedNote = summary.grouped ? ' (grouped by storey + type)' : ''
      setStatus({ busy: false, text: `${summary.elements} elements → ${summary.parts} parts${groupedNote}` })
    } catch (err) {
      console.error(err)
      setStatus({ busy: false, error: true, text: `IFC import failed: ${err.message}` })
    }
  }

  return (
    <>
      <button className="tool-btn ifc-load-btn" disabled={status?.busy}>
        {status?.busy ? 'IMPORTING IFC…' : 'LOAD IFC'}
        <input
          type="file"
          accept=".ifc"
          disabled={status?.busy}
          onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }}
        />
      </button>
      {status && (
        <div className={`ifc-status${status.error ? ' ifc-status--error' : ''}`}>{status.text}</div>
      )}
    </>
  )
}
