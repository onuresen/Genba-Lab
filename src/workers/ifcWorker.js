// Parses IFC off the main thread. Messages:
//   in:  { bytes: ArrayBuffer, source: { bindingId, assetRef } }
//   out: { type: 'progress', done, total } | { type: 'result', parsed } | { type: 'error', message }
import * as WebIFC from 'web-ifc'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'
import { createIfcWorkerHandler } from '@onuresen/openbim-core/worker-protocol'
import { projectOpenBimResultToGenba } from '../utils/openBimProjection.js'

let apiPromise = null
function getApi() {
  if (!apiPromise) {
    const api = new WebIFC.IfcAPI()
    apiPromise = api.Init(path => (path.endsWith('.wasm') ? wasmUrl : path), true).then(() => api)
  }
  return apiPromise
}

const handleOpenBim = createIfcWorkerHandler({ loadApi: getApi, WebIFC })

self.onmessage = async (e) => {
  try {
    const { message } = await handleOpenBim({
      type: 'parse-ifc',
      bytes: e.data.bytes,
      source: e.data.source,
      parserVersion: '0.0.78',
    }, progress => {
      self.postMessage(progress)
    })
    const parsed = projectOpenBimResultToGenba(message.result)
    const transfer = parsed.elements.flatMap(el => [el.positions.buffer, el.normals.buffer, el.indices.buffer])
    self.postMessage({ type: 'result', parsed }, transfer)
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) })
  }
}
