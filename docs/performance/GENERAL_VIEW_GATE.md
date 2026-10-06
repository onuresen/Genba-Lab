# General-view gate before IFC

This gate must pass before Kit-of-Parts is copied, extracted into a shared 3D
foundation, or used as the starting point for the IFC Sandbox.

## What the gate proves

- A stationary viewer does not continuously submit WebGL frames.
- Orbit, pan, zoom, selection, focus, sectioning, and GSAP transitions settle
  back to demand rendering.
- Static feature UI and completed results do not silently select an always-on
  render loop.
- Only visible effects with real per-frame motion request continuous rendering.
- Repeated mode changes do not produce unbounded renderer-resource growth.

## Built-in diagnostics

Open the application with `?perf=1`, for example:

```text
http://localhost:5173/Kit-of-Parts/?perf=1
```

The page exposes a read-only diagnostic API in the browser console:

```js
window.__KOP_PERF__.reset()
window.__KOP_PERF__.read()
```

`read()` reports the R3F frameloop, the exact reasons for continuous rendering,
frame counts, time since the last frame, and Three.js renderer statistics. The
diagnostic component does not poll or invalidate the scene.

The WebGL canvas also mirrors readiness, frame count, frameloop, last-frame
time, continuous reasons, draw statistics, and renderer memory counts as
`data-kop-perf-*` attributes. These attributes make browser automation possible
without adding a visible performance panel.

## Acceptance checks

1. Load the default model, reset the counter, wait five seconds, and read it.
   `frameloop` must be `demand`, `continuousReasons` must be empty, and the
   frame count must stop increasing after the initial settling work.
2. Repeat after orbit, pan, zoom, select, clear selection, focus, section-cut
   adjustment, camera preset, explode/reassemble, and crane open/close.
3. Run an earthquake. Continuous rendering is allowed only while `isShaking`
   is true. The post-event verdict and markers must remain visible at `demand`.
4. Open fire mode without igniting a part. It must remain at `demand`. Igniting
   a part must report `fire-effects`; extinguishing must return to `demand`.
   Fire propagation pauses while regular-view effects are hidden by site or
   factory mode.
5. Water, thermal, wind, clouds, and stars must each name their own continuous
   reason while visible and remove it when disabled.
6. Switch regular/site/factory modes ten times. Compare `renderer.textures` and
   `renderer.geometries` after the first warm cycle and the last cycle. Counts
   may cache to a stable high-water mark but must not grow every cycle.
   Keep the `ContactShadows` capture footprint stable: the current Drei version
   allocates two new render-target textures whenever its size changes.
7. Measure browser-process GPU usage only after unrelated GPU processes have
   been identified. Fan speed and whole-GPU utilization are supporting signals,
   not proof of application work.

## Automated logic check

```bash
npm run test:render-gate
```

The unit test guards which states are allowed to select continuous rendering.
It complements, but does not replace, the browser acceptance checks.

## Current boundary

This milestone does not introduce IFC, a new application, a state framework,
ECS, or a reusable 3D-core package. It improves and measures the existing
viewer in place.
