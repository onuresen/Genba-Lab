// Parsed IFC elements → a kit: the part model every simulation in the app reads.
// Each part gets `shape: 'ifc'` and an `ifcGeometry` key; the mesh itself
// lives in ifcGeometryStore (IndexedDB), not in the kit JSON / localStorage.
//
// Material, fire rating, load bearing, U-value, acoustic rating and quantities
// come from IFC property sets when present. Cost and carbon are always estimates
// (volume × material factors). Each variant's `meta` says which is which.

import { combineFacts, fireGrade, materialProfile } from './ifcProperties.js'

// Above this many elements, parts are grouped per storey + IFC class.
export const MAX_INDIVIDUAL_PARTS = 120

// Build order, lowest first. Unlisted classes go last.
const BUILD_ORDER = [
  'IfcPile', 'IfcFooting', 'IfcSlab', 'IfcColumn', 'IfcBeam', 'IfcMember',
  'IfcPlate', 'IfcWall', 'IfcCurtainWall', 'IfcStair', 'IfcStairFlight',
  'IfcRamp', 'IfcRampFlight', 'IfcRoof', 'IfcWindow', 'IfcDoor',
  'IfcRailing', 'IfcCovering',
]

// Per class: [default colour, density kg/m³, carbon kgCO2e/kg, cost USD/m³, structural role, factory work]
const CLASS_INFO = {
  IfcPile:        ['#8d8d8d', 2400, 0.15, 450, 'primary', false],
  IfcFooting:     ['#9aa3ab', 2400, 0.15, 400, 'primary', false],
  IfcSlab:        ['#b8bec4', 2400, 0.15, 500, 'primary', false],
  IfcColumn:      ['#7f8c99', 2400, 0.15, 900, 'primary', true],
  IfcBeam:        ['#e08e45', 2400, 0.15, 900, 'primary', true],
  IfcMember:      ['#c0773a', 7850, 1.55, 6000, 'secondary', true],
  IfcPlate:       ['#a0a7b0', 7850, 1.55, 6000, 'secondary', true],
  IfcWall:        ['#d9d4c7', 1800, 0.15, 350, 'secondary', true],
  IfcCurtainWall: ['#8fc3dd', 2500, 1.40, 2500, null, true],
  IfcWindow:      ['#8fc3dd', 600, 1.40, 3000, null, true],
  IfcDoor:        ['#a0724b', 600, 0.50, 2000, null, true],
  IfcRoof:        ['#8e5b4a', 1500, 0.30, 500, 'secondary', true],
  IfcStair:       ['#a8a8a8', 2400, 0.15, 900, 'secondary', true],
  IfcStairFlight: ['#a8a8a8', 2400, 0.15, 900, 'secondary', true],
  IfcRailing:     ['#555b63', 7850, 1.55, 5000, null, true],
  IfcCovering:    ['#e6e1d6', 1200, 0.40, 200, null, false],
}
const DEFAULT_INFO = ['#b0b0b0', 1000, 0.50, 500, null, false]

function classInfo(ifcType) {
  return CLASS_INFO[ifcType] ?? DEFAULT_INFO
}

function shortName(ifcType) {
  return ifcType.replace(/^Ifc/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
}

function round(n, d = 3) {
  const f = 10 ** d
  return Math.round(n * f) / f
}

function bounds(positions) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  }
  return { min, max }
}

// Volume of a closed triangle mesh (divergence theorem). Open meshes give junk,
// so the caller clamps it to the bounding-box volume.
function meshVolume(positions, indices) {
  let v = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3
    v += positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1])
       - positions[a + 1] * (positions[b] * positions[c + 2] - positions[b + 2] * positions[c])
       + positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])
  }
  return Math.abs(v / 6)
}

