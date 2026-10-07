// Earthquake response of the model as a shear building. Pure logic (no React), tested in Node.
//
// 1. Storeys come from the IFC storeys (part.fire_compartment), merged if under 2 m apart.
// 2. Part weights are lumped at the floor levels.
// 3. Stiffness gives the BSL period T = H (0.02 + 0.01 α), α = steel/timber share.
//    耐震等級 2 / 3 make the frame 1.25× / 1.5× stiffer.
// 4. A synthetic ground motion, scaled to the chosen PGA, shakes the base (Newmark-β).
// 5. Storey drift ratio (層間変形角) tells the damage.
// 6. If the demand passes the yield strength, drift grows (equal energy rule for short periods).
// Indicative: linear response + yield correction, no torsion, no soil.

export const G = 9.81
export const MIN_STOREY = 2 // m
export const MAX_LEVELS = 24 // incl. the base level (shader array size)
export const SYSTEMS = {
  standard: { label: '耐震 Standard', short: 'Standard' },
  damped:   { label: '制振 Dampers', short: 'Dampers' },
  isolated: { label: '免震 Isolated', short: 'Isolated' },
}
export const MOTIONS = {
  near: { label: 'Near fault', duration: 16, fg: 1.4, zg: 0.6, rise: 1.5, strong: 4, decay: 0.35, pulse: { t: 3.5, period: 1.0, share: 0.6 } },
  far:  { label: 'Long and far', duration: 26, fg: 0.6, zg: 0.4, rise: 5, strong: 10, decay: 0.15, pulse: null },
}
const GRADE_STIFFNESS = { 1: 1, 2: 1.25, 3: 1.5 }
const ISO_PERIOD = 3.5    // s
const ISO_DAMPING = 0.2
export const ISO_CLEARANCE_CM = 60 // typical moat gap around an isolated building
// Yield strength as a base shear coefficient (≈ Ds at 耐震等級 1): RC 0.35, steel / timber 0.3.
function yieldCoef(alpha, grade) { return (0.35 - 0.05 * alpha) * (GRADE_STIFFNESS[grade] ?? 1) }

/** Damage level by storey drift ratio (rad). */
export const DRIFT_LEVELS = [
  { max: 1 / 200, key: 'ok', label: 'No damage', color: '#27ae60' },
  { max: 1 / 100, key: 'minor', label: 'Minor cracks', color: '#a3c639' },
  { max: 1 / 50, key: 'damage', label: 'Damage', color: '#f39c12' },
  { max: 1 / 30, key: 'severe', label: 'Severe damage', color: '#e67e22' },
  { max: Infinity, key: 'collapse', label: 'Collapse risk', color: '#e74c3c' },
]
export function driftLevel(ratio) {
  return DRIFT_LEVELS.find(l => ratio <= l.max)
}

/** Rough JMA intensity (震度) for a PGA in g. */
export function jmaIntensity(pga) {
  if (pga < 0.08) return '4 or less'
  if (pga < 0.15) return '5弱'
  if (pga < 0.25) return '5強'
  if (pga < 0.4) return '6弱'
  if (pga < 0.6) return '6強'
  return '7'
}

// ── Building model ─────────────────────────────────────────

function activeVariant(p, selectedVariants) {
  return p.variants?.[selectedVariants?.[p.id] ?? 0] ?? p.variants?.[0] ?? {}
}

/**
 * Shear-building model of the visible parts.
 * @returns { levels: [z0..zn], storeys: [{ name, z0, z1, h }], mass: [kg per level 1..n],
 *            baseMass, totalMass, height, alpha, grade, period } | null
 */
