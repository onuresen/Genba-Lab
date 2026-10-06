// IFC → plain element records, using an initialised web-ifc IfcAPI.
// Shared by the browser worker (src/workers/ifcWorker.js) and Node tests,
// so it never imports web-ifc itself — the caller passes `api` and `WebIFC`.
//
// Output coordinates are web-ifc's: metres, Y-up (same as Three.js).

// Elements that have geometry but are not building parts.
const SKIP_TYPES = new Set([
  'IFCOPENINGELEMENT', 'IFCSPACE', 'IFCSITE', 'IFCANNOTATION',
  'IFCGRID', 'IFCVIRTUALELEMENT', 'IFCOPENINGSTANDARDCASE',
])

// Upper-case web-ifc type names → readable IFC class names.
const TYPE_NAMES = {
  IFCWALL: 'IfcWall', IFCWALLSTANDARDCASE: 'IfcWall', IFCWALLELEMENTEDCASE: 'IfcWall',
  IFCSLAB: 'IfcSlab', IFCSLABSTANDARDCASE: 'IfcSlab', IFCSLABELEMENTEDCASE: 'IfcSlab',
  IFCCOLUMN: 'IfcColumn', IFCCOLUMNSTANDARDCASE: 'IfcColumn',
  IFCBEAM: 'IfcBeam', IFCBEAMSTANDARDCASE: 'IfcBeam',
  IFCMEMBER: 'IfcMember', IFCMEMBERSTANDARDCASE: 'IfcMember',
  IFCPLATE: 'IfcPlate', IFCPLATESTANDARDCASE: 'IfcPlate',
  IFCDOOR: 'IfcDoor', IFCDOORSTANDARDCASE: 'IfcDoor',
  IFCWINDOW: 'IfcWindow', IFCWINDOWSTANDARDCASE: 'IfcWindow',
  IFCROOF: 'IfcRoof', IFCSTAIR: 'IfcStair', IFCSTAIRFLIGHT: 'IfcStairFlight',
  IFCRAMP: 'IfcRamp', IFCRAMPFLIGHT: 'IfcRampFlight', IFCRAILING: 'IfcRailing',
  IFCFOOTING: 'IfcFooting', IFCPILE: 'IfcPile', IFCCOVERING: 'IfcCovering',
  IFCCURTAINWALL: 'IfcCurtainWall', IFCFURNISHINGELEMENT: 'IfcFurnishingElement',
  IFCFURNITURE: 'IfcFurniture', IFCBUILDINGELEMENTPROXY: 'IfcBuildingElementProxy',
  IFCFLOWSEGMENT: 'IfcFlowSegment', IFCFLOWFITTING: 'IfcFlowFitting',
  IFCFLOWTERMINAL: 'IfcFlowTerminal', IFCDUCTSEGMENT: 'IfcDuctSegment',
  IFCPIPESEGMENT: 'IfcPipeSegment',
}

export function ifcClassName(typeName) {
  const upper = String(typeName).toUpperCase()
  if (TYPE_NAMES[upper]) return TYPE_NAMES[upper]
  const rest = upper.replace(/^IFC/, '').toLowerCase()
  return 'Ifc' + rest.charAt(0).toUpperCase() + rest.slice(1)
}

function text(v) {
  return v && typeof v.value === 'string' ? v.value : ''
}

function toHex(c) {
  const h = n => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')
  return `#${h(c.x)}${h(c.y)}${h(c.z)}`
}

// Bake one placed geometry into world space and append it to `acc`.
function appendGeometry(api, modelID, placed, acc) {
  const geom = api.GetGeometry(modelID, placed.geometryExpressID)
  const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize())
  const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize())
  const m = placed.flatTransformation // column-major 4x4
  const base = acc.positions.length / 3

  for (let i = 0; i < verts.length; i += 6) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2]
    acc.positions.push(
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    )
    const nx = verts[i + 3], ny = verts[i + 4], nz = verts[i + 5]
    let tx = m[0] * nx + m[4] * ny + m[8] * nz
    let ty = m[1] * nx + m[5] * ny + m[9] * nz
    let tz = m[2] * nx + m[6] * ny + m[10] * nz
    const len = Math.hypot(tx, ty, tz) || 1
    acc.normals.push(tx / len, ty / len, tz / len)
  }
  for (let i = 0; i < idx.length; i++) acc.indices.push(idx[i] + base)

  const tris = idx.length / 3
  if (tris > acc.bestTris) {
    acc.bestTris = tris
    acc.color = toHex(placed.color)
  }
  geom.delete()
}

