function ratio(parts, predicate) {
  if (!parts.length) return 0
  return parts.filter(predicate).length / parts.length
}

function fromIfc(part, fact) {
  return new RegExp(`From IFC: [^.]*\\b${fact}\\b`, 'i').test(part.variants?.[0]?.meta ?? '')
}

function level(coverage, strong = 0.8, partial = 0.35) {
  if (coverage >= strong) return 'strong'
  if (coverage >= partial) return 'partial'
  return 'limited'
}

function toolStatus(required) {
  const worst = required.some(v => v < 0.35) ? 'limited'
    : required.some(v => v < 0.8) ? 'indicative'
    : 'ready'
  return worst
}

export function assessModelReadiness(parts = [], source = {}) {
  const geometry = ratio(parts, p => p.shape === 'ifc' && Boolean(p.ifcGeometry))
  const identity = ratio(parts, p => {
    const facts = p.variants?.[0]?.ifc_property_set ?? {}
    return Boolean(facts.GlobalId || facts.ElementCount)
  })
  const storeys = ratio(parts, p => p.fire_compartment && p.fire_compartment !== 'Unassigned')
  const materials = ratio(parts, p => fromIfc(p, 'material'))
  const quantities = ratio(parts, p => fromIfc(p, 'weight') || fromIfc(p, 'volume'))
  const structure = ratio(parts, p => fromIfc(p, 'load bearing'))
  const fire = ratio(parts, p => fromIfc(p, 'fire rating'))
  const envelope = ratio(parts, p => p.is_external !== undefined)

  const checks = [
    { id: 'geometry', label: 'Geometry', coverage: geometry, level: level(geometry, 0.98, 0.8), note: 'Elements with imported IFC geometry' },
    { id: 'identity', label: 'Element identity', coverage: identity, level: level(identity, 0.98, 0.8), note: 'GlobalId or grouped source identity' },
    { id: 'storeys', label: 'Storeys', coverage: storeys, level: level(storeys, 0.8, 0.35), note: 'Elements assigned to an IFC building storey' },
    { id: 'materials', label: 'Materials', coverage: materials, level: level(materials), note: 'Material declared by the IFC' },
    { id: 'quantities', label: 'Weight or volume', coverage: quantities, level: level(quantities), note: 'Physical quantity declared instead of derived' },
    { id: 'structure', label: 'Load-bearing role', coverage: structure, level: level(structure, 0.7, 0.2), note: 'Structural role declared instead of inferred by class' },
    { id: 'fire', label: 'Fire rating', coverage: fire, level: level(fire, 0.65, 0.15), note: 'Rated elements declared by the IFC' },
    { id: 'envelope', label: 'External elements', coverage: envelope, level: level(envelope, 0.65, 0.15), note: 'Inside/outside classification declared by the IFC' },
  ]

  const tools = [
    {
      id: 'earthquake', label: 'Earthquake', status: toolStatus([geometry, storeys, quantities, structure]),
      basis: 'Storeys, mass and structural roles',
      caveat: structure < 0.8 ? 'Some structural roles are inferred from IFC classes.' : 'Structural roles are mostly declared.',
    },
    {
      id: 'wind', label: 'Wind', status: toolStatus([geometry]),
      basis: 'Real exterior mesh and model height',
      caveat: envelope < 0.8 ? 'External classification is incomplete; exposure is resolved from geometry.' : 'External classification supports the mesh exposure test.',
    },
    {
      id: 'rain', label: 'Rain', status: toolStatus([geometry]),
      basis: 'Real surface slopes and obstructions',
      caveat: 'Drain recognition still depends on IFC class or element naming.',
    },
    {
      id: 'fire', label: 'Fire', status: toolStatus([geometry, storeys, fire]),
      basis: 'Storeys, adjacency and fire ratings',
      caveat: fire < 0.65 ? 'Missing ratings fall back to non-rated behavior.' : 'Most relevant ratings are declared.',
    },
    {
      id: 'crane', label: 'Crane', status: toolStatus([geometry, quantities]),
      basis: 'Model extents, part positions and weights',
      caveat: quantities < 0.8 ? 'Some lift weights are estimated from geometry and material density.' : 'Most lift weights use IFC quantities.',
    },
  ]

  return {
    source: {
      schema: source.schema ?? 'Unknown schema',
      coreVersion: source.openBimCoreVersion ?? null,
      digest: source.contentDigest ?? null,
    },
    counts: { parts: parts.length, declaredFacts: checks.filter(c => c.coverage > 0).length, checks: checks.length },
    checks,
    tools,
  }
}