export function buildStoreyModel(parts, selectedVariants = {}, visible = null) {
  const ps = parts.filter(p => !visible || visible[p.id])
  if (!ps.length) return null
  const bottom = p => p.pos[1] - p.size[1] / 2
  const top = p => p.pos[1] + p.size[1] / 2
  const ground = Math.min(...ps.map(bottom))
  const H = Math.max(...ps.map(top))
  if (H - ground < 0.5) return null

  // Storey bases from IFC storeys.
  const bases = new Map()
  for (const p of ps) {
    const key = p.fire_compartment ?? 'Building'
    bases.set(key, Math.min(bases.get(key) ?? Infinity, bottom(p)))
  }
  const sorted = [...bases.entries()].sort((a, b) => a[1] - b[1])
  const levels = [ground]
  const names = [sorted[0]?.[0] ?? 'Storey 1']
  for (const [name, z] of sorted) {
    if (z - levels[levels.length - 1] < MIN_STOREY) continue
    levels.push(z)
    names.push(name)
  }
  if (H - levels[levels.length - 1] < MIN_STOREY && levels.length > 1) { levels.pop(); names.pop() }
  levels.push(H)
  // Too many storeys for the shader: resample evenly.
  if (levels.length > MAX_LEVELS) {
    const n = MAX_LEVELS - 1
    const pick = Array.from({ length: n }, (_, i) => Math.round((i * (levels.length - 2)) / (n - 1)))
    const lv = pick.map(i => levels[i])
    const nm = pick.map(i => names[i])
    levels.length = 0; names.length = 0
    levels.push(...lv, H); names.push(...nm)
  }
  const n = levels.length - 1
  const storeys = Array.from({ length: n }, (_, i) => ({ name: names[i] ?? `Storey ${i + 1}`, z0: levels[i], z1: levels[i + 1], h: levels[i + 1] - levels[i] }))

  // Lump each part's weight at the two levels around its centre.
  const at = new Array(n + 1).fill(0)
  let total = 0, structural = 0, light = 0
  const grades = []
  for (const p of ps) {
    const v = activeVariant(p, selectedVariants)
    const m = v.weight_kg ?? 0
    total += m
    const c = (bottom(p) + top(p)) / 2
    let i = storeys.findIndex(s => c <= s.z1)
    if (i < 0) i = n - 1
    const t = Math.min(1, Math.max(0, (c - storeys[i].z0) / storeys[i].h))
    at[i] += m * (1 - t)
    at[i + 1] += m * t
    if (p.structural_role === 'primary') {
      structural += m
      if (/steel|timber|wood|clt/i.test(v.material_class ?? v.label ?? '')) light += m
      grades.push(v.seismic_grade ?? 1)
    }
  }
  if (total <= 0) return null
  const floor = total * 0.01 / n
  const mass = at.slice(1).map(m => Math.max(m, floor))
  const alpha = structural > 0 ? light / structural : 0
  const grade = grades.length ? Math.min(...grades) : 1
  const height = H - ground
  return {
    ground, levels, storeys, mass, baseMass: Math.max(at[0], total * 0.1), totalMass: total,
    height, alpha, grade, period: height * (0.02 + 0.01 * alpha),
  }
}

// ── Small dense linear algebra (n ≤ 25) ────────────────────

function zeros(n) { return Array.from({ length: n }, () => new Float64Array(n)) }

