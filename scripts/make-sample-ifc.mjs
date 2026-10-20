// Writes public/samples/genba-sample-office.ifc: a small 3-storey office used
// by "Try the sample building". Plain IFC4 extrusions with real property sets,
// so every simulation has data (fire ratings, load bearing, materials, U-value,
// acoustic rating, seismic grade). Deterministic: same file on every run.
//
//   npm run sample:ifc
//
// Layout (IFC axes, mm): X east, Y north, Z up. Grid 1-3 at X 0/7200/14400,
// grid A-C at Y 0/6000/12000. Storeys 1F, 2F, 3F at 3600 mm, roof RF.
// Curtain wall on the south (-Y), external steel stair on the east (+X).
// Kept under 120 elements so each element stays its own part in Genba Lab.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = new URL('../public/samples/genba-sample-office.ifc', import.meta.url)

const H = 3600            // storey height
const SLAB = 200          // slab thickness
const COL = 600           // column size
const BEAM_W = 300, BEAM_D = 650
const XS = [0, 7200, 14400]
const YS = [0, 6000, 12000]
const XN = ['1', '2', '3']
const YN = ['A', 'B', 'C']
const EDGE = 450          // slab edge beyond the grid
const WALL_T = 150        // cladding thickness, outside the slab edge
const LEVELS = ['1F', '2F', '3F']

