# Group 0: Product spine and performance budget

Genba Lab tests real models and imported product systems. Assembly Lab authors ideal product systems. They remain separate applications and exchange a small, versioned document rather than sharing runtime code.

## Shared contract v1

The canonical envelope is implemented in `src/contracts/productSystem.js` in both repositories. Its stable top-level fields are:

- `schema`, `version`, `id`, `name`
- `parts`: physical components and active variants
- `interfaces`: explicit connection/interface definitions
- `rules`: compatibility, manufacture, transport, or assembly constraints
- `scenarios`: portable scenario inputs, never cached results
- `provenance`: source identity and which values are observed, declared, or estimated

Existing kit and IFC projections remain valid internal models. Adapters into this envelope will be added with the workflows that need them; Group 0 does not migrate saved browser data.

## Performance budgets

These are regression gates, not engineering guarantees:

| Measure | General view | Active scenario |
|---|---:|---:|
| Idle render loop | 0 continuous fps | n/a |
| Interaction p95 frame | <= 33 ms | <= 50 ms |
| Initial JS (gzip) | <= 500 kB | n/a |
| Lazy secondary panel chunk | <= 180 kB | <= 180 kB |
| Always-mounted HTML labels | <= 30 | <= 80 |

Measure a production build on a mid-range laptop at 1440 x 900 using the bundled sample model. Record the browser, model, viewport, median and p95 frame time. A budget failure blocks additional visual effects until it is explained or corrected.

## Loading policy

- The 3D core and primary inspection UI may load at startup.
- Metrics, reports, floor plan and simulation control panels load on first use.
- Simulation visuals mount only while their scenario is active.
- One scenario owns continuous rendering at a time unless a combined test explicitly requires more.
- Source facts and results remain available when presentation effects are reduced or disabled.
