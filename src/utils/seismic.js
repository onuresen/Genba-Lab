// Indicative earthquake checks shared by EarthquakePanel, the 3D markers and
// the result banner. Grade = 耐震等級 1–3. A part is "critical" above
// grade × 3 (Richter) and "caution" above grade × 2.2. Not an engineering check.

export const RICHTER_LABELS = { 3: 'Minor', 4: 'Light', 5: 'Moderate', 6: 'Strong', 7: 'Major', 8: 'Great', 9: 'Catastrophic' }

export function gradeOf(part, selectedVariants) {
  return part.variants[selectedVariants?.[part.id] ?? 0]?.seismic_grade ?? 1
}

// The structure the verdict is about. IFC imports give windows, doors and
// coverings no structural role: they used to count as primary, so almost every
// model "failed" at any magnitude above 3.
export function seismicParts(parts) {
  const primary = parts.filter(p => p.structural_role === 'primary')
  if (primary.length) return primary
  const structural = parts.filter(p => p.structural_role === 'secondary')
  return structural.length ? structural : parts
}

export function getVerdict(magnitude, parts, selectedVariants) {
  if (!parts.length) return null
  const atRisk = parts.filter(p => magnitude > gradeOf(p, selectedVariants) * 3)
  const caution = parts.filter(p => {
    const grade = gradeOf(p, selectedVariants)
    return magnitude > grade * 2.2 && magnitude <= grade * 3
  })
  if (atRisk.length > 0) return { level: 'critical', label: 'CRITICAL FAILURE', color: '#e74c3c', parts: atRisk }
  if (caution.length > 0) return { level: 'caution', label: 'AT RISK', color: '#f39c12', parts: caution }
  return { level: 'safe', label: 'STRUCTURE SURVIVED', color: '#27ae60', parts: [] }
}

export function getSeismicScore(magnitude, parts, selectedVariants) {
  if (!parts.length) return 100
  const total = parts.reduce((sum, part) => {
    const grade = gradeOf(part, selectedVariants)
    const hasBaseIso = (part.connections ?? []).some(c => c.type === 'base-isolation')
    const capacity = grade * 3 + (hasBaseIso ? 1.1 : 0)
    const margin = capacity - magnitude
    let partScore
    if (margin < 0) {
      partScore = Math.max(18, 52 + margin * 12)
    } else if (magnitude > grade * 2.2) {
      partScore = Math.min(78, 62 + margin * 8)
    } else {
      partScore = Math.min(100, 84 + margin * 5)
    }
    return sum + partScore
  }, 0)
  return Math.round(total / parts.length)
}
