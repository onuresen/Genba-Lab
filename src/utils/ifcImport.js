// Browser entry point: File → kit + stored meshes.
import { ifcToKit } from './ifcToKit.js'
import { saveIfcGeometries } from './ifcGeometryStore.js'

function importAssetRef(fileName) {
  const baseName = String(fileName || 'model.ifc').split(/[\\/]/).pop()
    .replace(/\.\.+/g, '.').replace(/[^A-Za-z0-9._ -]/g, '_')
  const ifcName = /\.ifc$/i.test(baseName) ? baseName : `${baseName}.ifc`
  return `imports/${ifcName}`
}

function parseInWorker(bytes, fileName, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/ifcWorker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') return onProgress?.(data.done, data.total)
      worker.terminate()
      if (data.type === 'result') resolve(data.parsed)
      else reject(new Error(data.message))
    }
    worker.onerror = (err) => { worker.terminate(); reject(new Error(err.message || 'IFC worker failed')) }
    worker.postMessage({
      bytes,
      source: { bindingId: 'genba-import', assetRef: importAssetRef(fileName) },
    }, [bytes])
  })
}

export async function importIfcFile(file, onProgress) {
  const bytes = await file.arrayBuffer()
  const parsed = await parseInWorker(bytes, file.name, onProgress)
  const modelKey = `ifc-${Date.now().toString(36)}`
  const result = ifcToKit(parsed, { fileName: file.name, modelKey })
  await saveIfcGeometries(result.geometries)
  return result
}
