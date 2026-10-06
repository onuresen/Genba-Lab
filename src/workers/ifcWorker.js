// Parses IFC off the main thread. Messages:
//   in:  { bytes: ArrayBuffer }
//   out: { type: 'progress', done, total } | { type: 'result', parsed } | { type: 'error', message }
import * as WebIFC from 'web-ifc'
import wasmUrl from 'web-ifc/web-ifc.wasm?url'
import { parseIfc } from '../utils/ifcParse.js'

let apiPromise = null
function getApi() {
  if (!apiPromise) {
    const api = new WebIFC.IfcAPI()
    apiPromise = api.Init(path => (path.endsWith('.wasm') ? wasmUrl : path), true).then(() => api)
  }
  return apiPromise
}

self.onmessage = async (e) => {
  try {
    const api = await getApi()
    const parsed = parseIfc(api, WebIFC, new Uint8Array(e.data.bytes), (done, total) => {
      self.postMessage({ type: 'progress', done, total })
    })
    const transfer = parsed.elements.flatMap(el => [el.positions.buffer, el.normals.buffer, el.indices.buffer])
    self.postMessage({ type: 'result', parsed }, transfer)
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) })
  }
}