// Concatenate element meshes into one, shifted by `offset`.
function mergeMeshes(elements, offset) {
  let nPos = 0, nIdx = 0
  for (const e of elements) { nPos += e.positions.length; nIdx += e.indices.length }
  const positions = new Float32Array(nPos)
  const normals = new Float32Array(nPos)
  const indices = new Uint32Array(nIdx)
  let p = 0, q = 0
  for (const e of elements) {
    const base = p / 3
    for (let i = 0; i < e.positions.length; i += 3) {
      positions[p + i] = e.positions[i] - offset[0]
      positions[p + i + 1] = e.positions[i + 1] - offset[1]
      positions[p + i + 2] = e.positions[i + 2] - offset[2]
    }
    normals.set(e.normals, p)
    for (let i = 0; i < e.indices.length; i++) indices[q + i] = e.indices[i] + base
    p += e.positions.length
    q += e.indices.length
  }
  return { positions, normals, indices }
}

function boxesTouch(a, b, gap) {
  for (let k = 0; k < 3; k++) {
    if (a.min[k] - gap > b.max[k] || b.min[k] - gap > a.max[k]) return false
  }
  return true
}

/**
 * @param parsed   result of parseIfc()
 * @param options  { fileName, modelKey }
 * @returns {{ kit: {parts, presets, projectSettings}, geometries: Map<string, {positions, normals, indices}>, summary }}
 */
