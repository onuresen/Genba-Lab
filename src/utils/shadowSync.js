// Sun shadows render only when something that casts them changed.
// Orbiting the camera never needs a new shadow map, so it skips the extra pass.
// Callers: Scene (any re-render), GsapBridge (moving parts / crane), Part (mesh load).
let dirty = true

export function markShadowsDirty() {
  dirty = true
}

export function takeShadowsDirty() {
  const was = dirty
  dirty = false
  return was
}