function invert(A) {
  const n = A.length
  const M = A.map((row, i) => { const r = new Float64Array(2 * n); r.set(row); r[n + i] = 1; return r })
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    ;[M[c], M[piv]] = [M[piv], M[c]]
    const d = M[c][c]
    for (let k = 0; k < 2 * n; k++) M[c][k] /= d
    for (let r = 0; r < n; r++) {
      if (r === c || M[r][c] === 0) continue
      const f = M[r][c]
      for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map(r => r.slice(n))
}

function mulVec(A, x) {
  const y = new Float64Array(A.length)
  for (let i = 0; i < A.length; i++) { let s = 0; for (let j = 0; j < x.length; j++) s += A[i][j] * x[j]; y[i] = s }
  return y
}

// Fundamental circular frequency (inverse iteration).
function firstOmega(K, mDiag) {
  const Kinv = invert(K)
  let x = new Float64Array(K.length).fill(1)
  for (let it = 0; it < 60; it++) {
    const y = mulVec(Kinv, x.map((v, i) => v * mDiag[i]))
    const mx = Math.max(...y.map(Math.abs))
    x = y.map(v => v / mx)
  }
  const Kx = mulVec(K, x)
  let num = 0, den = 0
  for (let i = 0; i < x.length; i++) { num += x[i] * Kx[i]; den += x[i] * x[i] * mDiag[i] }
  return Math.sqrt(num / den)
}

// Shear-building stiffness matrix from storey springs k[0..n-1] (storey 0 at the base).
function shearK(k, iso = 0) {
  const off = iso > 0 ? 1 : 0
  const n = k.length + off
  const K = zeros(n)
  if (off) K[0][0] += iso
  for (let s = 0; s < k.length; s++) {
    const top = s + off, bot = s + off - 1
    K[top][top] += k[s]
    if (bot >= 0) { K[bot][bot] += k[s]; K[top][bot] -= k[s]; K[bot][top] -= k[s] }
  }
  return K
}

// ── Ground motion ──────────────────────────────────────────

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Synthetic ground acceleration (m/s²), Kanai-Tajimi spectrum × envelope, scaled to PGA. */
export function groundMotion({ pga = 0.4, type = 'near', dt = 0.01, seed = 7 } = {}) {
  const m = MOTIONS[type] ?? MOTIONS.near
  const steps = Math.round(m.duration / dt)
  const rand = rng(seed)
  const comps = []
  for (let f = 0.15; f <= 12; f *= 1.06) {
    const r = f / m.fg
    const kt = (1 + 4 * m.zg * m.zg * r * r) / ((1 - r * r) ** 2 + 4 * m.zg * m.zg * r * r)
    const hp = (f / 0.25) ** 4 / (1 + (f / 0.25) ** 4) // remove very long periods
    comps.push({ w: 2 * Math.PI * f, a: Math.sqrt(kt * hp * f * 0.06), ph: rand() * Math.PI * 2 })
  }
  const a = new Float64Array(steps)
  for (let i = 0; i < steps; i++) {
    const t = i * dt
    const env = t < m.rise ? (t / m.rise) ** 2 : t < m.rise + m.strong ? 1 : Math.exp(-m.decay * (t - m.rise - m.strong))
    let s = 0
    for (const c of comps) s += c.a * Math.sin(c.w * t + c.ph)
    a[i] = env * s
  }
  let peak = Math.max(...a.map(Math.abs))
  if (m.pulse) {
    // Near-fault velocity pulse: one full acceleration cycle.
    const { t: t0, period, share } = m.pulse
    for (let i = 0; i < steps; i++) {
      const t = i * dt - t0
      if (t >= 0 && t <= period) a[i] += share * peak * Math.sin((2 * Math.PI * t) / period)
    }
    peak = Math.max(...a.map(Math.abs))
  }
  const k = (pga * G) / peak
  for (let i = 0; i < steps; i++) a[i] *= k
  return { dt, accel: a, duration: m.duration }
}

// ── Response ───────────────────────────────────────────────

/**
 * Time-history response.
 * @param model   from buildStoreyModel
 * @param pga     peak ground acceleration (g)
 * @param system  'standard' | 'damped' | 'isolated'
 * @param type    'near' | 'far'
 * @param grade   override 耐震等級 (1–3); default model.grade
 * @returns { period, isoPeriod, damping, storeys: [{…, drift, driftRatio, accel, shearKN, level}],
 *            roofCm, isoCm, baseShearCoef, worst, frames: { dt, n, disp: Float32Array }, groundTrace, roofTrace }
 */
export function simulateQuake(model, { pga = 0.4, system = 'standard', type = 'near', grade, outDt = 0.02 } = {}) {
  const n = model.storeys.length
  const g = grade ?? model.grade
  // Storey springs: shape keeps the drift uniform under a static (inverted triangle) load.
  const shape = model.storeys.map((s, i) => {
    let shear = 0
    for (let j = i; j < n; j++) shear += model.mass[j] * (model.levels[j + 1] - model.levels[0])
    return shear / s.h
  })
  const fixedK = shearK(shape)
  const w1 = firstOmega(fixedK, model.mass)
  const targetW = (2 * Math.PI) / Math.max(0.05, model.period)
  const scale = (targetW / w1) ** 2 * (GRADE_STIFFNESS[g] ?? 1)
  const k = shape.map(v => v * scale)
  const period = (2 * Math.PI) / (targetW * Math.sqrt(GRADE_STIFFNESS[g] ?? 1))

  const isolated = system === 'isolated'
  const zeta = system === 'damped' ? 0.15 : isolated ? 0.03 : 0.05 - 0.03 * model.alpha
  const mDiag = isolated ? [model.baseMass, ...model.mass] : [...model.mass]
  const totalM = mDiag.reduce((s, v) => s + v, 0)
  const kIso = isolated ? totalM * ((2 * Math.PI) / ISO_PERIOD) ** 2 : 0
  const K = shearK(k, kIso)
  const N = K.length
  const off = isolated ? 1 : 0 // DOF 0 is the isolation layer

  // Rayleigh damping on the superstructure, at ω1 and 5 ω1.
  // Isolated: stiffness part only, so it never resists sliding on the isolators.
  const wA = (2 * Math.PI) / period, wB = 5 * wA
  const a0 = isolated ? 0 : (2 * zeta * wA * wB) / (wA + wB)
  const a1 = isolated ? (2 * zeta) / wA : (2 * zeta) / (wA + wB)
  const Ks = shearK(k, isolated ? 1e-9 : 0)
  const C = Ks.map(row => row.map(v => a1 * v))
  for (let i = 0; i < N; i++) C[i][i] += a0 * mDiag[i]
  if (isolated) C[0][0] += 2 * ISO_DAMPING * Math.sqrt(kIso * totalM)

  // Newmark average acceleration.
  const { dt, accel: ag, duration } = groundMotion({ pga, type })
  const b1 = 1 / (0.25 * dt * dt), b2 = 1 / (0.25 * dt), b3 = 1 / 0.5 - 1
  const c1 = 0.5 / (0.25 * dt), c2 = 0.5 / 0.25 - 1, c3 = dt * (0.5 / (2 * 0.25) - 1)
  const Keff = K.map((row, i) => row.map((v, j) => v + b1 * (i === j ? mDiag[i] : 0) + c1 * C[i][j]))
  const Kinv = invert(Keff)
  let u = new Float64Array(N), v = new Float64Array(N), a = new Float64Array(N)
  for (let i = 0; i < N; i++) a[i] = -ag[0]

  const stride = Math.max(1, Math.round(outDt / dt))
  const nOut = Math.floor(ag.length / stride)
  const L = n + 1 // levels incl. base
  const disp = new Float32Array(nOut * L)
  const maxDrift = new Float64Array(n), maxAcc = new Float64Array(n), maxShear = new Float64Array(n)
  let maxRoof = 0, maxIso = 0, maxBase = 0
  const groundTrace = [], roofTrace = []

  for (let s = 0; s < ag.length; s++) {
    if (s > 0) {
      const p = new Float64Array(N)
      for (let i = 0; i < N; i++) {
        p[i] = -mDiag[i] * ag[s] + mDiag[i] * (b1 * u[i] + b2 * v[i] + b3 * a[i])
        let cs = 0
        for (let j = 0; j < N; j++) cs += C[i][j] * (c1 * u[j] + c2 * v[j] + c3 * a[j])
        p[i] += cs
      }
      const un = mulVec(Kinv, p)
      const an = new Float64Array(N), vn = new Float64Array(N)
      for (let i = 0; i < N; i++) {
        an[i] = b1 * (un[i] - u[i]) - b2 * v[i] - b3 * a[i]
        vn[i] = v[i] + dt * 0.5 * (a[i] + an[i])
      }
      u = un; v = vn; a = an
    }
    const base = isolated ? u[0] : 0
    let below = base, baseShear = 0
    for (let i = 0; i < n; i++) {
      const ui = u[i + off]
      const d = Math.abs(ui - below)
      if (d > maxDrift[i]) maxDrift[i] = d
      const sh = k[i] * d
      if (sh > maxShear[i]) maxShear[i] = sh
      if (i === 0) baseShear = sh
      const acc = Math.abs(a[i + off] + ag[s])
      if (acc > maxAcc[i]) maxAcc[i] = acc
      below = ui
    }
    maxRoof = Math.max(maxRoof, Math.abs(u[N - 1]))
    maxIso = Math.max(maxIso, Math.abs(base))
    maxBase = Math.max(maxBase, baseShear)
    if (s % stride === 0 && s / stride < nOut) {
      const o = (s / stride) * L
      disp[o] = base
      for (let i = 0; i < n; i++) disp[o + 1 + i] = u[i + off]
      if ((s / stride) % 4 === 0) { groundTrace.push(ag[s] / G); roofTrace.push(u[N - 1]) }
    }
  }

  // Yielding: demand over strength makes short-period buildings drift more.
  const strengthCoef = yieldCoef(model.alpha, g)
  const baseShearCoef = maxBase / (model.totalMass * G)
  const R = baseShearCoef / strengthCoef
  const shortness = Math.min(1, Math.max(0, (0.5 - period) / 0.4))
  const yieldFactor = R > 1 ? 1 + shortness * ((R * R + 1) / (2 * R) - 1) : 1

  // A frame that yields is damaged even when its drift is small.
  const minLevel = R > 2 ? 2 : R > 1 ? 1 : 0
  const storeys = model.storeys.map((st, i) => {
    const ratio = (maxDrift[i] * yieldFactor) / st.h
    const byDrift = DRIFT_LEVELS.indexOf(driftLevel(ratio))
    return { ...st, drift: maxDrift[i] * yieldFactor, driftRatio: ratio, accel: maxAcc[i] / G, shearKN: maxShear[i] / 1000, level: DRIFT_LEVELS[Math.max(byDrift, minLevel)] }
  })
  const rank = s => DRIFT_LEVELS.indexOf(s.level) * 10 + s.driftRatio
  const worst = storeys.reduce((w, s) => (rank(s) > rank(w) ? s : w), storeys[0])
  return {
    pga, system, type, grade: g, period, isoPeriod: isolated ? ISO_PERIOD : null, damping: zeta, duration,
    storeys, worst,
    roofCm: maxRoof * 100, isoCm: maxIso * 100,
    baseShearCoef, strengthCoef, strengthUsed: R, yields: R > 1,
    isoOver: isolated && maxIso * 100 > ISO_CLEARANCE_CM,
    frames: { dt: stride * dt, n: nOut, levels: L, disp },
    groundTrace, roofTrace,
  }
}

/** Which storey a part belongs to (by its centre height). */
export function storeyIndexOf(part, model) {
  const c = part.pos[1]
  const i = model.storeys.findIndex(s => c <= s.z1)
  return i < 0 ? model.storeys.length - 1 : i
}

/** How much to enlarge the sway on screen so it is visible (×1–100). */
export function swayScale(model, result) {
  const peak = Math.max(1e-4, result.roofCm / 100)
  return Math.round(Math.min(100, Math.max(1, (0.06 * model.height) / peak)))
}