export function ifcToKit(parsed, { fileName = 'model.ifc', modelKey = 'ifc' } = {}) {
  const elements = parsed.elements.filter(e => e.indices.length > 0)
  if (elements.length === 0) throw new Error('No elements with geometry found in this IFC file.')

  // ── Whole-model placement: centre on XZ, sit on the ground ──
  for (const e of elements) e.bounds = bounds(e.positions)
  const modelMin = [Infinity, Infinity, Infinity]
  const modelMax = [-Infinity, -Infinity, -Infinity]
  for (const e of elements) {
    for (let k = 0; k < 3; k++) {
      modelMin[k] = Math.min(modelMin[k], e.bounds.min[k])
      modelMax[k] = Math.max(modelMax[k], e.bounds.max[k])
    }
  }
  const shift = [(modelMin[0] + modelMax[0]) / 2, modelMin[1], (modelMin[2] + modelMax[2]) / 2]
  const span = Math.max(modelMax[0] - modelMin[0], modelMax[2] - modelMin[2], 1)
  const height = Math.max(modelMax[1] - modelMin[1], 0.1)

  // ── Storeys ordered by the lowest element they contain ──
  const storeyLow = new Map()
  for (const e of elements) {
    if (!e.storey) continue
    const low = storeyLow.get(e.storey.id) ?? Infinity
    storeyLow.set(e.storey.id, Math.min(low, e.bounds.min[1]))
  }
  const storeyRank = new Map([...storeyLow.entries()].sort((a, b) => a[1] - b[1]).map(([id], i) => [id, i]))
  const storeyName = new Map(elements.filter(e => e.storey).map(e => [e.storey.id, e.storey.name]))

  // ── Grouping ──
  const grouped = elements.length > MAX_INDIVIDUAL_PARTS
  const groups = new Map()
  for (const e of elements) {
    const key = grouped ? `${e.storey?.id ?? 'none'}|${e.ifcType}` : `el|${e.expressID}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }

  const usedIds = new Set()
  function uniqueId(base) {
    let id = base, n = 2
    while (usedIds.has(id)) id = `${base} (${n++})`
    usedIds.add(id)
    return id
  }

  const geometries = new Map()
  const parts = []

  for (const members of groups.values()) {
    const first = members[0]
    const ifcType = first.ifcType
    const [defaultColor, classDensity, classCarbon, classCost, classRole, factory] = classInfo(ifcType)
    const facts = combineFacts(members)
    const mat = materialProfile(facts.materials)
    const density = mat?.density ?? classDensity
    const carbonPerKg = mat?.carbon ?? classCarbon
    const costPerM3 = mat?.cost ?? classCost

    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    let volume = 0
    let qVolumeCount = 0
    let qWeight = 0
    let qWeightCount = 0
    members.forEach((e, i) => {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], e.bounds.min[k])
        max[k] = Math.max(max[k], e.bounds.max[k])
      }
      const bboxVol = (e.bounds.max[0] - e.bounds.min[0]) * (e.bounds.max[1] - e.bounds.min[1]) * (e.bounds.max[2] - e.bounds.min[2])
      // IFC quantity wins when it is plausible (guards against mm³ / wrong units).
      const q = facts.facts[i].volume
      if (q && q <= bboxVol * 1.05) {
        volume += q
        qVolumeCount++
      } else {
        volume += Math.min(meshVolume(e.positions, e.indices), bboxVol)
      }
      if (facts.facts[i].weight) { qWeight += facts.facts[i].weight; qWeightCount++ }
    })
    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
    const size = [0, 1, 2].map(k => round(Math.max(max[k] - min[k], 0.01)))
    const pos = [round(center[0] - shift[0]), round(center[1] - shift[1]), round(center[2] - shift[2])]

    // Explode: push away from the model centre and lift by height.
    const dx = pos[0], dz = pos[2]
    const lift = (pos[1] / height) * span * 0.25 + 0.5
    const exp = [round(pos[0] + dx * 0.6), round(pos[1] + lift), round(pos[2] + dz * 0.6)]

    const sName = first.storey ? storeyName.get(first.storey.id) : null
    const baseId = grouped
      ? `${shortName(ifcType)} · ${sName ?? 'Unassigned'}`
      : (first.name && first.name.length <= 32 ? first.name : `${shortName(ifcType)} ${first.expressID}`)
    const id = uniqueId(baseId)

    const geometryKey = `${modelKey}:${parts.length}`
    geometries.set(geometryKey, mergeMeshes(members, center))

    const color = first.color && first.color !== '#ffffff' ? first.color : defaultColor
    const weightFromIfc = qWeightCount === members.length
    const weight = Math.round(weightFromIfc ? qWeight : volume * density)
    const countText = members.length > 1 ? `${members.length} elements. ` : ''

    // Load bearing from IFC overrides the class default.
    const role = facts.loadBearing === true ? 'primary'
      : facts.loadBearing === false && classRole === 'primary' ? 'secondary'
      : classRole

    // λ (W/mK): material value first. Without a known material, fall back to
    // U-value × smallest box side — rough, since a diagonal wall's box is not its thickness.
    const lambda = mat?.lambda
      ?? (facts.uValue ? round(Math.min(60, Math.max(0.02, facts.uValue * Math.min(...size))), 3) : undefined)

    const fromIfc = [
      mat && 'material',
      facts.fireMinutes != null && 'fire rating',
      facts.loadBearing !== undefined && 'load bearing',
      facts.uValue && 'U-value',
      facts.acoustic && 'acoustic rating',
      qVolumeCount === members.length && 'volume',
      weightFromIfc && 'weight',
    ].filter(Boolean)
    const estimated = ['cost', 'carbon', !weightFromIfc && 'weight', qVolumeCount < members.length && 'volume'].filter(Boolean)
    const meta = `${countText}Imported from ${fileName}. `
      + (fromIfc.length ? `From IFC: ${fromIfc.join(', ')}. ` : 'No IFC properties found. ')
      + `Estimated: ${estimated.join(', ')}.`

    const ifcSummary = {
      ...(grouped ? { ElementCount: members.length } : { GlobalId: first.globalId, ExpressID: first.expressID }),
      ...(facts.material ? { Material: facts.material } : {}),
      ...(facts.reference ? { Reference: facts.reference } : {}),
      ...(facts.fireMinutes != null ? { FireRatingMinutes: facts.fireMinutes } : {}),
      ...(facts.loadBearing !== undefined ? { LoadBearing: facts.loadBearing } : {}),
      ...(facts.isExternal !== undefined ? { IsExternal: facts.isExternal } : {}),
      ...(facts.uValue ? { ThermalTransmittance: facts.uValue } : {}),
      ...(facts.acoustic ? { AcousticRating: facts.acoustic } : {}),
    }

    parts.push({
      id,
      shape: 'ifc',
      ifcGeometry: geometryKey,
      pos,
      exp,
      size,
      sequence: 0, // set below
      factory_work: factory,
      structural_role: role,
      fire_compartment: sName ?? 'Unassigned',
      ...(facts.isExternal !== undefined ? { is_external: facts.isExternal } : {}),
      connections: [],
      _order: [
        first.storey ? storeyRank.get(first.storey.id) : 999,
        BUILD_ORDER.includes(ifcType) ? BUILD_ORDER.indexOf(ifcType) : BUILD_ORDER.length,
        pos[1],
      ],
      _bounds: { min: min.map((v, k) => v - shift[k]), max: max.map((v, k) => v - shift[k]) },
      variants: [{
        label: facts.material ? facts.material.slice(0, 40) : `${shortName(ifcType)} (from IFC)`,
        color,
        meta,
        weight_kg: weight,
        unit_cost_usd: Math.round(volume * costPerM3),
        labor_cost_usd: Math.round(volume * costPerM3 * 0.3),
        carbon_kgco2e: Math.round(weight * carbonPerKg),
        lead_time_days: 21,
        assembly_time_min: Math.max(15, Math.round(volume * 20)),
        seismic_grade: null,
        fire_resistance_grade: fireGrade(facts.fireMinutes),
        load_bearing_kn: null,
        bsl_compliant: null,
        ...(lambda != null ? { thermal_conductivity_wpmk: lambda } : {}),
        ...(facts.acoustic ? { stc_rating: Math.round(facts.acoustic) } : {}),
        ifc_entity: ifcType,
        ifc_property_set: ifcSummary,
        // Full property sets only for single-element parts (keeps localStorage small).
        ...(grouped ? {} : { ifc_psets: first.psets ?? {} }),
      }],
    })
  }

  // ── Sequence: storey → build order → height ──
  parts.sort((a, b) => a._order[0] - b._order[0] || a._order[1] - b._order[1] || a._order[2] - b._order[2])
  parts.forEach((p, i) => { p.sequence = i + 1 })

  // ── Connections: touching bounding boxes (2 cm tolerance), max 6 per part ──
  const MAX_CONN = 6
  const count = new Map(parts.map(p => [p.id, 0]))
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j]
      if (count.get(a.id) >= MAX_CONN || count.get(b.id) >= MAX_CONN) continue
      if (!boxesTouch(a._bounds, b._bounds, 0.02)) continue
      const type = a.structural_role === 'primary' && b.structural_role === 'primary' ? 'bolted' : 'dry-fit'
      a.connections.push({ to: b.id, type })
      b.connections.push({ to: a.id, type })
      count.set(a.id, count.get(a.id) + 1)
      count.set(b.id, count.get(b.id) + 1)
    }
  }
  for (const p of parts) { delete p._order; delete p._bounds }

  const all = Object.fromEntries(parts.map(p => [p.id, true]))
  const variants = Object.fromEntries(parts.map(p => [p.id, 0]))
  const presets = [
    { id: 'ifc-all', label: 'All', description: 'Every imported element', variants, visible: all },
    {
      id: 'ifc-structure', label: 'Structure', description: 'Primary structure only',
      variants, visible: Object.fromEntries(parts.map(p => [p.id, p.structural_role === 'primary'])),
    },
  ]

  const name = parsed.projectName || fileName.replace(/\.ifc$/i, '')
  return {
    kit: {
      parts,
      presets,
      projectSettings: { name, source: { type: 'ifc', fileName, schema: parsed.schema, modelKey } },
    },
    geometries,
    summary: {
      elements: elements.length,
      parts: parts.length,
      grouped,
      storeys: storeyRank.size,
      size: [round(modelMax[0] - modelMin[0], 1), round(height, 1), round(modelMax[2] - modelMin[2], 1)],
    },
  }
}
