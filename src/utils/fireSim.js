// Fire spread by fire rating, one tick per second. Indicative only.
// Status per part: 'ok' (default) | 'burning' | 'failed' | 'out' (put out;
// never re-ignites). 2hr parts never catch fire from a neighbour; one set on
// fire directly holds, and its fire burns out.
// Spread was every connection every second; one neighbour per tick, with
// longer delays, leaves time to fight the fire.

// Seconds after ignition: when a part starts spreading, and when it fails.
const SPREAD_AFTER = { 'non-rated': 2.5, '1hr': 6 }
const FAIL_AFTER = { 'non-rated': 9, '1hr': 22 }
const RATED_BURNS_OUT = 12

export function fireGradeOf(part, selectedVariants) {
  return part.variants[selectedVariants?.[part.id] ?? 0]?.fire_resistance_grade ?? 'non-rated'
}

// intensity 10–100 (%): higher = faster. 65% ≈ 0.9× the base times.
export function intensityFactor(intensity) {
  return 1.35 - (intensity / 100) * 0.7
}

/**
 * One second of fire.
 * @param state      { [partId]: status }
 * @param burnStart  { [partId]: ms } — when each part caught fire (mutated for new fires)
 * @returns the next state (same object when nothing changed)
 */
export function spreadFire({ parts, state, burnStart, selectedVariants, intensity, now, tick }) {
  const byId = new Map(parts.map(p => [p.id, p]))
  const k = intensityFactor(intensity)
  let next = state
  const set = (id, status) => {
    if (next === state) next = { ...state }
    next[id] = status
  }
  for (const part of parts) {
    if (state[part.id] !== 'burning') continue
    const grade = fireGradeOf(part, selectedVariants)
    const burnSecs = (now - (burnStart[part.id] ?? now)) / 1000
    if (grade === '2hr') {
      if (burnSecs >= RATED_BURNS_OUT * k) set(part.id, 'out')
      continue
    }
    if (burnSecs >= FAIL_AFTER[grade] * k) { set(part.id, 'failed'); continue }
    if (burnSecs < SPREAD_AFTER[grade] * k) continue
    // Neighbours that can still catch fire; take one, rotating each tick.
    const open = (part.connections ?? [])
      .map(c => byId.get(c.to))
      .filter(n => n && (next[n.id] ?? 'ok') === 'ok' && fireGradeOf(n, selectedVariants) !== '2hr')
    if (!open.length) continue
    const target = open[(tick + part.sequence) % open.length]
    set(target.id, 'burning')
    burnStart[target.id] = now
  }
  return next
}

export function countFire(state) {
  const counts = { burning: 0, failed: 0, out: 0 }
  for (const status of Object.values(state)) if (counts[status] != null) counts[status]++
  return counts
}

// Summary once nothing burns any more (null while a fire is still going).
export function fireRoundResult(state, totalParts, elapsed) {
  const { burning, failed, out } = countFire(state)
  if (burning > 0 || failed + out === 0) return null
  const lostPct = Math.round((failed / Math.max(1, totalParts)) * 100)
  const tone = lostPct <= 5 ? 'win' : lostPct <= 20 ? 'warn' : 'fail'
  const title = tone === 'win' ? 'Fire out! Building saved' : tone === 'warn' ? 'Fire out' : 'Fire out, heavy damage'
  return {
    tone,
    lostPct,
    title,
    subtitle: `${elapsed} s · ${out} put out · ${failed} lost (${lostPct}% of parts)`,
  }
}
