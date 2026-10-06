// IFC 2x3 STEP file exporter — hand-rolled (no WASM dependency)
// Produces a valid IFC 2x3 file importable by Revit / ArchiCAD / BIMcollab

let _id = 1
function nextId() { return _id++ }

function fmt(v) {
  if (v == null) return '$'
  if (typeof v === 'boolean') return v ? '.T.' : '.F.'
  if (typeof v === 'number') return v.toFixed(6).replace(/\.?0+$/, '')
  if (typeof v === 'string') {
    // IFC string encoding: wrap in single quotes, escape apostrophes
    return `'${v.replace(/'/g, "''")}'`
  }
  if (Array.isArray(v)) return `(${v.map(fmt).join(',')})`
  return String(v)
}

function entity(id, type, attrs) {
  return `#${id}=${type}(${attrs.map(fmt).join(',')});`
}

export function exportIFC(parts, selectedVariants) {
  _id = 1

  function getVariant(part) {
    const idx = selectedVariants[part.id] ?? 0
    return part.variants[idx]
  }

  const lines = []
  const push = (...args) => args.forEach(l => lines.push(l))

  // ── Schema entities ──────────────────────────────────────────
  const idProject       = nextId() // 1
  const idSite          = nextId() // 2
  const idBuilding      = nextId() // 3
  const idStorey        = nextId() // 4
  const idUnitAssign    = nextId() // 5
  const idContext       = nextId() // 6
  const idGeomContext   = nextId() // 7
  const idGeomContext2D = nextId() // 8
  const idOwnerHistory  = nextId() // 9
  const idOrg          = nextId()  // 10
  const idPerson        = nextId() // 11
  const idPersonOrg     = nextId() // 12
  const idApp           = nextId() // 13

  // ── Part entities ──
  const partEntities = parts.map(part => {
    const v = getVariant(part)
    const [px, py, pz] = part.pos
    // IFC uses mm; Three.js uses meters
    const [sx, sy, sz] = part.size.map(d => d * 1000)
    // IFC Y-up: Three.js Y is height
    // IfcExtrudedAreaSolid extrudes along Z, so we remap: width=X, depth=Z, height=Y
    const ifcEntity = v.ifc_entity ?? 'IfcBuildingElementProxy'

    const ids = {
      placement: nextId(),
      axis2placement: nextId(),
      cartesianPoint: nextId(),
      xDir: nextId(),
      zDir: nextId(),
      shape: nextId(),
      shapeRep: nextId(),
      profile: nextId(),
      profilePlacement: nextId(),
      profileOrigin: nextId(),
      extrudeSolid: nextId(),
      extrudeDir: nextId(),
      extrudePlacement: nextId(),
      extrudeOrigin: nextId(),
      product: nextId(),
      productDefinition: nextId(),
      propertySet: nextId(),
      relDefines: nextId(),
      relContained: nextId(),
      // properties
      propWeight: nextId(),
      propCost: nextId(),
      propCarbon: nextId(),
      propSupplier: nextId(),
      propSku: nextId(),
      propSeismic: nextId(),
      propBSL: nextId(),
      propJIS: nextId(),
      propDfma: nextId(),
    }
    return { part, v, ids, sx, sy, sz, px: px * 1000, py: py * 1000, pz: pz * 1000, ifcEntity }
  })

  // ── Write STEP header ──────────────────────────────────────
  const header = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('Genba Lab IFC Export','ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME('genba-lab.ifc','${new Date().toISOString()}',('Genba Lab'),('Anthropic'),'web-browser','Genba Lab 1.0','');`,
    `FILE_SCHEMA(('IFC2X3'));`,
    'ENDSEC;',
    'DATA;',
  ]

  // ── Core project entities ──────────────────────────────────
  push(
    entity(idPerson,    'IFCPERSON',    ['$', fmt('IC'), fmt('Configurator'), '$', '$', '$', '$', '$']),
    entity(idOrg,       'IFCORGANIZATION', ['$', fmt('Genba Lab'), '$', '$', '$']),
    entity(idPersonOrg, 'IFCPERSONANDORGANIZATION', [`#${idPerson}`, `#${idOrg}`, '$']),
    entity(idApp,       'IFCAPPLICATION', [`#${idOrg}`, fmt('1.0'), fmt('Genba Lab'), fmt('GENBA-LAB')]),
    entity(idOwnerHistory, 'IFCOWNERHISTORY', [
      `#${idPersonOrg}`, `#${idApp}`, '$', '.NOCHANGE.', '$', '$', '$',
      String(Math.floor(Date.now() / 1000))
    ]),

    entity(idUnitAssign, 'IFCUNITASSIGNMENT', [
      `(#${nextId()},#${nextId()},#${nextId()},#${nextId()})`
    ]),
  )

  // Rewind — emit the unit entities that were pre-referenced above
  const unitBase = _id - 4
  const units = [
    entity(unitBase,     'IFCSIUNIT', ['$', '.LENGTHUNIT.', '.MILLI.', '.METRE.']),
    entity(unitBase + 1, 'IFCSIUNIT', ['$', '.AREAUNIT.', '$', '.SQUARE_METRE.']),
    entity(unitBase + 2, 'IFCSIUNIT', ['$', '.VOLUMEUNIT.', '$', '.CUBIC_METRE.']),
    entity(unitBase + 3, 'IFCSIUNIT', ['$', '.MASSUNIT.', '.KILO.', '.GRAM.']),
  ]
  // We need to insert these before idUnitAssign — easier to just pre-allocate
  // Let's rebuild using a cleaner approach

  // Restart with proper ordering
  _id = 1
  const entities = []
  const E = (type, attrs) => {
    const id = nextId()
    entities.push(`#${id}=${type}(${attrs});`)
    return id
  }
  const R = (id) => `#${id}` // reference

  // Units
  const uLength  = E('IFCSIUNIT',        `$,.LENGTHUNIT.,.MILLI.,.METRE.`)
  const uArea    = E('IFCSIUNIT',        `$,.AREAUNIT.,$,.SQUARE_METRE.`)
  const uVolume  = E('IFCSIUNIT',        `$,.VOLUMEUNIT.,$,.CUBIC_METRE.`)
  const uMass    = E('IFCSIUNIT',        `$,.MASSUNIT.,.KILO.,.GRAM.`)
  const unitAsgn = E('IFCUNITASSIGNMENT',`(${R(uLength)},${R(uArea)},${R(uVolume)},${R(uMass)})`)

  // Owner
  const person    = E('IFCPERSON',       `$,'IC','Configurator',$,$,$,$,$`)
  const org       = E('IFCORGANIZATION', `$,'Genba Lab',$,$,$`)
  const personOrg = E('IFCPERSONANDORGANIZATION', `${R(person)},${R(org)},$`)
  const app       = E('IFCAPPLICATION',  `${R(org)},'1.0','Genba Lab','GENBA-LAB'`)
  const ownerHist = E('IFCOWNERHISTORY', `${R(personOrg)},${R(app)},$,.NOCHANGE.,$,$,$,${Math.floor(Date.now() / 1000)}`)

  // Geometry contexts
  const gCtxOrigin = E('IFCCARTESIANPOINT', `(0.,0.,0.)`)
  const gCtxZ      = E('IFCDIRECTION',      `(0.,0.,1.)`)
  const gCtxX      = E('IFCDIRECTION',      `(1.,0.,0.)`)
  const gCtxAx2    = E('IFCAXIS2PLACEMENT3D', `${R(gCtxOrigin)},${R(gCtxZ)},${R(gCtxX)}`)
  const gCtx       = E('IFCGEOMETRICREPRESENTATIONCONTEXT', `$,'Model',3,1.0E-5,${R(gCtxAx2)},$`)
  const gCtx2D     = E('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', `'Body','Model',*,*,*,*,${R(gCtx)},$,.MODEL_VIEW.,$`)

  // Project
  const projId = E('IFCPROJECT', `'${guid()}',${R(ownerHist)},'IC Kit',$,$,$,$,(${R(gCtx)},${R(gCtx2D)}),${R(unitAsgn)}`)

  // Site → Building → Storey
  const siteOrigin = E('IFCCARTESIANPOINT', `(0.,0.,0.)`)
  const siteZ      = E('IFCDIRECTION',      `(0.,0.,1.)`)
  const siteX      = E('IFCDIRECTION',      `(1.,0.,0.)`)
  const siteAx2    = E('IFCAXIS2PLACEMENT3D', `${R(siteOrigin)},${R(siteZ)},${R(siteX)}`)
  const siteLoc    = E('IFCLOCALPLACEMENT',   `$,${R(siteAx2)}`)
  const siteId     = E('IFCSITE',     `'${guid()}',${R(ownerHist)},'Site',$,$,${R(siteLoc)},$,$,.ELEMENT.,$,$,$,$,$`)

  const bldgLoc  = E('IFCLOCALPLACEMENT', `${R(siteLoc)},${R(siteAx2)}`)
  const bldgId   = E('IFCBUILDING', `'${guid()}',${R(ownerHist)},'Building',$,$,${R(bldgLoc)},$,$,.ELEMENT.,$,$,$`)

  const storeyOrigin = E('IFCCARTESIANPOINT', `(0.,0.,0.)`)
  const storeyAx2    = E('IFCAXIS2PLACEMENT3D', `${R(storeyOrigin)},$,$`)
  const storeyLoc    = E('IFCLOCALPLACEMENT', `${R(bldgLoc)},${R(storeyAx2)}`)
  const storeyId     = E('IFCBUILDINGSTOREY', `'${guid()}',${R(ownerHist)},'Ground Floor',$,$,${R(storeyLoc)},$,$,.ELEMENT.,0.`)

  // Hierarchy
  E('IFCRELAGGREGATES', `'${guid()}',${R(ownerHist)},$,$,${R(projId)},(${R(siteId)})`)
  E('IFCRELAGGREGATES', `'${guid()}',${R(ownerHist)},$,$,${R(siteId)},(${R(bldgId)})`)
  E('IFCRELAGGREGATES', `'${guid()}',${R(ownerHist)},$,$,${R(bldgId)},(${R(storeyId)})`)

  // ── Parts ───────────────────────────────────────────────────
  const productIds = []

  parts.forEach(part => {
    const v = getVariant(part)
    const [px, py, pz] = part.pos.map(d => d * 1000)
    const [sw, sh, sd] = part.size.map(d => d * 1000)
    const ifcType = v.ifc_entity ?? 'IFCBUILDINGELEMENTPROXY'

    // Local placement
    const ptOrigin = E('IFCCARTESIANPOINT',     `(${px.toFixed(1)},${pz.toFixed(1)},${py.toFixed(1)})`)
    const ptZ      = E('IFCDIRECTION',           `(0.,0.,1.)`)
    const ptX      = E('IFCDIRECTION',           `(1.,0.,0.)`)
    const ax2      = E('IFCAXIS2PLACEMENT3D',    `${R(ptOrigin)},${R(ptZ)},${R(ptX)}`)
    const loc      = E('IFCLOCALPLACEMENT',      `${R(storeyLoc)},${R(ax2)}`)

    // Box geometry via IfcExtrudedAreaSolid
    const profOrigin = E('IFCCARTESIANPOINT',     `(${(-sw/2).toFixed(1)},${(-sd/2).toFixed(1)})`)
    const profAx2    = E('IFCAXIS2PLACEMENT2D',   `${R(profOrigin)},$`)
    const profile    = E('IFCRECTANGLEPROFILEDEF',`.AREA.,$,${R(profAx2)},${sw.toFixed(1)},${sd.toFixed(1)}`)

    const extOrigin  = E('IFCCARTESIANPOINT',     `(0.,0.,0.)`)
    const extAx2     = E('IFCAXIS2PLACEMENT3D',   `${R(extOrigin)},$,$`)
    const extDir     = E('IFCDIRECTION',           `(0.,0.,1.)`)
    const solid      = E('IFCEXTRUDEDAREASOLID',  `${R(profile)},${R(extAx2)},${R(extDir)},${sh.toFixed(1)}`)

    const shapeRep   = E('IFCSHAPEREPRESENTATION',`${R(gCtx2D)},'Body','SweptSolid',(${R(solid)})`)
    const prodDef    = E('IFCPRODUCTDEFINITIONSHAPE', `$,$,(${R(shapeRep)})`)

    // The product itself
    const safeType = ifcType.toUpperCase().replace(/^IFC/, '')
    let productId
    if (safeType === 'IFCSLAB' || ifcType === 'IfcSlab') {
      productId = E('IFCSLAB', `'${guid()}',${R(ownerHist)},'${esc(part.id)}','${esc(v.label)}',$,${R(loc)},${R(prodDef)},$,.NOTDEFINED.`)
    } else if (safeType === 'IFCCURTAINWALL' || ifcType === 'IfcCurtainWall') {
      productId = E('IFCCURTAINWALL', `'${guid()}',${R(ownerHist)},'${esc(part.id)}','${esc(v.label)}',$,${R(loc)},${R(prodDef)},$`)
    } else {
      productId = E('IFCBUILDINGELEMENTPROXY', `'${guid()}',${R(ownerHist)},'${esc(part.id)}','${esc(v.label)}',$,${R(loc)},${R(prodDef)},$,.NOTDEFINED.`)
    }

    productIds.push(productId)

    // DfMA Property Set
    const props = []
    props.push(E('IFCPROPERTYSINGLEVALUE', `'Weight_kg',$,IFCMASSMEASURE(${v.weight_kg.toFixed(1)}),$`))
    props.push(E('IFCPROPERTYSINGLEVALUE', `'MaterialCost_USD',$,IFCREAL(${v.unit_cost_usd.toFixed(2)}),$`))
    props.push(E('IFCPROPERTYSINGLEVALUE', `'Carbon_kgCO2e',$,IFCREAL(${v.carbon_kgco2e.toFixed(2)}),$`))
    if (v.supplier) props.push(E('IFCPROPERTYSINGLEVALUE', `'Supplier',$,IFCLABEL('${esc(v.supplier)}'),$`))
    if (v.sku)      props.push(E('IFCPROPERTYSINGLEVALUE', `'SKU',$,IFCLABEL('${esc(v.sku)}'),$`))
    if (v.seismic_grade != null) props.push(E('IFCPROPERTYSINGLEVALUE', `'SeismicGrade_JP',$,IFCINTEGER(${v.seismic_grade}),$`))
    if (v.bsl_compliant != null) props.push(E('IFCPROPERTYSINGLEVALUE', `'BSL_Compliant',$,IFCBOOLEAN(.${v.bsl_compliant ? 'T' : 'F'}.),$`))
    if (v.dfma_notes) props.push(E('IFCPROPERTYSINGLEVALUE', `'DFMA_Notes',$,IFCTEXT('${esc(v.dfma_notes)}'),$`))
    if (v.jis_standards?.length) props.push(E('IFCPROPERTYSINGLEVALUE', `'JIS_Standards',$,IFCLABEL('${esc(v.jis_standards.join('; '))}'),$`))

    const pset = E('IFCPROPERTYSET', `'${guid()}',${R(ownerHist)},'Pset_IC_DfMA',$,(${props.map(R).join(',')})`)
    E('IFCRELDEFINESBYPROPERTIES', `'${guid()}',${R(ownerHist)},$,$,(${R(productId)}),${R(pset)}`)
  })

  // Contain all products in storey
  if (productIds.length > 0) {
    E('IFCRELCONTAINEDINSPATIALSTRUCTURE',
      `'${guid()}',${R(ownerHist)},'Products','Products in Storey',(${productIds.map(R).join(',')}),${R(storeyId)}`
    )
  }

  // ── Build STEP file string ───────────────────────────────────
  const stepHeader = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('Genba Lab IFC 2x3 Export'),'2;1');`,
    `FILE_NAME('genba-lab.ifc','${new Date().toISOString()}',('Genba Lab'),('genba-lab'),'jsPDF','Genba Lab 1.0','');`,
    `FILE_SCHEMA(('IFC2X3'));`,
    'ENDSEC;',
    'DATA;',
    ...entities,
    'ENDSEC;',
    'END-ISO-10303-21;',
  ]

  const content = stepHeader.join('\n')
  const blob = new Blob([content], { type: 'application/x-step' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = 'genba-lab.ifc'
  a.click()
  URL.revokeObjectURL(url)
}

function guid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  }).toUpperCase().replace(/-/g, '').slice(0, 22)
}

function esc(s) {
  return String(s ?? '').replace(/'/g, "''").replace(/\\/g, '\\\\')
}
