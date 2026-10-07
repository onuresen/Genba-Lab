// Node helpers: load the fixture kit + its IFC file and open web-ifc headless.
// tests/fixtures/basic-kit.ifc was written once from basic-kit.json by the old
// Kit-of-Parts box exporter (removed from the app), so the two describe the same parts.
import { readFileSync } from 'node:fs'
import * as WebIFC from 'web-ifc'

export function loadFixture(name = 'basic-kit') {
  const kit = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'))
  const ifcText = readFileSync(new URL(`./fixtures/${name}.ifc`, import.meta.url), 'utf8')
  return { kit, ifcText }
}

export async function openWebIfc() {
  const api = new WebIFC.IfcAPI()
  await api.Init()
  return { api, WebIFC }
}
