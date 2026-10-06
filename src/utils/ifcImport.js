// Browser entry point: File → kit + stored meshes.
import { ifcToKit } from './ifcToKit.js'
import { saveIfcGeometries } from './ifcGeometryStore.js'

function parseInWorker(bytes, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/ifcWorker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return onProgress?.(data.done, data.total)
      worker.terminate()
      if (data.type === 'result') resolve(data.parsed)
      else reject(new Error(data.message))
    }
    worker.onerror = (err) => { worker.terminate(); reject(new Error(err.message || 'IFC worker failed')) }
    worker.postMessage({ bytes }, [bytes])
  })
}

export async function importIfcFile(file, onProgress) {
  const bytes = await file.arrayBuffer()
  const parsed = await parseInWorker(bytes, onProgress)
  const modelKey = `ifc-${Date.now().toString(36)}`
  const result = ifcToKit(parsed, { fileName: file.name, modelKey })
  await saveIfcGeometries(result.geometries)
  return result
}
