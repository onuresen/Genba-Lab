// Turn IFC property sets + material names into part values (variant fields).
// Pure functions; used by ifcToKit.js and tested in Node.

// Material keyword → [label, density kg/m³, carbon kgCO2e/kg, cost USD/m³, λ W/mK].
// Carbon factors are rounded ICE-style averages. Costs are placeholders.
const MATERIALS = [
  [/alumin/i,                              'Aluminium',  2700, 8.0,  9000, 160],
  [/steel|metal|iron/i,                    'Steel',      7850, 1.55, 6000, 50],
  [/concrete|cement|grout|screed/i,        'Concrete',   2400, 0.15, 400,  1.7],
  [/clt|glulam|timber|wood|lumber|plywood|osb|lvl/i, 'Timber', 500, 0.45, 1200, 0.13],
  [/glass|glazing/i,                       'Glass',      2500, 1.4,  3000, 1.0],
  [/brick|masonry|block|cmu/i,             'Masonry',    1800, 0.24, 400,  0.8],
  [/gypsum|plaster|drywall|plasterboard/i, 'Gypsum',     900,  0.4,  300,  0.25],
  [/insulat|mineral wool|rockwool|eps|xps|pir|foam/i, 'Insulation', 30, 1.5, 100, 0.035],
]

export function materialProfile(names) {
  for (const name of names ?? []) {
    for (const [re, label, density, carbon, cost, lambda] of MATERIALS) {
      if (re.test(name)) return { name, label, density, carbon, cost, lambda }
    }
  }
  return null
}

// Find a property, preferring standard Pset_*Common sets.
export function findProp(psets, key) {
  const sets = Object.entries(psets ?? {})
  const ordered = [
    ...sets.filter(([n]) => /^Pset_.*Common$/.test(n)),
    ...sets.filter(([n]) => !/^Pset_.*Common$/.test(n)),
  ]
  for (const [, props] of ordered) {
    if (props[key] !== undefined && props[key] !== null && props[key] !== '') return props[key]
  }
  return undefined
}

function findNumber(psets, keys) {
  for (const k of keys) {
    const v = findProp(psets, k)
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  }
  return undefined
}

// "REI 60", "60", "1HR", "2 hours", "F90", "EI120" → minutes, or null.
export function parseFireRating(value) {
  if (value == null) return null
  if (typeof value === 'number') return value > 0 ? value : null
  const s = String(value).toLowerCase()
  const m = s.match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1])
  return /h(ou)?r|\bh\b|\d\s*h\b/.test(s) ? n * 60 : n
}

// Minutes → the app's grades.
export function fireGrade(minutes) {
  if (minutes == null) return null
  if (minutes >= 120) return '2hr'
  if (minutes >= 60) return '1hr'
  return 'non-rated'
}

// "Rw 45", "STC 50", "45 dB" → number, or null.
export function parseAcousticRating(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  const m = String(value).match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : null
}

// Facts read from one element's properties.
export function elementFacts(element) {
  const psets = element.psets ?? {}
  const bool = k => {
    const v = findProp(psets, k)
    return typeof v === 'boolean' ? v : undefined
  }
  return {
    fireMinutes: parseFireRating(findProp(psets, 'FireRating')),
    loadBearing: bool('LoadBearing'),
    isExternal: bool('IsExternal'),
    uValue: findNumber(psets, ['ThermalTransmittance']),
    acoustic: parseAcousticRating(findProp(psets, 'AcousticRating')),
    reference: findProp(psets, 'Reference'),
    volume: findNumber(psets, ['NetVolume', 'GrossVolume', 'Volume']),
    weight: findNumber(psets, ['NetWeight', 'GrossWeight', 'Weight', 'Mass']),
  }
}

function mostCommon(values) {
  const counts = new Map()
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = null, bestN = 0
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n }
  return best
}

/**
 * Combine facts for a part made of one or more elements.
 * Fire rating: the weakest member. Load bearing: any member.
 */
