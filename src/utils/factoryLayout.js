// Factory floor layout for the prefab bay planner (FactoryGrid) and its camera (Scene).

export const BAY_SPACING_X = 4.6
export const BAY_SPACING_Z = 4.2
export const BAY_SIZE = [3.8, 3.4]

// Columns grow with the part count so big models make a square-ish floor, not a long strip.
export function factoryLayout(count) {
  const cols = Math.min(12, Math.max(3, Math.ceil(Math.sqrt(count))))
  const rows = Math.max(1, Math.ceil(count / cols))
  return {
    cols,
    rows,
    width: cols * BAY_SPACING_X + 1.6,
    depth: rows * BAY_SPACING_Z + 1.8,
    centerZ: (rows - 1) * BAY_SPACING_Z / 2 - 2.2,
  }
}
