# Group 1: Scenario Workbench

Genba Lab's physical simulations now share one investigation journey without merging their domain-specific controls or result models.

## Investigation structure

The workbench appears whenever earthquake, wind, rain, fire, or crane testing is active. It frames each tool as:

1. Question
2. Inputs
3. Run
4. Evidence
5. Alternative

Progress is derived from the existing simulation state. The workbench does not cache results, create a second analysis model, or claim that an input change is a verified redesign.

## Evidence boundary

- Earthquake uses the completed worst-storey result.
- Wind uses base shear and peak pressure from the BSL-derived wind result.
- Rain uses runoff and ponding locations from the surface tracer.
- Fire uses the current burning and failed element states.
- Crane uses the active build-sequence part weight and the existing lift panel.

If several simulations are open, compact tabs change which investigation the workbench explains. Existing simulation panels remain the authority for inputs, calculations, detailed results, and caveats.

## Interaction and performance

- Toolbar buttons and keyboard shortcuts focus the matching investigation.
- The workbench is collapsible and responsive on mobile.
- It is lazy-loaded with the simulation panels.
- It adds no render loop, timer, 3D work, or stored project data.

Persistent findings and formal baseline/alternative records belong to later groups. Group 1 only makes the current investigation legible and suggests a controlled next comparison.
