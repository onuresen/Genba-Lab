// Node helpers: capture the exporter's IFC text and open web-ifc headless.
import { readFileSync } from 'node:fs'
import * as WebIFC from 'web-ifc'
import { exportIFC } from '../src/utils/ifcExporter.js'

export function exportKitToIfcText(kitPath) {
  const kit = JSON.parse(readFileSync(new URL(kitPath, import.meta.url), 'utf8'))
  let captured = ''
  const saved = { Blob: globalThis.Blob, URL: globalThis.URL, document: globalThis.document }
  globalThis.Blob = class { constructor(parts) { captured = parts.join('') } }
  globalThis.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }
  globalThis.document = { createElement: () => ({ click() {} }) }
  try {
    exportIFC(kit.parts, Object.fromEntries(kit.parts.map(p => [p.id, 0])))
  } finally {
    Object.assign(globalThis, saved)
  }
  return { kit, ifcText: captured }
}

export async function openWebIfc() {
  const api = new WebIFC.IfcAPI()
  await api.Init()
  return { api, WebIFC }
}