// Map element expressID → storey { id, name } via IfcRelContainedInSpatialStructure.
function readContainment(api, WebIFC, modelID) {
  const storeys = new Map()
  const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY)
  for (let i = 0; i < ids.size(); i++) {
    const s = api.GetLine(modelID, ids.get(i))
    storeys.set(s.expressID, { id: s.expressID, name: text(s.Name) || `Storey ${i + 1}` })
  }

  const byElement = new Map()
  const rels = api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)
  for (let i = 0; i < rels.size(); i++) {
    const rel = api.GetLine(modelID, rels.get(i))
    const storey = storeys.get(rel.RelatingStructure?.value)
    if (!storey) continue
    for (const el of rel.RelatedElements ?? []) byElement.set(el.value, storey)
  }
  return { storeys: [...storeys.values()], byElement }
}

// Plain JS value of an IFC property value (IfcLabel, IfcBoolean, measures…).
function propValue(v) {
  if (v == null) return null
  if (v._representationValue !== undefined) return v._representationValue
  if (v.value !== undefined) return v.value
  return null
}

// Quantity value keys used by IfcQuantityLength/Area/Volume/Count/Weight.
const QUANTITY_KEYS = ['VolumeValue', 'WeightValue', 'AreaValue', 'LengthValue', 'CountValue']
const MAX_PROPS_PER_ELEMENT = 60

// Scalar properties of one IfcPropertySet / IfcElementQuantity (flattened line).
function readDefinition(def) {
  const out = {}
  for (const p of def.HasProperties ?? []) {
    const name = text(p.Name)
    const val = propValue(p.NominalValue)
    if (name && val !== null && typeof val !== 'object') out[name] = val
  }
  for (const q of def.Quantities ?? []) {
    const name = text(q.Name)
    const key = QUANTITY_KEYS.find(k => q[k] != null)
    const val = key ? propValue(q[key]) : null
    if (name && typeof val === 'number') out[name] = val
  }
  return out
}

// Collect every IfcMaterial name inside a (flattened) material definition:
// IfcMaterial, layer sets/usages, profile sets, constituent sets, lists.
function collectMaterialNames(node, WebIFC, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return out
  if (Array.isArray(node)) {
    node.forEach(n => collectMaterialNames(n, WebIFC, out, depth + 1))
    return out
  }
  if (node.type === WebIFC.IFCMATERIAL) {
    const name = text(node.Name)
    if (name && !out.includes(name)) out.push(name)
    return out
  }
  for (const [key, val] of Object.entries(node)) {
    if (key === 'expressID' || key === 'type') continue
    if (val && typeof val === 'object') collectMaterialNames(val, WebIFC, out, depth + 1)
  }
  return out
}

function forEachLine(api, modelID, type, fn) {
  const ids = api.GetLineIDsWithType(modelID, type)
  for (let i = 0; i < ids.size(); i++) fn(ids.get(i))
}

/**
 * Element properties, materials and quantities, read in bulk.
 * Element values win over values inherited from its type object.
 * @returns Map<expressID, { psets: {[name]: {[prop]: value}}, materials: string[] }>
 */
