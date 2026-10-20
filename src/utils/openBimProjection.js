// Genba-owned projection from the lossless OpenBIM Core result to the existing
// simulation kit input. Performance filtering, geometry merging and the flat
// property view belong here rather than in the shared IFC parser.

const SKIP_TYPES = new Set([
  'IFCOPENINGELEMENT', 'IFCSPACE', 'IFCSITE', 'IFCANNOTATION',
  'IFCGRID', 'IFCVIRTUALELEMENT', 'IFCOPENINGSTANDARDCASE',
])

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

function readableType(typeName) {
  if (TYPE_NAMES[typeName]) return TYPE_NAMES[typeName]
  const rest = String(typeName).replace(/^IFC/, '').toLowerCase()
  return `Ifc${rest.charAt(0).toUpperCase()}${rest.slice(1)}`
}

function flattenPropertySets(propertySets) {
  const result = {}
  const ordered = [...propertySets].sort((left, right) => {
    const ownership = value => value === 'type' ? 0 : 1
    return ownership(left.ownership) - ownership(right.ownership)
  })
  for (const set of ordered) {
    const values = Object.fromEntries(set.values.map(property => [property.name, property.value]))
    result[set.name] = { ...(result[set.name] || {}), ...values }
  }
  return result
}

// Preallocated typed arrays: `push(...packet.positions)` overflowed the call
// stack on big Revit elements (hundreds of thousands of floats per packet).
function mergeGeometry(packets) {
  let nPos = 0, nIdx = 0
  for (const packet of packets) { nPos += packet.positions.length; nIdx += packet.indices.length }
  const positions = new Float32Array(nPos)
  const normals = new Float32Array(nPos)
  const indices = new Uint32Array(nIdx)
  let colour = '#b0b0b0'
  let largestTriangleCount = -1
  let p = 0, q = 0
  for (const packet of packets) {
    const offset = p / 3
    positions.set(packet.positions, p)
    normals.set(packet.normals, p)
    for (let i = 0; i < packet.indices.length; i++) indices[q + i] = packet.indices[i] + offset
    p += packet.positions.length
    q += packet.indices.length
    const triangleCount = packet.indices.length / 3
    if (triangleCount > largestTriangleCount) {
      largestTriangleCount = triangleCount
      colour = packet.colour
    }
  }
  return { color: colour, positions, normals, indices }
}

export function projectOpenBimResultToGenba(result) {
  if (result?.schemaVersion !== 'openbim-kernel-result-v1') {
    throw new Error('Unsupported OpenBIM Core result')
  }
  const entitiesByKey = new Map(result.entities.map(entity => [entity.sourceKey, entity]))
  const packetsById = new Map(result.geometryPackets.map(packet => [packet.packetId, packet]))
  const storeyByEntity = new Map()

  for (const relationship of result.relationships) {
    if (relationship.ifcTypeName !== 'IFCRELCONTAINEDINSPATIALSTRUCTURE') continue
    const structureEndpoint = relationship.relating.find(endpoint => endpoint.role === 'RelatingStructure')
    const structure = structureEndpoint ? entitiesByKey.get(structureEndpoint.sourceKey) : null
    if (structure?.ifcTypeName !== 'IFCBUILDINGSTOREY') continue
    const storey = { id: structure.expressId, name: structure.name || `Storey ${structure.expressId}` }
    for (const endpoint of relationship.related.filter(item => item.role === 'RelatedElements')) {
      storeyByEntity.set(endpoint.sourceKey, storey)
    }
  }

  const elements = []
  for (const entity of result.entities) {
    if (SKIP_TYPES.has(entity.ifcTypeName)) continue
    const packets = entity.geometryPacketIds.map(id => packetsById.get(id)).filter(Boolean)
    if (!packets.length) continue
    const geometry = mergeGeometry(packets)
    elements.push({
      expressID: entity.expressId,
      ifcType: readableType(entity.ifcTypeName),
      name: entity.name || '',
      globalId: entity.globalId || '',
      storey: storeyByEntity.get(entity.sourceKey) || null,
      color: geometry.color,
      psets: flattenPropertySets(entity.propertySets),
      materials: entity.materials.map(material => material.name),
      positions: geometry.positions,
      normals: geometry.normals,
      indices: geometry.indices,
    })
  }

  const project = result.entities.find(entity => entity.ifcTypeName === 'IFCPROJECT')
  return {
    projectName: project?.longName || project?.name || '',
    schema: result.source.ifcSchema,
    elements,
    openBim: {
      coreVersion: result.kernel.version,
      contentDigest: result.source.contentDigest,
      sourceEntityCount: result.entities.length,
      nativeRelationshipCount: result.relationships.length,
    },
  }
}
