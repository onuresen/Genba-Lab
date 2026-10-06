# Genba Lab

> **Genba Lab** loads real IFC models and runs simulations on them: sequence, crane, earthquake, fire, wind, rain, thermal, acoustic, metrics, factory layout.
> It started as a fork of [Kit-of-Parts](https://github.com/onuresen/Kit-of-Parts) (commit `7ed9eab`), then dropped the block-kit features (sample kits, kit JSON I/O, window/door/cylinder/GLB shapes, Builder, Site, Game).
> Backlog and "Recently shipped" sections below are partly history from Kit-of-Parts. Removed features there are marked by the Key decisions in "IFC Import".

## Keeping This File Up to Date

**After every session that adds, removes, or significantly changes a feature, update this file.**
Specifically update: the Component Map (new files), the State Inventory (new App.jsx state), the Feature Backlog (mark shipped items, add new ideas), and any relevant implementation notes. A future session should never need to re-read the codebase just to understand the project — this file should be enough.

---

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

Available gstack skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/connect-chrome`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/plan-devex-review`, `/devex-review`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/learn`

---

## Project Overview

**Genba Lab** is a client-side React SPA that loads real IFC models and runs simulations and analysis on them. Targets architects and engineers with focus on Japanese building standards (seismic, fire, Ken grid, CASBEE).

**Dev server:** `npm run dev` (Vite on localhost:5173)
**Build:** `npm run build` → `/dist/`
**Deploy:** GitHub Pages via `.github/workflows/deploy.yml` on push to `main` (runs `npm test`, then `npm run build`). `vite.config.js` base is `./`, so the build works at any path (e.g. `/Genba-Lab/`).
**Tests:** `npm test` (all), or `npm run test:render-gate`, `npm run test:ifc` (Node, runs web-ifc headless), `npm run test:crane`

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| UI | React | 19.2.4 |
| 3D | Three.js + @react-three/fiber | 0.183 / 9.6 |
| 3D helpers | @react-three/drei | 10.7 |
| Animation | GSAP | 3.15 |
| Icons | lucide-react | 1.8 |
| PDF export | jspdf | 4.2 |
| IFC import | web-ifc (WASM, in a Web Worker) | 0.0.78 |
| Build | Vite | 8.0.4 |

No Tailwind — all styling is custom CSS in `src/App.css` plus inline styles. Dark mode via `[data-theme="dark"]` attribute on `#root-container`.

---

## Architecture

### State Management (3 layers)

**1. `src/KitContext.jsx`** — persistent, survives re-renders
- `parts[]` — array of part objects (CRUD, undo/redo 30-step history)
- `presets[]` — named variant configurations
- `projectSettings` — `{ currency: 'USD'|'JPY', standard: 'JP'|'EN' }`
- Starts empty. Restores the last IFC model from `localStorage` key `genba-lab-model` (only if `projectSettings.source.type === 'ifc'`; old block kits are ignored)
- Only loader: `loadKitData(kit)` (called by IFC import)
- Exposes: `loadKitData`, `updatePartSequences`, `addConnection`, `removeConnection`, `savePreset`, `removePreset`, `undo`, `redo`, `canUndo`, `canRedo`, `formatCurrency`

**2. `src/App.jsx`** — session state (~35 state vars as of last update)

| State var | Type | Purpose |
|---|---|---|
| `exploded` | bool | Explode mode active |
| `selected` | part\|null | Currently selected part object |
| `visible` | `{[id]: bool}` | Part visibility map |
| `selectedVariants` | `{[id]: number}` | Variant index per part |
| `activePreset` | id\|null | Currently applied preset |
| `sequenceMode` | bool | Assembly sequence active |
| `sequenceStep` | number | Current step (0 = all ghost) |
| `showMetrics` | bool | MetricsPanel open |
| `showDimensions` | bool | DimensionLines visible |
| `sectionCutActive` | bool | Section cut plane on |
| `sectionCutY` | number | Section cut Y position |
| `envSettings` | object | `{ grass, time, clouds, stars, kenGrid }` |
| `factoryMode` | bool | Prefab factory layout planner active |
| `cameraCmd` | object\|null | `{ type:'preset'\|'frame', ...opts, ts }` — change `ts` to re-fire |
| `darkMode` | bool | Persisted to localStorage `genba-lab-dark` |
| `showShortcuts` | bool | Keyboard shortcuts modal |
| `showCrane` | bool | Crane 3D + panel visible |
| `showCraneRadius` | bool | Crane reach rings visible |
| `cinematicMode` | bool | Cinematic demo tour active |
| `rendererRef` | ref | WebGL renderer (captured via `onRendererReady`) |
| `highlightedWeek` | number\|null | Gantt week hovered — dims non-week parts in 3D |
| `showSecondCrane` | bool | Second crane + collision disc visible |
| `secondCraneX` | number | X offset of second crane from first (default −8) |
| `showWindArrows` | bool | Wind load arrow overlay active |
| `windSpeed` | number | Shared wind speed (m/s) — lifted from CranePanel |
| `showWaterSim` | bool | Water simulation overlay active (rain + pressure planes) |
| `showThermal` | bool | Thermal bridge overlay active at connection midpoints |
| `showAcoustic` | bool | Acoustic STC color overlay + floating STC labels active |
| `showFloorPlan` | bool | Floor plan modal open |
| `showEarthquake` | bool | Earthquake panel visible |
| `earthquakeMagnitude` | number | Richter 3–9 |
| `isShaking` | bool | Shake animation running |
| `hasShaken` | bool | Verdict visible (true after shake completes) |
| `earthquakeCountdown` | number\|null | 3-2-1 brace countdown before earthquake run starts |
| `liftPlanMode` | bool | Crane lift path planner active |
| `liftStart` | `{x,z}\|null` | Pick-up point world coords |
| `liftEnd` | `{x,z}\|null` | Installation point world coords |
| `craneCabView` | bool | First-person crane cab camera active |
| `fireMode` | bool | Fire spread simulation active |
| `fireState` | `{[partId]: 'ok'\|'burning'\|'failed'}` | Per-part fire status |
| `fireElapsed` | number | Seconds since first ignition |
| `showFireCompartments` | bool | Fire compartment wireframe overlay active |

**3. Component-level** — hover, animation refs, panel open states

### Data Flow
User action → App state update → props flow to Scene/panels → GSAP tweens animate → Three.js `useFrame` updates per-frame

### Camera Command Pattern
To trigger camera movement from outside Scene: `setCameraCmd({ type: 'preset', preset: 'front', ts: Date.now() })`. The `ts` field is what triggers the `useEffect` in `CameraController`. Preset names: `front`, `back`, `top`, `bottom`, `right`, `left`, `home`.

### Kit JSON Schema (per part)
```json
{
  "id": "Foundation",
  "shape": "box",
  "position": [0, 0, 0],
  "size": [3, 0.5, 3],
  "explosionVector": [0, -1, 0],
  "sequence": 1,
  "structural_role": "primary",
  "factory_work": true,
  "connections": [{ "to": "Column-A", "type": "bolted" }],
  "variants": [{
    "label": "Pre-cast Concrete",
    "color": "#95a5a6",
    "unit_cost_usd": 4200,
    "labor_cost_usd": 800,
    "weight_kg": 1200,
    "carbon_kgco2e": 420,
    "seismic_grade": 3,
    "fire_resistance_grade": "2hr",
    "bsl_compliant": true,
    "jis_standards": ["JIS A 5364"],
    "lead_time_days": 21,
    "assembly_time_min": 45,
    "load_bearing_kn": 800,
    "sku": "PC-F-001",
    "supplier": "Example Precast Co."
  }]
}
```
No bundled kits. `tests/fixtures/basic-kit.json` (the old Basic sample) is only a test fixture for the IFC export → import round trip.

---

## Component Map

### Core
| File | Role |
|---|---|
| `src/App.jsx` | Root orchestrator, all global state, handlers |
| `src/components/KitContext.jsx` | Context provider, persistence, undo/redo |
| `src/App.css` | All styles (~2000 lines). Dark mode via `[data-theme="dark"]` prefix |

### 3D / Scene
| File | Role |
|---|---|
| `src/components/Scene.jsx` | `<Canvas>` host. Props: all mode flags + `onRendererReady`, `cinematicMode`, `onCinematicEnd`, `onSetExploded`, `onSetSequenceMode`, `onSetSequenceStep`, `onSetShowMetrics`, `maxStep`. `gl={{ preserveDrawingBuffer: true }}` for screenshots |
| `src/components/Part.jsx` | One part: IFC mesh via `useIfcGeometry` (box fallback from `size`), GSAP explode/sequence/shake, hover, clipping, fire/acoustic/week tints |
| `src/components/Connection.jsx` | Animated lines between connected parts. Color by type: dry-fit=#27ae60, bolted=#e67e22, welded=#e74c3c, adhesive=#3498db, damper=#9b59b6, base-isolation=#1abc9c |
| `src/components/Crane.jsx` | Tower crane 3D mesh (mast, jib, hook, trolley). Takes a `layout` prop from `utils/craneLayout.js`. In sequence mode it slews toward the current part and runs the trolley out to its radius |
| `src/components/CinematicMode.jsx` | GSAP timeline for scripted demo tour. Disables OrbitControls during playback. Calls `onEnd` when complete |
| `src/components/FactoryGrid.jsx` | Factory layout planner. Replaces building view with parts laid flat in sequence order across production bays, with bay/sequence labels, bay capacity warnings, and drag-to-reorder sequence sync. |
| `src/components/DimensionLines.jsx` | 3D dimension overlays |
| `src/components/ViewCube.jsx` | 3D nav cube (bottom-right). Calls `onPreset(name)` |
| `src/components/WindArrows.jsx` | Pressure arrows per part face: blue=windward, red=leeward, orange=roof. Scale pulses with `windSpeed` via `useFrame` |
| `src/components/WindStreamlines.jsx` | Animated wind-field ribbons and moving beads around the active kit. Shares the existing wind-speed state so it reads as visual analysis, not a separate toy simulation. |
| `src/components/RainSimulation.jsx` | Instanced rain streaks, puddle accumulation, and splash rings. Up to 150 falling drops, 28 puddles, and 36 splash events rendered via `instancedMesh`. Controlled by `showWaterSim` prop. |
| `src/components/WaterPressure.jsx` | Semi-transparent pressure heatmap planes on all 5 faces of each visible part. Color scale: light blue (low) → deep blue → red (high) based on `windSpeed`. Opacity pulses sinusoidally via `useFrame`. Controlled by `showWaterSim` prop. |
| `src/components/FireCompartments.jsx` | Groups visible parts by `part.fire_compartment` field. Computes AABB per group, renders wireframe box colored by worst fire rating (non-rated=#e74c3c, 1hr=#f39c12, 2hr=#27ae60). Html label shows compartment area vs BSL 500m² limit. |
| `src/components/FireEffects.jsx` | Visual fire layer for burning/failed parts: flame columns, smoke plumes, heat rings, point lights, embers, and hazard labels driven by `fireState` plus user-controlled `fireIntensity`. |
| `src/components/EarthquakeEffects.jsx` | Earthquake game-feel layer: camera rumble, shockwave rings, fault-line cracks, and stress/critical labels driven by seismic grade, magnitude, and base-isolation status. |
| `src/components/ThermalOverlay.jsx` | Thermal bridge visualizer. Renders pulsing spheres/rings at visible connection midpoints; color derives from active variant thermal conductivity. |

### UI Panels
| File | Role |
|---|---|
| `src/components/Toolbar.jsx` | Top-center toolbar. Imports `ShareButton`. Props: all toggle handlers + `onShare`, `shareMetrics`, `cinematicMode`, `onToggleCinematic` |
| `src/components/ShareButton.jsx` | Camera icon button — calls `onShare` prop (logic lives in App.jsx) |
| `src/components/Sidebar.jsx` | Left 220px panel: presets, layer visibility, factory summary, `IfcLoadButton` |
| `src/components/IfcLoadButton.jsx` | LOAD IFC button + progress/result line. Used in Sidebar and the empty start screen (`App.jsx`) |
| `src/components/InfoPanel.jsx` | Right 272px panel: selected part detail, variants, connections, environment settings |
| `src/components/CranePanel.jsx` | Right panel (when crane visible): lift specs, wind sim (Beaufort, EN 14439), load % bar, Lift Path Planner (click the ground via a pick plane in `Scene.jsx`) |
| `src/components/MetricsPanel.jsx` | Bottom-left modal. Tabs: cost, carbon, bom, prefab, structural, ai. Props include `onVariantChange` |
| `src/components/AIOptimiserPanel.jsx` | "✦ AI" tab — rule engine finds lowest-carbon variants that still meet seismic grade. Apply individually or all at once |
| `src/components/ShortcutsModal.jsx` | Keyboard shortcuts reference |
| `src/components/EarthquakePanel.jsx` | Right-side panel (`right:280, bottom:20`, uses `metrics-panel` class). Magnitude slider/presets 3–9, brace countdown, indicative PGA, seismic score, seismic grade table, Shake button, survived/at-risk verdict |
| `src/components/FloorPlanPanel.jsx` | Full-screen modal. 2D canvas projects parts onto XZ plane (top-down). Ken grid overlay toggle. SVG export button |
| `src/components/GanttPanel.jsx` | Schedule tab inside MetricsPanel. CSS Gantt bars per part, grouped by week. Click week to highlight parts in 3D |
| `src/components/FirePanel.jsx` | Fire mode overlay panel (bottom-right). Editable scenario intensity slider, Ignite Test Part action, elapsed timer, burning/failed part counts, per-part status list with fire resistance grade, Extinguish All button. |
| `src/components/SupplyRiskPanel.jsx` | Supply tab inside MetricsPanel. Lead-time-derived risk summary, per-part risk rows, and shortage simulation that switches to lower-risk variants. |

### Utils
| File | Role |
|---|---|
| `src/utils/ifcExporter.js` | Writes parts back out as simple IFC 2x3 boxes (`genba-lab.ifc`) |
| `src/utils/pdfGenerator.js` | PDF reports (施工要領書) with metrics and BOM |
| `src/utils/materialMetrics.js` | Shared Group C material defaults: thermal conductivity, supply risk, STC rating, and overlay colors. |
| `src/utils/ifcParse.js` | IFC bytes → element records (world-space mesh, class, name, GlobalId, storey, colour, property sets, material names). Bulk-reads IfcRelDefinesByProperties / IfcRelAssociatesMaterial / IfcRelDefinesByType (type values inherited). Max 60 props per element. Takes an initialised web-ifc `api`; shared by the worker and Node tests. |
| `src/utils/ifcProperties.js` | Pure helpers: material keyword → density/carbon/cost/λ, FireRating → minutes → `1hr`/`2hr`/`non-rated`, AcousticRating → number, `combineFacts(members)` (weakest fire rating, any load bearing). |
| `src/utils/ifcToKit.js` | Element records → normal kit (`parts`, `presets`, `projectSettings.source`). Groups per storey + class above `MAX_INDIVIDUAL_PARTS` (120). Sets sequence, explode vectors, touching-box connections, rough volume-based metrics. |
| `src/utils/craneLayout.js` | `computeCraneLayout(parts)`: mast 3 m beyond the model's +X edge, centred on Z; jib reaches the far corner (9–80 m); hook 4 m above the roof; rated moment = max(60 t·m, 2.5 t × jib). `reachTo`, `capacityAt`, `partBounds`. Used by Crane, CranePanel, Scene (cab view, second crane, ground size), App (frame on crane toggle) |
| `src/utils/ifcGeometryStore.js` | Mesh store for `shape: 'ifc'` parts. Memory + IndexedDB (`genba-lab-meshes`). `useIfcGeometry(key)` hook. |
| `src/utils/ifcImport.js` | Browser entry: `importIfcFile(file, onProgress)` → worker parse → `ifcToKit` → save meshes. |
| `src/workers/ifcWorker.js` | Web Worker running web-ifc. WASM URL comes from `web-ifc/web-ifc.wasm?url`. |

---

## IFC Import

- Sidebar **LOAD IFC** → `importIfcFile` → `KitContext.loadKitData(kit)`.
- Each IFC element becomes one part (`shape: 'ifc'`, `ifcGeometry: '<modelKey>:<n>'`). Over 120 elements, parts are grouped per storey + IFC class.
- Kit JSON / localStorage hold only the key. Meshes live in IndexedDB. Missing mesh → box fallback from `size`.
- `Part.jsx` swaps in the mesh via `useIfcGeometry`. Everything else (explode, sequence, metrics, fire, Gantt) uses the normal part fields.
- `fire_compartment` = storey name. Sequence = storey → build order (footing, slab, column, beam, wall, …) → height.
- Values from IFC when present: material (variant label), FireRating → `fire_resistance_grade`, LoadBearing → `structural_role`, IsExternal → `part.is_external`, AcousticRating → `stc_rating`, NetVolume/NetWeight quantities. Material sets density, carbon factor, cost factor and λ.
- Always estimated: cost and carbon. Weight/volume fall back to mesh volume × density. Each variant's `meta` lists "From IFC" vs "Estimated".
- `variant.ifc_property_set` = short summary (shown in InfoPanel "IFC data"). `variant.ifc_psets` = full sets, single-element parts only.
- Above 30 visible parts (`COMPACT_LABEL_LIMIT` in `Scene.jsx`), explode mode hides part and connection labels; hover still shows them.
- `App.jsx` frames the camera once per `projectSettings.source.modelKey` (import and reload).
- Camera commands in `Scene.jsx` run last, use `overwrite: true`, and re-run when the camera instance changes. Without this, the mount-time "home" tweens win on reload.

**Key decisions**
- **Decision:** IFC elements become normal kit parts, with meshes kept outside the kit JSON.
- **Why:** All existing tools work on parts. Mesh data is too big for localStorage.
- **Alternative:** A separate read-only IFC viewer layer. Rejected: none of the analysis tools would see it.
- **Revisit when:** A model needs real cost or carbon data (e.g. from a cost pset or EPD link).
- **Confidence:** med

- **Decision:** Remove block-kit features (sample kits, kit JSON I/O, window/door/cylinder/GLB, Builder, Site, Game). Keep the box shape as the mesh fallback.
- **Why:** This fork is for real models. Block features made it read as a second Kit-of-Parts. The original repo keeps them.
- **Alternative:** Keep them hidden behind a flag. Rejected: dead code paths in Part/Scene/App for no user.
- **Revisit when:** A feature is needed again. Port it from the original `Kit-of-Parts` repo.
- **Confidence:** high

- **Decision:** Crane size and position come from the model (`craneLayout.js`), not constants.
- **Why:** Real models are 25 m+; the fixed 9 m crane at x = 7 stood inside them.
- **Alternative:** User-placed crane. Deferred: auto placement works for one building; drag-to-place is a later step.
- **Revisit when:** Sites need the crane on a specific side, or a real crane catalogue.
- **Confidence:** med

## Key Domain Concepts

- **Parts** have variants (materials/sizes/specs), each with cost, weight, carbon, compliance data
- **Connections** typed joints: dry-fit, bolted, welded, adhesive, damper, base-isolation
- **Explode mode** — GSAP fans parts along their `explosionVector`. Elastic easing when connected, expo-out otherwise
- **Sequence mode** — parts animate in by `sequence` field order; crane follows
- **Site mode** — Ken grid (18.2m / 910mm module), camera elevated top-down
- **Game mode** — all parts ghosted except current target `gameStep`; wrong clicks = mistake
- **Section cut** — Three.js clipping plane at Y = `sectionCutY`
- **Cinematic mode** — GSAP timeline: hero orbit → explode → reassemble → sequence walk → metrics reveal → final orbit
- **Share** — `gl.domElement.toDataURL()` (needs `preserveDrawingBuffer: true` on Canvas) + 2D canvas badge overlay + clipboard caption
- **Compliance standards**: seismic grades 1/2/3 (耐震等級), fire resistance (1hr/2hr/non-rated), CASBEE (S/A/B+/B-/C), RIBA 2030 (300 kg CO₂e/m²), BSL, JIS

---

## Animation Patterns

- **GSAP** for all timeline animations — explode, assemble, camera moves, crane, sequence, cinematic
- **`useFrame`** for per-frame Three.js updates (materials, positions)
- **OrbitControls ref** (`controlsRef`) must be disabled (`controlsRef.current.enabled = false`) before GSAP camera moves, re-enabled after
- Camera preset positions (in `CameraController` inside `Scene.jsx`):
  - `front`: `[0,2,14]`, `back`: `[0,2,-14]`, `top`: `[0.001,16,0]`, `right`: `[14,2,0]`, `left`: `[-14,2,0]`, `home`: `[8,8,8]`

---

## Styling Conventions

- All panel styles in `src/App.css` — grouped by component with `/* ─── Component Name ───── */` headers
- Dark mode: duplicate rules under `[data-theme="dark"] .class-name { ... }`
- Glass panels: `backdrop-filter: blur(10px)`, `rgba(255,255,255,0.95)` light / `rgba(30,34,44,0.95)` dark
- Toolbar buttons: `.tb-btn` base class, `.tb-btn--active` for active state, `.tb-btn--text` for icon+text buttons
- Metrics tabs: `.metrics-tab` / `.metrics-tab--active`

---

## Performance Notes

- Material cloning per part (avoid shared state mutation)
- Connection deduplication (Set-based, rendered once per pair)
- Clipping planes GPU-side
- Suspense boundaries for GLB async loading
- `preserveDrawingBuffer: true` on Canvas — needed for screenshots, slight GPU memory cost
- **Render loop is on-demand.** `Scene.jsx` sets `frameloop={continuousActive ? 'always' : 'demand'}` so an idle scene renders at 0fps instead of a constant 60. React prop changes (hover, selection, material colors) auto-invalidate; **GSAP-driven** animations (explode, sequence, camera, crane, earthquake, cinematic) do not, so `<GsapBridge>` pumps a render frame while any GSAP tween is active. **If you add a component with a continuous (non-GSAP) `useFrame`, you MUST add its enabling flag to the `continuousActive` gate in `Scene.jsx`** or its animation will freeze when the loop idles. Current gate: `showWaterSim, showThermal, showWindArrows, fireMode, isShaking, hasShaken, showCrane, cinematicMode`.
- `Connection.jsx` `useFrame` early-outs once its explode/assemble tween settles (`lastP` ref); its midpoint `<Html>` label only mounts when exploded or hovered. `<Html>` reprojects every frame — keep it conditional, never one-per-item always-on.
- `Part` is wrapped in `React.memo`; handlers passed to it from `App.jsx` (`handleFramePart`, `handleGameClick`, `handleIgnite`) are `useCallback`-stable so timer-driven App re-renders (game/fire elapsed) don't reconcile every part. Keep new per-Part handler props memoized.

---

## Feature Backlog

Priority order as agreed. Build these in sequence. Each entry has enough detail to implement without re-reading the codebase.

---

### 1. Earthquake Shake Simulation ✅ SHIPPED
**What:** Magnitude slider (3.0–9.0 Richter). Press "Shake" — building sways with sinusoidal oscillation. Parts with lower seismic grades shake more and flash red. Base-isolated parts (connection type = `base-isolation`) move less. "Survived / At Risk" verdict at end.

**UI:** New button in Toolbar (`Waves` icon from lucide). New `EarthquakePanel` right-side panel with magnitude slider + verdict readout.

**State to add in App.jsx:** `earthquakeMode: bool`, `earthquakeMagnitude: number (3–9)`, `isShaking: bool`

**3D implementation:** In `Part.jsx`, when `isShaking` prop is true, run a GSAP `timeline().to(mesh.position, { x: '+=amplitude', yoyo: true, repeat: cycles, duration: 0.08 })`. Amplitude = `magnitude * 0.05 * (1 / seismicGrade)`. Base-isolated parts (check `part.connections.some(c => c.type === 'base-isolation')`) get amplitude × 0.2.

**New files:** `src/components/EarthquakePanel.jsx`
**Modified files:** `src/App.jsx` (state + handler), `src/components/Toolbar.jsx` (button), `src/components/Part.jsx` (shake prop + GSAP), `src/App.css`

---

### 2. Construction Schedule / Gantt Overlay ✅ SHIPPED
**What:** Each part already has a `sequence` field. Add a `week` field to each part (or derive from sequence). Sequence timeline becomes a Gantt chart — horizontal bars per part, grouped by week. Hover a week bar to highlight that week's parts in 3D. Export as PDF schedule.

**UI:** New "Schedule" tab in MetricsPanel (alongside cost, carbon, bom, prefab, structural, ai). Gantt rendered as CSS bars (no canvas needed).

**Data:** Add optional `week: number` field to part schema. If absent, derive: `week = Math.ceil(sequence / 2)`.

**New files:** `src/components/GanttPanel.jsx`
**Modified files:** `src/components/MetricsPanel.jsx` (add 'schedule' tab), `src/components/BuilderPanel.jsx` (add week input), `src/App.css`

---

### 3. Multi-Crane Collision Zone ✅ SHIPPED
**What:** Add a second crane to the site. Both cranes have configurable positions. The system calculates the anti-collision envelope (overlapping jib radii) and renders a translucent red disc at the danger zone. When sequence steps would put both jibs in the zone simultaneously, both freeze and flash.

**UI:** "Add Crane" button in CranePanel. Second crane position slider (X offset). Anti-collision radius shown as `<mesh>` ring on site.

**State to add in App.jsx:** `showSecondCrane: bool`, `secondCraneX: number`

**3D implementation:** In `Crane.jsx`, accept `position` prop (default [0,0,0]). Render second instance at `[secondCraneX, 0, 0]`. Collision disc: `<mesh rotation={[-PI/2,0,0]} position={[midpoint, 0, midpoint]}><circleGeometry /><meshBasicMaterial color="#e74c3c" transparent opacity={0.15} /></mesh>`.

**New files:** None
**Modified files:** `src/components/Crane.jsx` (position prop), `src/components/CranePanel.jsx` (second crane controls), `src/App.jsx`, `src/components/Scene.jsx`, `src/App.css`

---

### 4. Wind Load Arrows on Facade ✅ SHIPPED
**What:** A "Wind Analysis" toggle overlays animated pressure arrows on part faces. Windward faces get inward blue arrows, leeward faces get outward red arrows (suction), roof faces get uplift arrows. Arrow size scales with wind speed (already simulated in CranePanel's `windSpeed` state).

**UI:** Button in Toolbar (`Wind` icon). Arrows visible in Scene when active.

**State to add in App.jsx:** `showWindArrows: bool`. Share `windSpeed` from CranePanel via lifting it to App.jsx state (or pass down from CranePanel via callback `onWindChange`).

**3D implementation:** New `WindArrows.jsx` component. For each visible part, compute face normals from `part.size`. Render `<ArrowHelper>` (Three.js) or custom cone meshes at face centers. Animate scale with `useFrame` using a sine wave + windSpeed factor.

**New files:** `src/components/WindArrows.jsx`
**Modified files:** `src/App.jsx`, `src/components/Toolbar.jsx`, `src/components/Scene.jsx`, `src/components/CranePanel.jsx` (lift windSpeed to App), `src/App.css`

---

### 5. Floor Plan Auto-Generator ✅ SHIPPED
**What:** Projects all visible parts downward onto a 2D canvas. Auto-traces footprints, labels rooms/parts, shows dimensions. Export as SVG or PNG. Optionally shows Ken grid (910mm module) overlay.

**UI:** New "Floor Plan" button in Toolbar or new tab in MetricsPanel. Renders a `<canvas>` element in a modal. Export button downloads SVG.

**Implementation:** No Three.js needed. Iterate `parts` (filtered by `visible`), use `part.position` and `part.size` as XZ rectangle. Draw rects on 2D canvas, scale to fit panel. Label with `part.id`. Draw dimension lines at edges. For SVG export, build SVG string manually.

**New files:** `src/components/FloorPlanPanel.jsx`, `src/utils/floorPlanExporter.js`
**Modified files:** `src/App.jsx` (`showFloorPlan` state), `src/components/Toolbar.jsx`, `src/App.css`

---

---

### Group A — Crane Tools ✅ SHIPPED
**Shared files:** `Crane.jsx`, `CranePanel.jsx`, `Scene.jsx`, `App.jsx`, `SiteGrid.jsx`

#### 6. Crane Swing Path Planner ✅ SHIPPED
#### 10. Crane Operator First-Person View ✅ SHIPPED

---

### Group B — Fire & Safety ✅ SHIPPED
**Shared files:** `App.jsx`, `Toolbar.jsx`, `Part.jsx`, `Scene.jsx`

#### 7. Fire Spread Simulation ✅ SHIPPED
#### 12. Japanese Fire Compartment Visualizer ✅ SHIPPED

---

### Group C — Material Overlays ✅ SHIPPED
All are variant-data-driven overlays. `KitContext.jsx` normalizes legacy kits/local saves with default `thermal_conductivity_wpmk`, `supply_risk`, and `stc_rating` values via `materialMetrics.js`.

#### 8. Thermal Bridge Visualizer ✅ SHIPPED
State: `showThermal`. Toolbar `Thermometer` icon. `ThermalOverlay.jsx` renders pulsing spheres/rings at visible connection midpoints, colored by worst active variant conductivity.

#### 13. Material Supply Chain Risk ✅ SHIPPED
Data: `supply_risk: 'low'|'medium'|'high'` on variants, derived from `lead_time_days` when absent (>60 high, >30 medium). MetricsPanel has a "Supply" tab and BOM risk badges. "Simulate shortage" switches selected high/medium-risk variants to lower-risk alternatives where available.

#### 15. Acoustic Performance Overlay ✅ SHIPPED
State: `showAcoustic`. Toolbar `Volume2` icon. `Part.jsx` colorizes parts red→green by STC and shows floating `STC` labels. `InfoPanel.jsx` shows STC and thermal stats.

---

### Group D — Carbon & Sustainability ⬜
All extend MetricsPanel. **Shared files:** `MetricsPanel.jsx`, `App.css`.

#### 11. Carbon vs Cost Pareto Frontier
New "Pareto" tab. Enumerate variant combinations (cap at 5000 samples if V^N > 5000; 8 parts × 3 variants = 6561 — fully enumerable). Find Pareto-optimal set (no point dominates on both axes). Render SVG scatter: X=cost, Y=carbon, frontier highlighted. Click point → apply that variant combo via `onVariantChange`.
New file: `ParetoPanel.jsx`.

#### 16. Carbon Payback Calculator
New section in Carbon tab below CASBEE. Data: add `operational_carbon_kgco2e_per_year` to `projectSettings` in KitContext; slider in InfoPanel settings. `paybackYear = totalEmbodied / (3500 - operationalCarbon)` (baseline 3500 kg CO₂e/yr per 16m² module). Bar chart 0–50 yr timeline. Also modifies: `KitContext.jsx`, `InfoPanel.jsx`.

#### 17. Circular Economy End-of-Life Score
New "Circular" tab. Data: add `recyclability_pct: number` + optional `end_of_life_cost_usd` to variant (derive defaults: steel→98, timber/CLT→60, concrete→30 by label keyword). Circularity score = weighted avg recyclability. Show gauge + per-part breakdown.
New file: `CircularEconomyPanel.jsx`.

---

### Group E — Structural Compliance ⬜
**Shared files:** `App.jsx`, `MetricsPanel.jsx`, `App.css`.

#### 14. BSL / Seismic Compliance Report Card
New "Compliance" tab (or extend "structural"). Existing `minSeismicGrade` + `bslCompliantCount` already in MetricsPanel. Add: highlight non-compliant parts in 3D via `onHighlight` callback to App.jsx. Traffic-light verdict (Pass/Conditional/Fail). "Export Compliance PDF" button → `pdfGenerator.js`. Also modifies: `pdfGenerator.js`.

#### 18. Structural Redundancy Heatmap
State: `redundancyMode: bool`, `removedPartId: string|null`. UI: Toolbar toggle + click any part to simulate removal. Distribute removed part's `load_bearing_kn` across connected parts; parts exceeding capacity → red, partial → yellow, unaffected → green. Label as indicative (no FEM). Toolbar button.
New file: `RedundancyOverlay.jsx`. Also modifies: `Toolbar.jsx`, `Scene.jsx`.

---

### Group F — Standalone ⬜

#### 9. Prefab Factory Layout Planner ✅ SHIPPED
State: `factoryMode: bool`. UI: Toolbar `Factory` toggle and keyboard shortcut `F`. `FactoryGrid.jsx` renders visible parts flat in sequence order, one per production bay, with bay and sequence labels. Bays warn on weight (>3000kg), size overflow, and lead-time bottlenecks (>45d). Drag one bay onto another to reorder the visible sequence; the new order syncs back to `part.sequence` via `KitContext.updatePartSequences`. Replaces the building view when active, shows a factory summary in Sidebar, and disables conflicting site/sequence/builder/game overlays.
New file: `FactoryGrid.jsx`. Modified: `KitContext.jsx`, `App.jsx`, `Toolbar.jsx`, `Scene.jsx`, `Sidebar.jsx`, `ShortcutsModal.jsx`, `App.css`.

#### 19. 4D Time-Lapse Recording
State: `isRecording: bool`, `mediaRecorderRef: ref`. UI: Toolbar `Circle` icon (red when recording). `rendererRef.current.domElement.captureStream(30)` → `MediaRecorder({mimeType:'video/webm'})`. On start: auto-trigger cinematic mode. On cinematic end: auto-stop recorder → download `.webm` blob.
Modifies: `App.jsx`, `Toolbar.jsx`, `App.css`.

---

## Recently Shipped Features (for context)

| Feature | Files |
|---|---|
| IFC import (fork) | `src/utils/ifcParse.js`, `src/utils/ifcToKit.js`, `src/utils/ifcGeometryStore.js`, `src/utils/ifcImport.js`, `src/workers/ifcWorker.js` (all new), `src/components/Part.jsx` (IFC mesh), `src/components/Sidebar.jsx` (LOAD IFC + status), `src/components/KitContext.jsx` (`loadKitData`), `src/App.jsx` (auto-frame), `src/components/Scene.jsx` (camera command ordering), `tests/ifcImport.test.mjs`. Follow-up: property sets + materials (`ifcProperties.js`, InfoPanel IFC data section), compact labels for big kits (`Scene.jsx`, `Part.jsx`, `Connection.jsx`). |
| Earthquake Game Feel | `src/components/EarthquakeEffects.jsx` (new - camera rumble, shockwave rings, fault-line cracks, stress/critical labels), `src/components/EarthquakePanel.jsx` (countdown, presets, indicative PGA, seismic score), `src/components/Part.jsx` (stronger sway with tilt/bounce while retaining seismic-grade/base-isolation scaling), `src/App.jsx` (`earthquakeCountdown` state), `src/components/Scene.jsx`, `src/App.css`. Implementation note: all game-feel cues derive from the existing magnitude, `seismic_grade`, and `base-isolation` logic. |
| Weather & Hazard Visual Wow | `src/components/FireEffects.jsx` (new - flame columns, smoke plumes, heat rings, embers, point lights, hazard labels), `src/components/WindStreamlines.jsx` (new - animated wind-field ribbons and speed beads), `src/components/RainSimulation.jsx` (storm streaks + splash rings), `src/components/FirePanel.jsx` (editable scenario intensity slider + Ignite Test Part), `src/components/Scene.jsx` (renders visual FX from existing wind/water/fire state), `src/App.jsx` (`fireIntensity` affects spread/failure timing), `src/App.css` (hazard labels + fire controls). Implementation note: this is a presentation layer on top of existing engineering data; fire state, wind speed, and water pressure logic remain the source of truth. |
| Crane Swing Path Planner + Cab View | `src/components/Crane.jsx` (GSAP jib slew to liftStart/liftEnd angles, sweep arc SectorMesh, lift point spheres), `src/components/CranePanel.jsx` (Plan Lift section, Cab View button), `src/components/SiteGrid.jsx` (liftPlanMode click handler), `src/components/Scene.jsx` (craneCabView→CameraController, lift props to Crane, crane now visible in site mode), `src/App.jsx` (`liftPlanMode`, `liftStart`, `liftEnd`, `craneCabView` state) |
| Fire Spread Simulation + Compartment Visualizer | `src/components/FirePanel.jsx` (new — timer, status list, extinguish), `src/components/FireCompartments.jsx` (new — AABB wireframe per compartment, BSL check), `src/components/Part.jsx` (`fireMode`/`fireStatus`/`onIgnite` props, emissive overrides), `src/App.jsx` (`fireMode`, `fireState`, `fireElapsed`, `showFireCompartments`, `fireBurnStartRef`, propagation interval), `src/components/Toolbar.jsx` (`Flame`+`Shield` icons), `src/components/Scene.jsx` (renders FireCompartments, passes fire props to Part) |
| Group C Material Overlays | `src/components/ThermalOverlay.jsx` (new — pulsing connection midpoint thermal bridge nodes), `src/components/SupplyRiskPanel.jsx` (new — Supply tab, shortage simulation), `src/utils/materialMetrics.js` (new — derived thermal/risk/STC defaults), `src/components/Part.jsx` (`showAcoustic` color/STC labels), `src/components/InfoPanel.jsx` (thermal/STC/risk stats), `src/components/MetricsPanel.jsx` (Supply tab + BOM risk badges), `src/components/KitContext.jsx` (normalizes legacy variants), `src/components/Toolbar.jsx` (`Thermometer` + `Volume2` icons), `src/components/Scene.jsx`, `src/App.jsx`, `src/App.css` |
| Prefab Factory Layout Planner | `src/components/FactoryGrid.jsx` (new — production bays, capacity warnings, drag-to-reorder, sequence labels, flat part layout), `src/components/KitContext.jsx` (`updatePartSequences`), `src/App.jsx` (`factoryMode` state + mode toggling), `src/components/Toolbar.jsx` (`Factory` icon), `src/components/Scene.jsx` (factory scene swap + camera), `src/App.css` |
| Advanced sample kit | `public/advanced-kit.json` (new — 12-part demonstrator for current overlays/simulations), `src/components/KitContext.jsx` (`loadBundledKit`), `src/components/Sidebar.jsx` (Basic/Advanced/Eco/Premium sample buttons), `src/App.css` |
| Water Simulation | `src/components/RainSimulation.jsx` (new — instanced rain particles + puddle accumulation), `src/components/WaterPressure.jsx` (new — wind-driven pressure heatmap planes), `src/App.jsx` (`showWaterSim` state), `src/components/Scene.jsx`, `src/components/Toolbar.jsx` (`Droplets` icon, disabled in site/game mode) |
| Floor Plan Auto-Generator | `src/components/FloorPlanPanel.jsx` (new — canvas 2D projection, SVG export), `src/App.jsx` (`showFloorPlan` state), `src/components/Toolbar.jsx` (`LayoutTemplate` icon) |
| Wind Load Arrows | `src/components/WindArrows.jsx` (new — cone+cylinder arrows per face, pulsing via useFrame), `src/components/Scene.jsx`, `src/components/Toolbar.jsx` (`Wind` icon), `src/App.jsx` (`showWindArrows`, `windSpeed` state), `src/components/CranePanel.jsx` (`onWindChange` callback lifts windSpeed to App) |
| Multi-Crane Collision Zone | `src/components/Crane.jsx` (`offsetX`/`offsetZ` props), `src/components/Scene.jsx` (second Crane instance + collision disc mesh), `src/components/CranePanel.jsx` (Add Crane toggle + X slider + warning badge), `src/App.jsx` (`showSecondCrane`, `secondCraneX` state) |
| Construction Schedule / Gantt | `src/components/GanttPanel.jsx` (new), `src/components/MetricsPanel.jsx` (Schedule tab added), `src/App.jsx` (`highlightedWeek` state), `src/components/Scene.jsx` + `Part.jsx` (week dim/glow on highlight) |
| Earthquake Shake Simulation | `src/components/EarthquakePanel.jsx` (panel, verdict logic), `src/components/Part.jsx` (+`isShaking`, `earthquakeMagnitude` props, GSAP shake loop), `src/App.jsx` (`showEarthquake`, `earthquakeMagnitude`, `isShaking`, `hasShaken` state + `handleShake`), `src/components/Toolbar.jsx` (`Activity` icon button), `src/components/Scene.jsx` (passes shake props to Part) |
| OG / Twitter meta tags | `index.html`, `public/og-preview.png` (static asset, needs manual screenshot) |
| Screenshot Share button | `src/components/ShareButton.jsx`, `src/App.jsx` (`handleShare`, `shareMetrics`), `src/components/Scene.jsx` (`preserveDrawingBuffer`) |
| Cinematic Demo Mode (DEMO button) | `src/components/CinematicMode.jsx`, `src/components/Toolbar.jsx`, `src/App.jsx`, `src/components/Scene.jsx` |
| AI Carbon Optimiser (✦ AI tab) | `src/components/AIOptimiserPanel.jsx`, `src/components/MetricsPanel.jsx` (`onVariantChange` prop added) |

---

## Decision Log Convention
When a non-obvious choice is made (a tradeoff, "why this over that", a convention to
follow or avoid), record it — in this repo's decision log / CLAUDE.md "Key decisions"
/ commit body — using these fields:
- **Decision:** what was chosen
- **Why:** the reasoning (the cause behind the effect)
- **Alternative:** what was rejected, and why
- **Revisit when:** the condition that would reopen this *(optional)*
- **Confidence:** low / med / high

Only for decisions that are hard to reverse or likely to recur. Skip mechanical changes.
