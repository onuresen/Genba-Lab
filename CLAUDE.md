# Genba Lab

> Real building models, real what-ifs. A BIM simulation playground in the browser.
> Load an IFC file; every element becomes a part that all simulations read.
> Grew out of [Kit-of-Parts](https://github.com/onuresen/Kit-of-Parts) (commit `7ed9eab`). Block-kit features were removed; see Key decisions.

## Keeping This File Up to Date

After every session that adds, removes, or significantly changes a feature, update this file:
the Component Map, the App state table, the Backlog, and any implementation notes.
A future session should not need to re-read the codebase to understand the project.

---

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

---

## Project Overview

**Dev server:** `npm run dev` (Vite, localhost:5173)
**Build:** `npm run build` → `dist/`
**Tests:** `npm test` (all) · `npm run test:ifc` (web-ifc headless) · `npm run test:crane` · `npm run test:render-gate`
**Deploy:** GitHub Pages via `.github/workflows/deploy.yml` on push to `main` (runs `npm test`, then build). `vite.config.js` base is `./`, so the build works at any path.
**Live:** https://onuresen.github.io/Genba-Lab/

Focus: architects and engineers, with Japanese context (耐震等級, fire ratings, Ken grid, CASBEE).

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| UI | React | 19.2 |
| 3D | Three.js + @react-three/fiber | 0.183 / 9.6 |
| 3D helpers | @react-three/drei | 10.7 |
| Animation | GSAP | 3.15 |
| Icons | lucide-react | 1.8 |
| IFC | web-ifc (WASM, Web Worker) | 0.0.78 |
| Raycasting | three-mesh-bvh | 0.9 |
| Build | Vite | 8 |

No Tailwind. Styles live in `src/App.css` plus inline styles. Dark mode via `[data-theme="dark"]` on `#root-container`.

---

## Architecture

### Data model: the "kit"
Every simulation reads one array of **parts**. IFC import builds it (`ifcToKit.js`).

```json
{
  "id": "Basic Wall:150 Concrete:677469",
  "shape": "ifc",
  "ifcGeometry": "ifc-abc123:42",
  "pos": [x, y, z], "exp": [x, y, z], "size": [w, h, d],
  "sequence": 12,
  "structural_role": "primary",
  "factory_work": true,
  "fire_compartment": "Level 1",
  "is_external": true,
  "connections": [{ "to": "Column 232", "type": "bolted" }],
  "variants": [
    { "label": "Concrete, Cast-in-Place gray", "material_class": "Concrete",
      "color": "#c0c0c0", "meta": "From IFC: … Estimated: …",
      "weight_kg": 3048, "unit_cost_usd": 508, "labor_cost_usd": 152, "carbon_kgco2e": 457,
      "lead_time_days": 21, "assembly_time_min": 25,
      "seismic_grade": 2, "fire_resistance_grade": "1hr",
      "thermal_conductivity_wpmk": 1.7, "stc_rating": 48,
      "ifc_entity": "IfcWall", "ifc_property_set": { "GlobalId": "…", "Material": "…" },
      "ifc_psets": { "Pset_WallCommon": { "LoadBearing": true } } },
    { "label": "Timber (what-if)", "what_if": true, "…": "…" }
  ]
}
```

- `variants[0]` is the model as imported. Structural parts also get what-if variants (other materials).
- `selectedVariants[partId]` (App state) picks the active variant everywhere.
- Meshes are not in the kit. `ifcGeometry` is a key into IndexedDB (`ifcGeometryStore.js`).

### State (3 layers)

**1. `KitContext.jsx`** — persistent
- `parts[]` (undo/redo, 30 steps), `presets[]`, `projectSettings` (`currency`, `source.modelKey`, …)
- Starts empty. Restores the last IFC model from localStorage `genba-lab-model` (only if `projectSettings.source.type === 'ifc'`).
- Exposes `loadKitData`, `updatePartSequences`, `addConnection`, `removeConnection`, `savePreset`, `removePreset`, `undo`, `redo`, `canUndo`, `canRedo`, `formatCurrency`.

**2. `App.jsx`** — session state

| State | Purpose |
|---|---|
| `exploded`, `selected`, `visible`, `selectedVariants`, `activePreset` | View + selection |
| `sequenceMode`, `sequenceStep` | Assembly sequence |
| `showMetrics`, `showDimensions`, `showConnections` (default off) | Overlays |
| `sectionCutActive`, `sectionCutY` | Section cut |
| `envSettings` `{ grass, time, clouds, stars, kenGrid }` | Environment |
| `factoryMode` | Prefab factory planner |
| `cameraCmd` `{ type: 'preset'\|'frame', …, ts }` | Camera commands (change `ts` to re-fire) |
| `darkMode` (localStorage `genba-lab-dark`), `showShortcuts`, `mobileSidebarOpen` | UI |
| `showCrane`, `showCraneRadius`, `showSecondCrane`, `secondCraneX`, `liftPlanMode`, `liftStart`, `liftEnd`, `craneCabView` | Crane |
| `showWindArrows` (wind sim on), `windSpeed` (BSL V0, m/s), `windDir` (from, deg), `windTerrain`, `windResult` | Wind |
| `showWaterSim`, `rainfall` (mm/h), `waterResult` | Rain & water flow |
| `showThermal`, `showAcoustic` | Material overlays |
| `fireMode`, `fireState`, `fireElapsed`, `fireIntensity`, `showFireCompartments` | Fire |
| `showEarthquake`, `quakePga` (g), `quakeMotion` (`near`\|`far`), `quakeSystem` (`standard`\|`damped`\|`isolated`), `quakeDir` (`x`\|`z`), `isShaking`, `hasShaken`, `earthquakeCountdown` | Earthquake. Derived (useMemo): `quakeModel`, `quakeResult`, `quakeRisks` (part → damage level) |
| `highlightedWeek` | Gantt hover |
| `cinematicMode`, `rendererRef` | Demo tour, screenshots |
| `showFloorPlan` | Floor plan modal |

**3. Component-level** — hover, refs, panel tabs.

### Scale: everything follows the model
Real models are 20–100 m, not the 5 m Kit-of-Parts kit. Never hard-code world sizes.
- `utils/modelMetrics.js`: `modelFrame(parts)` (centre, size, radius), `cameraViews(frame)` (presets + home), `estimateFloorArea(parts)` (Σ storey footprints).
- `utils/craneLayout.js`: crane position, jib, height, capacity from the model.
- `utils/factoryLayout.js`: bay grid sized to the part count.
- Scene passes `frame` to the camera, demo tour, earthquake ground effects, Ken grid and ground shadow.

### Camera
- `setCameraCmd({ type: 'preset', preset: 'front', ts: Date.now() })`. Presets: `front`, `back`, `top`, `bottom`, `right`, `left`, `home`.
- Views come from `cameraViews(frame)`; distance = max(14 m, radius × 2.6).
- Commands run last, use `overwrite: true`, and re-run when drei swaps the camera on mount.
- App frames the model once per `projectSettings.source.modelKey`, and frames model + crane when the crane turns on.

---

## IFC Import

- `IfcLoadButton` → `importIfcFile` (worker) → `ifcToKit` → `KitContext.loadKitData`.
- One part per element. Over 120 elements: one part per storey + IFC class (`MAX_INDIVIDUAL_PARTS`).
- Sequence: storey → build order (footing, slab, column, beam, wall, …) → height. `fire_compartment` = storey.
- Connections: touching bounding boxes (2 cm), max 6 per part.
- From IFC when present: material, FireRating, LoadBearing, IsExternal, AcousticRating, NetVolume/NetWeight, SeismicGrade.
- Estimated: cost, carbon, weight/volume fallback (mesh volume × density), seismic grade (structural → 2, other → 1).
- Each variant's `meta` lists "From IFC" vs "Estimated".
- What-if variants (`ifcProperties.whatIfVariants`): structural classes get the other two of Concrete / Steel / Timber. Volume × equivalence factor (steel 0.06, timber 1.4 vs concrete). Indicative.

## Component Map

### 3D
| File | Role |
|---|---|
| `Scene.jsx` | Canvas host, camera controller, ground, all overlays. On-demand render loop (see Performance). |
| `Part.jsx` | One part: IFC mesh (box fallback), explode/sequence tweens, earthquake sway shader, hover, clipping, fire/acoustic/week/quake tints. Edges hide while shaking. |
| `Connection.jsx` | Lines between connected parts (toggle `showConnections`). |
| `Crane.jsx` | Tower crane from `craneLayout`; slews to parts in sequence mode; lift-plan sweep. |
| `CinematicMode.jsx` | Scripted demo tour, scaled by `frame`. |
| `FactoryGrid.jsx` | Prefab bay planner: real meshes, transport-size/weight/lead-time warnings, drag to resequence. |
| `DimensionLines.jsx` | Model width/height/depth. |
| `WindLoad.jsx` | Wind on real surfaces: pressure heat map (blue in / red out), pressure arrows, streamlines around the model, peak labels. |
| `WaterFlow.jsx` | Rain runoff on real surfaces: flow lines, moving droplets, ponds, drip zones, rain streaks. Recomputes on visibility / rainfall change. |
| `FireEffects.jsx`, `FireCompartments.jsx` | Fire visuals; compartment boxes by storey vs BSL 500 m². |
| `EarthquakeEffects.jsx` | Camera rumble, ground rings/faults (scaled), damage markers on parts of damaged storeys. |
| `QuakePlayback.jsx` | Replays the computed response: writes floor displacements (× sway scale) into the shader uniforms each frame. |
| `ThermalOverlay.jsx` | Thermal bridge nodes at connections. |
| `ViewCube.jsx` | Navigation cube. |
| `RenderDiagnostics.jsx` | `?perf` render-loop diagnostics. |

### Panels
| File | Role |
|---|---|
| `Toolbar.jsx` | All toggles. |
| `Sidebar.jsx` | Presets, layers, factory summary, `IfcLoadButton`. |
| `IfcLoadButton.jsx` | LOAD IFC + progress. Also on the empty start screen. |
| `InfoPanel.jsx` | Selected part: IFC data, variants (incl. what-if), stats, connections, environment. |
| `MetricsPanel.jsx` | Tabs: cost, carbon (per m² of estimated floor area, RIBA, CASBEE), BOM (CSV export), prefab, structural, supply, AI, schedule. BSL/JIS UI hides when the model has no such data. |
| `AIOptimiserPanel.jsx` | Lowest-carbon variant per part that keeps the seismic grade. |
| `SupplyRiskPanel.jsx` | Lead-time risk, shortage simulation. |
| `GanttPanel.jsx` | Schedule by week; highlights parts in 3D. |
| `CranePanel.jsx` | Crane specs, live lift load, wind (gusty demo, or the wind sim's speed at jib height), lift path planner, cab view, second crane. |
| `EarthquakePanel.jsx` | PGA + 震度 presets, near / far motion, X / Z, 耐震 / 制振 / 免震; building (storeys, mass, period, 耐震等級); verdict, drift, top movement, floor shaking, strength used, isolator movement, traces, storey table. |
| `FirePanel.jsx` | Simulation controls + verdicts. |
| `WindPanel.jsx` | V0 + presets (to super typhoon 46), direction (8), terrain; top speed, push (base shear), peak pressure/suction, overturning, force by height, parts lifted more than their weight. |
| `RainPanel.jsx` | Rainfall (mm/h, presets up to ゲリラ豪雨 100), catchment, runoff, pond/ground/drain shares, where water collects. |
| `FloorPlanPanel.jsx` | 2D plan, SVG export. |
| `ShortcutsModal.jsx`, `ShareButton.jsx` | Shortcuts (E D L M X F S 0-3 ?), screenshot share. |

### Utils
| File | Role |
|---|---|
| `ifcParse.js` | IFC → element records (mesh, class, storey, colour, psets, materials). |
| `ifcProperties.js` | Material table, rating parsers, `combineFacts`, `estimateSeismicGrade`, `whatIfVariants`. |
| `ifcToKit.js` | Elements → kit. |
| `ifcImport.js`, `../workers/ifcWorker.js` | Browser import pipeline. |
| `ifcGeometryStore.js` | Mesh store (memory + IndexedDB `genba-lab-meshes`), `useIfcGeometry`. |
| `modelMetrics.js`, `craneLayout.js`, `factoryLayout.js` | Model-scale helpers (see Scale). |
| `materialMetrics.js` | Default thermal / supply-risk / STC values and colours. |
| `renderActivity.js` | Which effects need a continuous render loop. |
| `seismic.js` | Earthquake engine: `buildStoreyModel`, `groundMotion`, `simulateQuake`, `driftLevel`, `jmaIntensity`, `swayScale`, `storeyIndexOf`. Pure, tested. |
| `quakeDeform.js` | Shared sway uniforms + `quakeCompile` (onBeforeCompile) for part materials. |
| `worldMesh.js` | `partWorldEntries(parts, visible, skip)`: world triangles for raycast sims. |
| `windLoad.js` | Wind engine: BSL `heightFactor`, `gustFactor`, `velocityPressure`, `windVector`, `computeWindLoad`, `windStreamlines`. Pure, tested. |
| `waterFlow.js` | Runoff engine (three-mesh-bvh): `buildCollisionMesh`, `traceDrop`, `simulateRunoff`, `isDrainPart`. Pure, tested. |

---

## Rain & water flow

- Rain falls straight down on a grid (≤ 2500 samples) over the visible model; first surface hit = landing.
- Water runs downhill along the surface (gravity projected on the face). At an edge it drips to the next surface or the ground (y = 0).
- Stops: pond (slope < 0.5 %, or stuck in a low point), drain (bbox of a drain part), ground.
- Flow per sample = cell area × rainfall. Results grouped into pools; shares by pond / ground / drain.
- Part lookup uses the hit triangle's first **vertex** (`vertexPart`): MeshBVH reorders the index buffer.
- Simulates assembled positions of visible parts. Uses loaded meshes (`getCachedGeometry`), box fallback.
- Indicative: no infiltration, gutter capacity, or pond overflow.

## Wind

- BSL method, simplified (告示1454): Er(z) = 1.7 (max(z, Zb)/ZG)^α, q = 0.6 Er² Gf V0². Terrain II/III/IV = open/suburban/city.
- Cp: windward +0.8 (q at its height), leeward −0.4, side −0.7, flat roof −1.0, steep windward roof +0.3, sheltered −0.3 (q at the top).
- Per triangle of the merged mesh. Skipped: undersides, faces touching or inside another part (ray parity per part), roofs with something above.
- Windward faces with something upwind are sheltered.
- Outputs: base shear, overturning, peak pressure/suction, force by height (10 bands), force per part (uplift vs weight).
- Streamlines: march downwind; when blocked, step up or sideways; drift back once clear.
- North = −Z of the model. Indicative: no wind tunnel, no internal pressure.
- Sim panels (crane, rain, wind, fire, earthquake) live in `.sim-dock` (bottom-right stack).

## Earthquake

- Shear building. Storeys = IFC storeys (`fire_compartment`), merged under 2 m, max 23. Part weight lumped at the two levels around its centre.
- Period T = H (0.02 + 0.01 α), α = steel/timber share of structural weight (BSL). Storey stiffness shaped for uniform drift, scaled to T. 耐震等級 2/3 = 1.25×/1.5× stiffer and stronger.
- Systems: 耐震 ζ 5 % (−3 % × α), 制振 ζ 15 %, 免震 isolation layer T 3.5 s, ζ 20 %, 60 cm gap.
- Ground motion: Kanai-Tajimi sum of sines × envelope, seeded, scaled to PGA. Near fault (16 s, pulse) / long and far (26 s).
- Newmark average acceleration, dt 0.01 s. Output: frames (0.02 s), drift ratio, floor accel, storey shear, roof / isolator movement, base shear coefficient.
- Yield: strength coefficient 0.35 (RC) … 0.30 (steel) × grade factor. Demand above it raises drift (equal energy for short periods) and sets at least "Minor cracks" (> 2×: "Damage").
- Damage by drift: 1/200, 1/100, 1/50, 1/30.
- Playback: vertex shader moves each vertex by the displacement at its world height (columns lean). Sway enlarged to ~6 % of height (×1–100), shown in the panel.
- Results are computed when inputs change; Shake only replays them. Indicative: linear + yield correction, no torsion, no soil.

## Key decisions

- **Decision:** IFC elements become normal kit parts; meshes live outside the kit JSON.
  - **Why:** Every simulation already works on parts. Mesh data is too big for localStorage.
  - **Alternative:** A separate read-only viewer layer. Rejected: no simulation would see it.
  - **Revisit when:** a model needs real cost or carbon data (cost pset, EPD link).
  - **Confidence:** med
- **Decision:** Removed block-kit features (sample kits, kit JSON I/O, window/door/cylinder/GLB, Builder, Site, Game) and the PDF/IFC exports.
  - **Why:** Genba Lab is for real models. The box IFC export downgraded the user's own file; the per-part PDF was 100+ pages.
  - **Alternative:** Hide behind flags. Rejected: dead code for no user.
  - **Revisit when:** a feature is needed again; port it from Kit-of-Parts.
  - **Confidence:** high
- **Decision:** Crane, camera, factory, ground effects and per-m² metrics scale from the model.
  - **Why:** Fixed 5 m-kit numbers put the camera and crane inside real buildings and divided carbon by 16 m².
  - **Confidence:** high
- **Decision:** Water flow is a raycast drop tracer on the real meshes (three-mesh-bvh), not a fluid solver.
  - **Why:** Shows where water lands, flows and collects on any IFC in < 0.2 s. A fluid solver would be slow and need a watertight mesh.
  - **Alternative:** Heightfield / shallow-water grid. Deferred: loses overhangs and multi-level roofs.
  - **Revisit when:** pond depth or overflow timing matters.
  - **Confidence:** med
- **Decision:** Wind load uses the BSL formula on the real mesh, with ray-based shelter.
  - **Why:** Real numbers (kN, kPa) a Japanese engineer recognises, on any IFC, in about a second.
  - **Alternative:** CFD. Rejected: far too slow for the browser.
  - **Revisit when:** tall or odd-shaped buildings need real Cp (wind tunnel data).
  - **Confidence:** med
- **Decision:** Earthquake = shear-building time history from IFC storeys and weights; sway via a vertex shader.
  - **Why:** Real drift / acceleration per storey that reacts to materials, 耐震等級 and 免震, in milliseconds. The shader shows true storey deformation with no React re-render.
  - **Alternative:** Random GSAP shake per part (old). Rejected: no physics. Full FEM: too heavy, needs member data.
  - **Revisit when:** torsion or soft storeys from real stiffness matter.
  - **Confidence:** med
- **Decision:** What-if material variants use volume equivalence factors, not re-design.
  - **Why:** Gives instant, comparable what-ifs from IFC data alone.
  - **Alternative:** Structural sizing per material. Deferred: needs loads and spans.
  - **Revisit when:** results drive real decisions.
  - **Confidence:** low (indicative only; labelled in the UI)

---

## Conventions

- Panel styles in `src/App.css`, grouped by `/* ─── Component ─── */` headers. Dark mode: `[data-theme="dark"] .class`.
- Toolbar: `.tb-btn`, `.tb-btn--active`. Metrics tabs: `.metrics-tab`.
- UI text: short, simple English. Label every estimate as an estimate.

## Performance

- **On-demand render loop.** `frameloop={continuousActive ? 'always' : 'demand'}`. GSAP tweens pump frames via `<GsapBridge>`. A component with a continuous (non-GSAP) `useFrame` must add its flag to `getContinuousRenderReasons` (`renderActivity.js`) or it freezes.
- `<Html>` reprojects every frame. Big models: explode labels hide above 30 parts (`COMPACT_LABEL_LIMIT`), factory bay labels and earthquake stress labels show on hover / below 30.
- `Part` is `React.memo`; per-part handlers from App must be `useCallback`-stable.
- Headless test note: in swiftshader, GSAP lag smoothing stretches 1 s camera tweens over many slow frames. Wait 20–30 s before screenshots.

---

## Backlog (Phase 3 ideas, not started)

Build it
1. Construction timeline scrubber (day-by-day build, crews, crane lifts).
2. Time-lapse video recording (MediaRecorder on the canvas + demo tour).
3. Site logistics (deliveries in sequence order, laydown areas, crane reach).

Stress it
4. Shadow study / 日影規制 (sun by date + location, shadow on neighbours).
5. "Remove this column" load-path check (indicative, from connections).
6. Flood level + typhoon wind (reuse water flow for ground ponding).
7. Evacuation agents (doors and storeys from IFC).

Decide
8. Material what-if in bulk (all slabs → CLT; carbon, weight, crane load update).
9. Model compare (two IFC versions, diff by GlobalId).

Future
10. Digital-twin sensors (virtual IoT heatmaps).
11. Drone facade inspection path (IsExternal parts).
12. WebXR walk-through.

---

## Decision Log Convention
When a non-obvious choice is made, record it (here under Key decisions, or in the commit body) with:
**Decision**, **Why**, **Alternative**, **Revisit when** (optional), **Confidence** (low / med / high).
Only for decisions that are hard to reverse or likely to recur.
