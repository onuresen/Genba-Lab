import { useCallback, useRef, useState } from 'react'
import { useKit } from '../components/KitContext'
import { importIfcFile } from './ifcImport'

// Served from public/: written by scripts/make-sample-ifc.mjs.
export const SAMPLE_URL = './samples/genba-sample-office.ifc'
const SAMPLE_NAME = 'genba-sample-office.ifc'

// One import state for the start screen, the sidebar and drag-and-drop.
// status: null | { busy, text, progress (0–1), error }
export function useIfcImport() {
  const { loadKitData } = useKit()
  const [status, setStatus] = useState(null)
  const busyRef = useRef(false)

  const run = useCallback(async (getFile, firstText) => {
    if (busyRef.current) return
    busyRef.current = true
    setStatus({ busy: true, text: firstText, progress: 0 })
    try {
      const file = await getFile()
      if (!/\.ifc$/i.test(file.name)) throw new Error('Please choose an .ifc file.')
      setStatus({ busy: true, text: `Reading ${file.name}…`, progress: 0.05 })
      const { kit, summary } = await importIfcFile(file, (done, total) => {
        setStatus({ busy: true, text: `Building parts ${done} / ${total}`, progress: 0.1 + 0.85 * (done / Math.max(1, total)) })
      })
      loadKitData(kit)
      const groupedNote = summary.grouped ? ' (grouped by storey + type)' : ''
      setStatus({ busy: false, text: `${summary.elements} elements → ${summary.parts} parts${groupedNote}` })
    } catch (err) {
      console.error(err)
      setStatus({ busy: false, error: true, text: `Could not open the model: ${err.message}` })
    } finally {
      busyRef.current = false
    }
  }, [loadKitData])

  const importFile = useCallback(file => {
    if (file) run(async () => file, `Opening ${file.name}…`)
  }, [run])

  const importSample = useCallback(() => run(async () => {
    const res = await fetch(SAMPLE_URL)
    if (!res.ok) throw new Error(`sample not found (HTTP ${res.status})`)
    return new File([await res.blob()], SAMPLE_NAME)
  }, 'Loading the sample building…'), [run])

  return { status, importFile, importSample }
}