function readProperties(api, WebIFC, modelID) {
  const defCache = new Map()
  const readDef = id => {
    if (!defCache.has(id)) {
      const def = api.GetLine(modelID, id, true)
      defCache.set(id, { name: text(def.Name) || `Set ${id}`, props: readDefinition(def) })
    }
    return defCache.get(id)
  }
  const info = new Map()
  const entry = id => {
    if (!info.has(id)) info.set(id, { psets: {}, materials: [] })
    return info.get(id)
  }

  forEachLine(api, modelID, WebIFC.IFCRELDEFINESBYPROPERTIES, relId => {
    const rel = api.GetLine(modelID, relId)
    const defId = rel.RelatingPropertyDefinition?.value
    if (!defId) return
    const def = readDef(defId)
    for (const obj of rel.RelatedObjects ?? []) {
      entry(obj.value).psets[def.name] = { ...def.props }
    }
  })

  forEachLine(api, modelID, WebIFC.IFCRELASSOCIATESMATERIAL, relId => {
    const rel = api.GetLine(modelID, relId, true)
    const names = collectMaterialNames(rel.RelatingMaterial, WebIFC, [])
    for (const obj of rel.RelatedObjects ?? []) {
      const id = obj.expressID ?? obj.value
      const e = entry(id)
      for (const n of names) if (!e.materials.includes(n)) e.materials.push(n)
    }
  })

  // Inherit from type objects (IfcWallType etc.) where the element has nothing.
  forEachLine(api, modelID, WebIFC.IFCRELDEFINESBYTYPE, relId => {
    const rel = api.GetLine(modelID, relId)
    const typeId = rel.RelatingType?.value
    if (!typeId) return
    const typeObj = api.GetLine(modelID, typeId)
    const typePsets = {}
    for (const ref of typeObj.HasPropertySets ?? []) {
      const def = readDef(ref.value)
      typePsets[def.name] = def.props
    }
    const typeInfo = info.get(typeId)
    for (const obj of rel.RelatedObjects ?? []) {
      const e = entry(obj.value)
      for (const [name, props] of Object.entries(typePsets)) {
        e.psets[name] = { ...props, ...(e.psets[name] ?? {}) }
      }
      if (e.materials.length === 0 && typeInfo) e.materials.push(...typeInfo.materials)
    }
  })

  // Keep stored data small: cap scalar props per element.
  for (const e of info.values()) {
    let n = 0
    for (const [name, props] of Object.entries(e.psets)) {
      const kept = {}
      for (const [k, v] of Object.entries(props)) {
        if (n >= MAX_PROPS_PER_ELEMENT) break
        kept[k] = v
        n++
      }
      if (Object.keys(kept).length) e.psets[name] = kept
      else delete e.psets[name]
    }
  }
  return info
}

function readProjectName(api, WebIFC, modelID) {
  const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT)
  if (ids.size() === 0) return ''
  const p = api.GetLine(modelID, ids.get(0))
  return text(p.LongName) || text(p.Name)
}

/**
 * Parse IFC bytes into element records.
 * @returns {{ projectName: string, schema: string, elements: Array<{
 *   expressID, ifcType, name, globalId, storey: {id,name}|null, color,
 *   psets: {[setName]: {[prop]: scalar}}, materials: string[],
 *   positions: Float32Array, normals: Float32Array, indices: Uint32Array }> }}
 */
export function parseIfc(api, WebIFC, bytes, onProgress) {
  const modelID = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true })
  try {
    const schema = api.GetModelSchema?.(modelID) ?? ''
    const projectName = readProjectName(api, WebIFC, modelID)
    const { byElement } = readContainment(api, WebIFC, modelID)
    const props = readProperties(api, WebIFC, modelID)
    const elements = []

    api.StreamAllMeshes(modelID, (mesh, index, total) => {
      const id = mesh.expressID
      const upper = String(api.GetNameFromTypeCode(api.GetLineType(modelID, id))).toUpperCase()
      if (SKIP_TYPES.has(upper)) return

      const acc = { positions: [], normals: [], indices: [], bestTris: -1, color: '#b0b0b0' }
      const geoms = mesh.geometries
      for (let i = 0; i < geoms.size(); i++) appendGeometry(api, modelID, geoms.get(i), acc)
      if (acc.indices.length === 0) return

      const line = api.GetLine(modelID, id)
      elements.push({
        expressID: id,
        ifcType: ifcClassName(upper),
        name: text(line.Name),
        globalId: text(line.GlobalId),
        storey: byElement.get(id) ?? null,
        color: acc.color,
        psets: props.get(id)?.psets ?? {},
        materials: props.get(id)?.materials ?? [],
        positions: new Float32Array(acc.positions),
        normals: new Float32Array(acc.normals),
        indices: new Uint32Array(acc.indices),
      })
      if (onProgress && (index % 25 === 0 || index === total - 1)) onProgress(index + 1, total)
    })

    return { projectName, schema, elements }
  } finally {
    api.CloseModel(modelID)
  }
}
