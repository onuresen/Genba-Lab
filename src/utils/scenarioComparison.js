export function createScenarioSnapshot({ scenarioId, label, inputs, metrics, affectedIds = [], caveat }) {
  return {
    scenarioId,
    label,
    capturedAt: new Date().toISOString(),
    inputs: { ...inputs },
    metrics: metrics.map(metric => ({ ...metric, value: Number(metric.value) })),
    affectedIds: [...new Set(affectedIds)].sort(),
    caveat,
  }
}

export function compareScenarioSnapshots(baseline, alternative) {
  if (!baseline || !alternative) return null
  if (baseline.scenarioId !== alternative.scenarioId) {
    throw new Error('Baseline and alternative must use the same scenario type.')
  }

  const alternativeMetrics = new Map(alternative.metrics.map(metric => [metric.key, metric]))
  const metrics = baseline.metrics.flatMap(base => {
    const next = alternativeMetrics.get(base.key)
    if (!next || !Number.isFinite(base.value) || !Number.isFinite(next.value)) return []
    return [{
      key: base.key,
      label: base.label,
      unit: base.unit ?? next.unit ?? '',
      baseline: base.value,
      alternative: next.value,
      delta: next.value - base.value,
      deltaPct: base.value === 0 ? null : ((next.value - base.value) / Math.abs(base.value)) * 100,
    }]
  })

  const before = new Set(baseline.affectedIds)
  const after = new Set(alternative.affectedIds)
  return {
    scenarioId: baseline.scenarioId,
    metrics,
    newlyAffected: alternative.affectedIds.filter(id => !before.has(id)),
    relieved: baseline.affectedIds.filter(id => !after.has(id)),
    unchanged: alternative.affectedIds.filter(id => before.has(id)),
  }
}