export function combineFacts(members) {
  const facts = members.map(elementFacts)
  const fireKnown = facts.map(f => f.fireMinutes).filter(v => v != null)
  const lb = facts.map(f => f.loadBearing).filter(v => v !== undefined)
  const ext = facts.map(f => f.isExternal).filter(v => v !== undefined)
  const u = facts.map(f => f.uValue).filter(v => v != null)
  const ac = facts.map(f => f.acoustic).filter(v => v != null)
  return {
    material: mostCommon(members.map(m => m.materials?.[0])),
    materials: [...new Set(members.flatMap(m => m.materials ?? []))],
    fireMinutes: fireKnown.length === members.length ? Math.min(...fireKnown) : null,
    loadBearing: lb.length ? lb.some(Boolean) : undefined,
    isExternal: ext.length ? ext.some(Boolean) : undefined,
    uValue: u.length ? Math.max(...u) : undefined,
    acoustic: ac.length ? Math.min(...ac) : undefined,
    reference: mostCommon(facts.map(f => f.reference)),
    facts,
  }
}

export function materialByLabel(label) {
  const row = MATERIALS.find(r => r[1] === label)
  if (!row) return null
  const [, name, density, carbon, cost, lambda] = row
  return { name, label: name, density, carbon, cost, lambda }
}

/**
 * Seismic grade (耐震等級 1–3). Read from IFC when a property says so;
 * otherwise estimated from the structural role (indicative only).
 */
export function estimateSeismicGrade(role, psets) {
  for (const key of ['SeismicGrade', 'SeismicGrade_JP', '耐震等級']) {
    const v = Number(findProp(psets, key))
    if (v >= 1 && v <= 3) return { grade: Math.round(v), fromIfc: true }
  }
  return { grade: role === 'primary' || role === 'secondary' ? 2 : 1, fromIfc: false }
}

// What-if structural materials. `equiv` = volume needed vs concrete for a similar
// structural job (steel sections are slim, mass timber is thicker). Indicative only.
const WHAT_IF = {
  Concrete: { color: '#b8bec4', equiv: 1, lead: 21 },
  Steel:    { color: '#7f8c99', equiv: 0.06, lead: 35 },
  Timber:   { color: '#c8a165', equiv: 1.4, lead: 45 },
}
export const SWAPPABLE_CLASSES = new Set(['IfcSlab', 'IfcWall', 'IfcColumn', 'IfcBeam', 'IfcRoof', 'IfcMember'])

/**
 * Extra variants for a structural part: the same element in the other
 * structural materials. Geometry stays the same; only the numbers change.
 */
export function whatIfVariants(base, { volume, baseMaterial, ifcType }) {
  if (!SWAPPABLE_CLASSES.has(ifcType) || !(volume > 0)) return []
  const from = WHAT_IF[baseMaterial] ? baseMaterial : 'Concrete'
  return Object.entries(WHAT_IF)
    .filter(([name]) => name !== from)
    .map(([name, info]) => {
      const m = materialByLabel(name)
      const factor = info.equiv / WHAT_IF[from].equiv
      const v2 = volume * factor
      const weight = Math.round(v2 * m.density)
      const fire = name === 'Timber' && base.fire_resistance_grade === '2hr' ? '1hr' : base.fire_resistance_grade
      return {
        label: `${name} (what-if)`,
        color: info.color,
        meta: `What-if: ${baseMaterial || 'original'} → ${name}. Same element, volume ×${factor.toFixed(2)} (indicative). All values estimated.`,
        weight_kg: weight,
        unit_cost_usd: Math.round(v2 * m.cost),
        labor_cost_usd: Math.round(v2 * m.cost * 0.3),
        carbon_kgco2e: Math.round(weight * m.carbon),
        lead_time_days: info.lead,
        assembly_time_min: base.assembly_time_min,
        seismic_grade: base.seismic_grade,
        fire_resistance_grade: fire,
        load_bearing_kn: null,
        bsl_compliant: null,
        thermal_conductivity_wpmk: m.lambda,
        ifc_entity: base.ifc_entity,
        ifc_property_set: base.ifc_property_set,
        what_if: true,
      }
    })
}
