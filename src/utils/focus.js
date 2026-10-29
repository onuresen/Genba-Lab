// Focus on a selected part: the part, its direct neighbours (connections in
// either direction), and a box to frame them. Everything else is ghosted.

export function focusContext(parts, id) {
  if (!id || !parts?.length) return null
  const subject = parts.find(p => p.id === id)
  if (!subject) return null
  const context = new Set((subject.connections ?? []).map(c => c.to))
  for (const p of parts) {
    if (p.id !== id && (p.connections ?? []).some(c => c.to === id)) context.add(p.id)
  }
  context.delete(id)
  for (const cid of context) if (!parts.some(p => p.id === cid)) context.delete(cid)
  return { subject: id, context }
}

export function focusRole(focus, id) {
  if (!focus) return null
  if (focus.subject === id) return 'subject'
  return focus.context.has(id) ? 'context' : 'ghost'
}

// Box around the subject and its visible neighbours. `exploded` uses the
// exploded positions, so the camera frames what is on screen.
export function focusBounds(parts, focus, { visible, exploded = false } = {}) {
  if (!focus) return null
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const p of parts ?? []) {
    const inFocus = p.id === focus.subject || (focus.context.has(p.id) && visible?.[p.id] !== false)
    if (!inFocus) continue
    const c = exploded && p.exp ? p.exp : p.pos
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], c[k] - p.size[k] / 2)
      max[k] = Math.max(max[k], c[k] + p.size[k] / 2)
    }
  }
  if (!Number.isFinite(min[0])) return null
  return {
    pos: min.map((v, k) => (v + max[k]) / 2),
    size: min.map((v, k) => Math.max(0.1, max[k] - v)),
  }
}
