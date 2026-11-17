# Group 3: Scenario Comparison

Scenario Comparison turns the Group 1 next-comparison prompt into two captured evidence states: Baseline and Alternative.

## Capture contract

A comparison can be captured only after the active investigation has produced evidence. Both captures must use the same scenario type. Each snapshot records:

- the scenario inputs;
- a small set of result metrics;
- the model element IDs affected by that run;
- the scenario's existing limitation statement;
- the capture time.

Captures are session state and reset when another IFC model is loaded. They do not modify the model, variants, or simulation results.

## Scenario evidence

- Earthquake: worst-storey drift, top movement, strength used, and structurally damaged elements.
- Wind: base shear, peak pressure, overturning moment, and exposed elements carrying force.
- Rain: runoff, ponding/drain shares, and ponding elements.
- Fire: failed elements, elapsed time, and all touched fire-state elements after the fire is out.
- Crane: current lift weight and the active sequence element.

## Comparison result

The workbench shows baseline-to-alternative metric deltas plus newly affected, relieved, and unchanged element counts. Element IDs can be expanded for auditability.

A positive or negative delta is not automatically labelled better or worse: interpretation depends on the metric and the changed input. The comparison remains indicative and is not a verified redesign.
