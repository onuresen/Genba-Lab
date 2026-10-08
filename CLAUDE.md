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
| IFC | OpenBIM Core + web-ifc (WASM, Web Worker) | 0.1.1 / 0.0.78 |
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
| `showWindArrows`, `windSpeed`, `showWaterSim` | Wind + rain |
| `showThermal`, `showAcoustic` | Material overlays |
| `fireMode`, `fireState`, `fireElapsed`, `fireIntensity`, `showFireCompartments` | Fire |
| `showEarthquake`, `earthquakeMagnitude`, `isShaking`, `hasShaken`, `earthquakeCountdown` | Earthquake |
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

- `IfcLoadButton` → `importIfcFile` → OpenBIM Core in the worker → `openBimProjection` → `ifcToKit` → `KitContext.loadKitData`.
- OpenBIM Core 0.1.1 is consumed as the exact committed package artifact in `vendor/`, built from Vibe_Coding source commit `d8a490fd`; `package-lock.json` pins its integrity and keeps the existing `npm ci` deployment reproducible.
- The core owns lossless entities, source identity, complete facts, native relationships and geometry packets. Genba's projection deliberately retains its existing display/simulation choices: class skipping, one merged mesh per element, grouping over 120 elements, estimates and touching-box connections.
- The exact IFC digest and OpenBIM Core version are retained in `projectSettings.source`; no file content is uploaded.
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
| `Part.jsx` | One part: IFC mesh (box fallback), explode/sequence/shake tweens, hover, clipping, fire/acoustic/week tints. |
| `Connection.jsx` | Lines between connected parts (toggle `showConnections`). |
| `Crane.jsx` | Tower crane from `craneLayout`; slews to parts in sequence mode; lift-plan sweep. |
| `CinematicMode.jsx` | Scripted demo tour, scaled by `frame`. |
| `FactoryGrid.jsx` | Prefab bay planner: real meshes, transport-size/weight/lead-time warnings, drag to resequence. |
| `DimensionLines.jsx` | Model width/height/depth. |
| `WindArrows.jsx`, `WindStreamlines.jsx` | Wind pressure arrows + streamlines. |
| `RainSimulation.jsx`, `WaterPressure.jsx` | Rain + pressure planes. |
| `FireEffects.jsx`, `FireCompartments.jsx` | Fire visuals; compartment boxes by storey vs BSL 500 m². |
| `EarthquakeEffects.jsx` | Camera rumble, ground rings/faults (scaled), stress markers. |
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
| `CranePanel.jsx` | Crane specs, live lift load, wind, lift path planner, cab view, second crane. |
| `EarthquakePanel.jsx`, `FirePanel.jsx` | Simulation controls + verdicts. |
| `FloorPlanPanel.jsx` | 2D plan, SVG export. |
| `ShortcutsModal.jsx`, `ShareButton.jsx` | Shortcuts (E D L M X F S 0-3 ?), screenshot share. |

### Utils
| File | Role |
|---|---|
| `openBimProjection.js` | Lossless OpenBIM Core result → Genba element records; owns class filtering, flat psets and per-element mesh merging. |
| `ifcProperties.js` | Material table, rating parsers, `combineFacts`, `estimateSeismicGrade`, `whatIfVariants`. |
| `ifcToKit.js` | Elements → kit. |
| `ifcImport.js`, `../workers/ifcWorker.js` | Browser import pipeline. |
| `ifcGeometryStore.js` | Mesh store (memory + IndexedDB `genba-lab-meshes`), `useIfcGeometry`. |
| `modelMetrics.js`, `craneLayout.js`, `factoryLayout.js` | Model-scale helpers (see Scale). |
| `materialMetrics.js` | Default thermal / supply-risk / STC values and colours. |
| `renderActivity.js` | Which effects need a continuous render loop. |

---

## Key decisions

- **Decision:** Consume the exact pinned OpenBIM Core package and keep Genba's simulation projection local.
  - **Why:** CDI and Genba can improve one source-faithful IFC parser without sharing viewers, product state or simulation assumptions.
  - **Alternative:** Keep Genba's private parser or import a sibling source folder. Rejected: both recreate drift and make clean clones depend on another checkout.
  - **Revisit when:** OpenBIM Core has an approved public package/repository release; replace the committed tarball without changing the projection contract.
  - **Confidence:** high
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
6. Flood level + typhoon wind.
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