export function buildSampleIfc() {
  // ── STEP writer ─────────────────────────────────────────────
  const lines = []
  let next = 1
  function add(text) {
    const id = next++
    lines.push(`#${id}=${text};`)
    return `#${id}`
  }
  const num = v => {
    const s = Number(v).toFixed(4).replace(/0+$/, '').replace(/\.$/, '.')
    return s.includes('.') ? s : `${s}.`
  }
  const str = s => `'${String(s).replace(/'/g, "''")}'`
  const list = items => `(${items.join(',')})`

  // Deterministic 22-char IFC GlobalIds (mulberry32 PRNG, 6 bits per char).
  const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'
  let seed = 20261020
  function random() {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  function guid() {
    let out = B64[Math.floor(random() * 4)]
    for (let i = 1; i < 22; i++) out += B64[Math.floor(random() * 64)]
    return str(out)
  }

  const pt = (x, y, z) => add(`IFCCARTESIANPOINT(${list([num(x), num(y), num(z)])})`)
  const pt2 = (x, y) => add(`IFCCARTESIANPOINT(${list([num(x), num(y)])})`)
  const dir = (x, y, z) => add(`IFCDIRECTION(${list([num(x), num(y), num(z)])})`)

  // ── Header entities ─────────────────────────────────────────
  const origin = pt(0, 0, 0)
  const zAxis = dir(0, 0, 1)
  const xAxis = dir(1, 0, 0)
  const worldPlacement = add(`IFCAXIS2PLACEMENT3D(${origin},${zAxis},${xAxis})`)
  const context = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${worldPlacement},$)`)
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`)
  const units = add(`IFCUNITASSIGNMENT(${list([
    add('IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)'),
    add('IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)'),
    add('IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)'),
    add('IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)'),
    add('IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)'),
  ])})`)
  const project = add(`IFCPROJECT(${guid()},$,'Genba Sample Office',$,$,'Genba Sample Office',$,(${context}),${units})`)

  const sitePlacement = add(`IFCLOCALPLACEMENT($,${worldPlacement})`)
  const site = add(`IFCSITE(${guid()},$,'Site',$,$,${sitePlacement},$,$,.ELEMENT.,$,$,0.,$,$)`)
  const buildingPlacement = add(`IFCLOCALPLACEMENT(${sitePlacement},${add(`IFCAXIS2PLACEMENT3D(${pt(0, 0, 0)},$,$)`)})`)
  const building = add(`IFCBUILDING(${guid()},$,'Sample Office',$,$,${buildingPlacement},$,$,.ELEMENT.,$,$,$)`)
  add(`IFCRELAGGREGATES(${guid()},$,$,$,${project},(${site}))`)
  add(`IFCRELAGGREGATES(${guid()},$,$,$,${site},(${building}))`)

  const storeyNames = [...LEVELS, 'RF']
  const storeys = storeyNames.map((name, i) => {
    const placement = add(`IFCLOCALPLACEMENT(${buildingPlacement},${add(`IFCAXIS2PLACEMENT3D(${pt(0, 0, i * H)},$,$)`)})`)
    return { name, z: i * H, placement, ref: add(`IFCBUILDINGSTOREY(${guid()},$,${str(name)},$,$,${placement},$,$,.ELEMENT.,${num(i * H)})`), elements: [] }
  })
  add(`IFCRELAGGREGATES(${guid()},$,$,$,${building},${list(storeys.map(s => s.ref))})`)

  // ── Styles, materials, property sets ────────────────────────
  const styleCache = new Map()
  function style(name, [r, g, b]) {
    const key = `${name}|${r},${g},${b}`
    if (styleCache.has(key)) return styleCache.get(key)
    const colour = add(`IFCCOLOURRGB($,${num(r)},${num(g)},${num(b)})`)
    const rendering = add(`IFCSURFACESTYLERENDERING(${colour},0.,$,$,$,$,$,$,.NOTDEFINED.)`)
    const s = add(`IFCSURFACESTYLE(${str(name)},.BOTH.,(${rendering}))`)
    styleCache.set(key, s)
    return s
  }

  const materials = new Map()   // name → { ref, elements: [] }
  function material(name) {
    if (!materials.has(name)) materials.set(name, { ref: add(`IFCMATERIAL(${str(name)},$,$)`), elements: [] })
    return materials.get(name)
  }

  const psetGroups = []          // { name, props, elements }
  function value(v) {
    if (typeof v === 'boolean') return `IFCBOOLEAN(.${v ? 'T' : 'F'}.)`
    if (typeof v === 'number' && Number.isInteger(v)) return `IFCINTEGER(${v})`
    if (typeof v === 'number') return `IFCTHERMALTRANSMITTANCEMEASURE(${num(v)})`
    return `IFCLABEL(${str(v)})`
  }
  function psetFor(name, props) {
    const key = name + JSON.stringify(props)
    let group = psetGroups.find(g => g.key === key)
    if (!group) {
      group = { key, name, props, elements: [] }
      psetGroups.push(group)
    }
    return group
  }

  // Element kinds: IFC class, style colour, material, property sets.
  const KINDS = {
    footing: {
      cls: 'IFCFOOTING', type: '.PAD_FOOTING.', colour: [0.6, 0.62, 0.63], mat: 'Concrete C24',
      psets: [['Pset_FootingCommon', { LoadBearing: true }], ['Pset_JP_Structure', { SeismicGrade: 3 }]],
    },
    slab: {
      cls: 'IFCSLAB', type: '.FLOOR.', colour: [0.74, 0.75, 0.75], mat: 'Concrete C30/37',
      psets: [['Pset_SlabCommon', { LoadBearing: true, FireRating: 'REI 90', IsExternal: false, AcousticRating: 'Rw 55' }], ['Pset_JP_Structure', { SeismicGrade: 2 }]],
    },
    roof: {
      cls: 'IFCSLAB', type: '.ROOF.', colour: [0.56, 0.59, 0.62], mat: 'Concrete C30/37',
      psets: [['Pset_SlabCommon', { LoadBearing: true, FireRating: 'REI 60', IsExternal: true, ThermalTransmittance: 0.24 }], ['Pset_JP_Structure', { SeismicGrade: 2 }]],
    },
    landing: {
      cls: 'IFCSLAB', type: '.LANDING.', colour: [0.42, 0.45, 0.48], mat: 'Steel checker plate',
      psets: [['Pset_SlabCommon', { LoadBearing: true, IsExternal: true }]],
    },
    column: {
      cls: 'IFCCOLUMN', type: '.COLUMN.', colour: [0.66, 0.68, 0.7], mat: 'Concrete C30/37',
      psets: [['Pset_ColumnCommon', { LoadBearing: true, FireRating: 'REI 120', IsExternal: false }], ['Pset_JP_Structure', { SeismicGrade: 3 }]],
    },
    beam: {
      cls: 'IFCBEAM', type: '.BEAM.', colour: [0.85, 0.47, 0.22], mat: 'Steel S355 (fire protected)',
      psets: [['Pset_BeamCommon', { LoadBearing: true, FireRating: 'REI 60', IsExternal: false }], ['Pset_JP_Structure', { SeismicGrade: 2 }]],
    },
    wall: {
      cls: 'IFCWALL', type: '.STANDARD.', colour: [0.89, 0.86, 0.8], mat: 'ALC panel (autoclaved aerated concrete)',
      psets: [['Pset_WallCommon', { LoadBearing: false, IsExternal: true, FireRating: 'EI 60', ThermalTransmittance: 0.35, AcousticRating: 'Rw 50' }]],
    },
    parapet: {
      cls: 'IFCWALL', type: '.PARAPET.', colour: [0.82, 0.8, 0.75], mat: 'ALC panel (autoclaved aerated concrete)',
      psets: [['Pset_WallCommon', { LoadBearing: false, IsExternal: true, FireRating: 'EI 60' }]],
    },
    curtain: {
      cls: 'IFCCURTAINWALL', type: '.NOTDEFINED.', colour: [0.45, 0.66, 0.8], mat: 'Glass, double glazed unit',
      psets: [['Pset_CurtainWallCommon', { IsExternal: true, ThermalTransmittance: 1.8, AcousticRating: 'Rw 35' }]],
    },
    window: {
      cls: 'IFCWINDOW', tail: '$,$,$,.WINDOW.,.NOTDEFINED.,$', colour: [0.55, 0.75, 0.88], mat: 'Aluminium frame, double glazing',
      psets: [['Pset_WindowCommon', { IsExternal: true, ThermalTransmittance: 2.3, AcousticRating: 'Rw 32' }]],
    },
    stair: {
      cls: 'IFCSTAIRFLIGHT', tail: '$,12,11,300.,280.,.STRAIGHT.', colour: [0.3, 0.33, 0.36], mat: 'Steel, galvanised',
      psets: [['Pset_StairFlightCommon', { IsExternal: true }]],
    },
  }

  function attach(el, kind) {
    const k = KINDS[kind]
    material(k.mat).elements.push(el)
    for (const [name, props] of k.psets) psetFor(name, props).elements.push(el)
  }

  function product(kind, name, storey, placement, solid) {
    const k = KINDS[kind]
    add(`IFCSTYLEDITEM(${solid},(${style(k.mat, k.colour)}),$)`)
    const rep = add(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${solid}))`)
    const shape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}))`)
    // Attributes after Representation: Tag, then class-specific ones.
    const tail = k.tail ?? `$,${k.type}`
    const el = add(`${k.cls}(${guid()},$,${str(name)},$,$,${placement},${shape},${tail})`)
    storey.elements.push(el)
    attach(el, kind)
    return el
  }

  // Axis-aligned box from (x0,y0,z0) to (x1,y1,z1), absolute mm.
  function box(kind, name, storey, [x0, y0, z0], [x1, y1, z1]) {
    const placement = add(`IFCLOCALPLACEMENT(${storey.placement},${add(`IFCAXIS2PLACEMENT3D(${pt((x0 + x1) / 2, (y0 + y1) / 2, z0 - storey.z)},$,$)`)})`)
    const profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${add(`IFCAXIS2PLACEMENT2D(${pt2(0, 0)},$)`)},${num(x1 - x0)},${num(y1 - y0)})`)
    const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${add(`IFCAXIS2PLACEMENT3D(${pt(0, 0, 0)},$,$)`)},${zAxis},${num(z1 - z0)})`)
    return product(kind, name, storey, placement, solid)
  }

  // Straight stair flight. Side profile (steps) in the vertical run/up plane,
  // extruded across the stair width. `north` = rises toward +Y.
  function stairFlight(name, storey, { x, y, z, width, north }) {
    const risers = 12, rise = H / risers, going = 280
    const pts = [[0, 0], [0, rise]]
    for (let i = 1; i < risers; i++) pts.push([i * going, i * rise], [i * going, (i + 1) * rise])
    pts.push([risers * going, risers * rise], [risers * going, (risers - 1) * rise], [going * 0.9, 0])
    const polyline = add(`IFCPOLYLINE(${list([...pts, pts[0]].map(([a, b]) => pt2(a, b)))})`)
    const profile = add(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${polyline})`)
    // Profile X = run direction, profile Y = up, extrusion = across the width.
    const position = north
      ? add(`IFCAXIS2PLACEMENT3D(${pt(0, 0, 0)},${dir(1, 0, 0)},${dir(0, 1, 0)})`)
      : add(`IFCAXIS2PLACEMENT3D(${pt(width, 0, 0)},${dir(-1, 0, 0)},${dir(0, -1, 0)})`)
    const solid = add(`IFCEXTRUDEDAREASOLID(${profile},${position},${zAxis},${num(width)})`)
    const placement = add(`IFCLOCALPLACEMENT(${storey.placement},${add(`IFCAXIS2PLACEMENT3D(${pt(x, y, z - storey.z)},$,$)`)})`)
    return product('stair', name, storey, placement, solid)
  }

  // ── Building ────────────────────────────────────────────────
  const xMin = XS[0] - EDGE, xMax = XS[2] + EDGE
  const yMin = YS[0] - EDGE, yMax = YS[2] + EDGE
  const [s1, s2, s3, sR] = storeys
  const roofZ = 3 * H

  // Foundations and ground slab (1F).
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const x = XS[i], y = YS[j]
      box('footing', `Footing ${YN[j]}${XN[i]}`, s1, [x - 1100, y - 1100, -1200], [x + 1100, y + 1100, -SLAB])
    }
  }
  box('slab', '1F Slab', s1, [xMin, yMin, -SLAB], [xMax, yMax, 0])

  LEVELS.forEach((level, li) => {
    const storey = storeys[li]
    const z0 = li * H
    const top = z0 + H - SLAB
    // Upper floor slab (2F, 3F) sits in its own storey; roof slab in RF.
    if (li > 0) box('slab', `${level} Slab`, storey, [xMin, yMin, z0 - SLAB], [xMax, yMax, z0])

    // Columns
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = XS[i], y = YS[j]
        box('column', `${level} Column ${YN[j]}${XN[i]}`, storey, [x - COL / 2, y - COL / 2, z0], [x + COL / 2, y + COL / 2, top])
      }
    }

    // Beams at the top of the storey, under the next floor (2FL, 3FL, RFL).
    const beamLevel = ['2FL', '3FL', 'RFL'][li]
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 2; i++) {
        box('beam', `${beamLevel} Beam ${YN[j]}${XN[i]}-${YN[j]}${XN[i + 1]}`, storey,
          [XS[i] + COL / 2, YS[j] - BEAM_W / 2, top - BEAM_D], [XS[i + 1] - COL / 2, YS[j] + BEAM_W / 2, top])
      }
    }
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        box('beam', `${beamLevel} Beam ${YN[j]}${XN[i]}-${YN[j + 1]}${XN[i]}`, storey,
          [XS[i] - BEAM_W / 2, YS[j] + COL / 2, top - BEAM_D], [XS[i] + BEAM_W / 2, YS[j + 1] - COL / 2, top])
      }
    }

    // Envelope: floor to floor, just outside the slab edge.
    const zb = z0, zt = z0 + H
    box('curtain', `${level} Curtain Wall South`, storey, [xMin, yMin - WALL_T, zb], [xMax, yMin, zt])
    box('wall', `${level} Wall East`, storey, [xMax, yMin - WALL_T, zb], [xMax + WALL_T, yMax + WALL_T, zt])
    box('wall', `${level} Wall West`, storey, [xMin - WALL_T, yMin - WALL_T, zb], [xMin, yMax + WALL_T, zt])
    // North wall around two windows: sill, head and three piers.
    const sill = zb + 900, head = zb + 2600
    const win = [[2400, 5600], [8800, 12000]]
    box('wall', `${level} Wall North Sill`, storey, [xMin, yMax, zb], [xMax, yMax + WALL_T, sill])
    box('wall', `${level} Wall North Head`, storey, [xMin, yMax, head], [xMax, yMax + WALL_T, zt])
    const piers = [[xMin, win[0][0]], [win[0][1], win[1][0]], [win[1][1], xMax]]
    piers.forEach(([a, b], k) => box('wall', `${level} Wall North Pier ${k + 1}`, storey, [a, yMax, sill], [b, yMax + WALL_T, head]))
    win.forEach(([a, b], k) => box('window', `${level} Window N${k + 1}`, storey, [a, yMax + 30, sill], [b, yMax + WALL_T - 30, head]))
  })

  // Roof slab and parapets (RF).
  box('roof', 'Roof Slab', sR, [xMin - WALL_T, yMin - WALL_T, roofZ - SLAB], [xMax + WALL_T, yMax + WALL_T, roofZ])
  box('parapet', 'Parapet South', sR, [xMin - WALL_T, yMin - WALL_T, roofZ], [xMax + WALL_T, yMin, roofZ + 1100])
  box('parapet', 'Parapet North', sR, [xMin - WALL_T, yMax, roofZ], [xMax + WALL_T, yMax + WALL_T, roofZ + 1100])
  box('parapet', 'Parapet East', sR, [xMax, yMin, roofZ], [xMax + WALL_T, yMax, roofZ + 1100])
  box('parapet', 'Parapet West', sR, [xMin - WALL_T, yMin, roofZ], [xMin, yMax, roofZ + 1100])

  // External steel stair on the east side: up north to 2F, then back south to 3F.
  const stairX = xMax + WALL_T + 200, stairW = 1200
  const run = 12 * 280
  stairFlight('Stair 1F-2F', s1, { x: stairX, y: 2000, z: 0, width: stairW, north: true })
  box('landing', 'Landing 2F', s2, [stairX, 2000 + run, H - 200], [stairX + stairW, 2000 + run + 1400, H])
  stairFlight('Stair 2F-3F', s2, { x: stairX, y: 2000 + run + 1400, z: H, width: stairW, north: false })
  box('landing', 'Landing 3F', s3, [stairX, 2000, 2 * H - 200], [stairX + stairW, 3400, 2 * H])

  // ── Relationships ───────────────────────────────────────────
  for (const storey of storeys) {
    if (storey.elements.length) add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid()},$,$,$,${list(storey.elements)},${storey.ref})`)
  }
  for (const [, m] of materials) {
    add(`IFCRELASSOCIATESMATERIAL(${guid()},$,$,$,${list(m.elements)},${m.ref})`)
  }
  for (const group of psetGroups) {
    const props = Object.entries(group.props).map(([k, v]) => add(`IFCPROPERTYSINGLEVALUE(${str(k)},$,${value(v)},$)`))
    const pset = add(`IFCPROPERTYSET(${guid()},$,${str(group.name)},$,${list(props)})`)
    add(`IFCRELDEFINESBYPROPERTIES(${guid()},$,$,$,${list(group.elements)},${pset})`)
  }

  const count = storeys.reduce((n, s) => n + s.elements.length, 0)
  const text = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    "FILE_NAME('genba-sample-office.ifc','2026-10-20T00:00:00',('Genba Lab'),('Genba Lab'),'Genba Lab sample generator','scripts/make-sample-ifc.mjs','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
  return { text, count }
}

// Run directly: write the file. Imported (tests): only build the text.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { text, count } = buildSampleIfc()
  mkdirSync(dirname(fileURLToPath(OUT)), { recursive: true })
  writeFileSync(OUT, text)
  console.log(`Wrote ${fileURLToPath(OUT)}: ${count} elements, ${(text.length / 1024).toFixed(0)} KB`)
}
