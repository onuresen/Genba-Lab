# Group 2: Model Readiness

Model Readiness exposes the evidence Genba Lab received from the IFC before a user interprets a simulation result.

## Coverage checks

The report measures projected parts for imported geometry, source identity, storey assignment, material, physical quantities, load-bearing role, fire rating, and external-element classification. Coverage is reported as declared, partial, or mostly inferred.

These are evidence coverage measures, not a generic model-quality score. A missing declaration can still be estimated by an existing Genba workflow, but the report keeps that boundary visible.

## Investigation readiness

Earthquake, wind, rain, fire, and crane checks each report the facts they rely on and whether the current model makes that workflow ready, indicative, or limited. The assessment uses the same projected parts and provenance text as the simulations.

Examples:

- Earthquake depends on geometry, storeys, mass/volume quantities, and structural roles.
- Wind and rain can remain ready from real geometry even when semantic classifications are incomplete.
- Fire becomes limited when ratings or storey assignments are missing.
- Crane remains indicative when lift weights are derived from geometry and material density.

## Boundaries

The panel is lazy-loaded from the Review workspace and adds no 3D work or render loop. It shows the IFC schema, OpenBIM Core version, and content digest when recorded. Readiness is not IFC certification, model validation, or engineering approval.
