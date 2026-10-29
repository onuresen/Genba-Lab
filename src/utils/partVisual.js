// How one part looks, decided in one place.
// Precedence, strongest first:
//   fire > earthquake > selection > Gantt week > acoustic tint > hover > model colour
// Opacity is decided separately: a selected or focused part is never dimmed,
// so a selection stays visible during a Gantt hover or a focus.

export const SELECT_COLOR = '#2e86de'
const HOVER_EDGE = '#5dade2'
const EDGE = '#1d2731'

export const GHOST_OPACITY = 0.12
const WEEK_DIM_OPACITY = 0.25
const FAILED_OPACITY = 0.6

export function resolvePartVisual({
  color,
  acousticTint = null,
  fireStatus = 'ok',
  shakeAtRisk = false,
  damaged = false,
  weekHighlighted = false,
  weekDimmed = false,
  selected = false,
  hovered = false,
  focusRole = null, // 'subject' | 'context' | 'ghost' | null
} = {}) {
  let emissive = color
  let emissiveIntensity = hovered ? 0.25 : 0
  let source = hovered ? 'hover' : 'model'
  if (fireStatus === 'burning') { emissive = '#ff6600'; emissiveIntensity = 1.2; source = 'fire' }
  else if (fireStatus === 'failed') { emissive = '#330000'; emissiveIntensity = 0.6; source = 'fire' }
  else if (fireStatus === 'out') { emissive = '#1f78b4'; emissiveIntensity = 0.3; source = 'fire' }
  else if (shakeAtRisk) { emissive = '#e74c3c'; emissiveIntensity = 0.8; source = 'earthquake' }
  else if (damaged) { emissive = '#e74c3c'; emissiveIntensity = 0.45; source = 'earthquake' }
  else if (selected) { emissive = SELECT_COLOR; emissiveIntensity = 0.32; source = 'selection' }
  else if (weekHighlighted) { emissive = '#3498db'; emissiveIntensity = 0.5; source = 'week' }
  else if (acousticTint) { emissive = acousticTint; emissiveIntensity = 0.35; source = 'acoustic' }

  const kept = selected || focusRole === 'subject'
  let opacity = 1
  if (fireStatus === 'failed') opacity = FAILED_OPACITY
  else if (!kept && weekDimmed) opacity = WEEK_DIM_OPACITY
  else if (!kept && !hovered && focusRole === 'ghost') opacity = GHOST_OPACITY
  const transparent = opacity < 1

  const edgeColor = selected ? SELECT_COLOR : hovered ? HOVER_EDGE : EDGE
  const edgeOpacity = selected ? 1 : hovered ? 0.9
    : opacity === GHOST_OPACITY ? 0.06
    : opacity === WEEK_DIM_OPACITY ? 0.12
    : 0.3

  return {
    emissive,
    emissiveIntensity,
    opacity,
    transparent,
    // See-through parts must not hide what is behind them.
    depthWrite: !transparent,
    edgeColor,
    edgeOpacity,
    source,
  }
}
