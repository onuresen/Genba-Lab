import * as THREE from 'three'

// Equinox sun path at Tokyo's latitude (≈35°N): rises east (+X), passes
// south (+Z) at ≈55° and sets west (-X). Hour 6 → 0, 12 → π/2, 18 → π.
// Indicative only: no date, no exact site. Used for light, sky and shadows.
const LATITUDE = 35 * Math.PI / 180

export function sunDirection(time) {
  const theta = Math.PI * ((time - 6) / 12)
  const s = Math.sin(theta)
  return new THREE.Vector3(Math.cos(theta), s * Math.cos(LATITUDE), s * Math.sin(LATITUDE))
}
