import { useState } from 'react'
import { Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react'

// Pure rule engine: finds the lowest-carbon variant per part that still
// satisfies the part's current seismic grade requirement.
function runOptimiser(parts, selectedVariants) {
  const recs = []

  for (const part of parts) {
    const currentIdx = selectedVariants[part.id] ?? 0
    const currentVariant = part.variants[currentIdx]
    if (!currentVariant) continue

    const currentCarbon = currentVariant.carbon_kgco2e ?? 0
    const currentSeismic = currentVariant.seismic_grade ?? 0

    let bestIdx = currentIdx
    let bestCarbon = currentCarbon

    part.variants.forEach((v, i) => {
      if (i === currentIdx) return
      const carbon = v.carbon_kgco2e ?? 0
      const seismic = v.seismic_grade ?? 0
      // Must meet or exceed current seismic grade, and have lower carbon
      if (seismic >= currentSeismic && carbon < bestCarbon) {
        bestCarbon = carbon
        bestIdx = i
      }
    })

    if (bestIdx !== currentIdx) {
      const suggestedVariant = part.variants[bestIdx]
      recs.push({
        partId: part.id,
        partColor: currentVariant.color,
        currentIdx,
        suggestedIdx: bestIdx,
        currentLabel: currentVariant.label,
        suggestedLabel: suggestedVariant.label,
        carbonSaving: Math.round(currentCarbon - bestCarbon),
        costDelta: Math.round((suggestedVariant.unit_cost_usd ?? 0) - (currentVariant.unit_cost_usd ?? 0)),
      })
    }
  }

  return recs.sort((a, b) => b.carbonSaving - a.carbonSaving)
}

export default function AIOptimiserPanel({ parts, selectedVariants, onVariantChange }) {
  const [ran, setRan] = useState(false)
  const [recs, setRecs] = useState([])
  const [applied, setApplied] = useState(new Set())

  function handleOptimise() {
    const results = runOptimiser(parts, selectedVariants)
    setRecs(results)
    setApplied(new Set())
    setRan(true)
  }

  function handleApply(rec) {
    onVariantChange(rec.partId, rec.suggestedIdx)
    setApplied(prev => new Set(prev).add(rec.partId))
  }

  function handleApplyAll() {
    recs.forEach(rec => {
      if (!applied.has(rec.partId)) {
        onVariantChange(rec.partId, rec.suggestedIdx)
      }
    })
    setApplied(new Set(recs.map(r => r.partId)))
  }

  const totalSaving = recs.reduce((s, r) => s + r.carbonSaving, 0)
  const unapplied = recs.filter(r => !applied.has(r.partId))

  return (
    <div className="ai-panel">
      <div className="ai-intro">
        <Sparkles size={14} style={{ color: '#3498db', flexShrink: 0 }} />
        <span>
          Scans every part for a lower-carbon variant that still meets the current seismic grade. No data leaves your browser.
        </span>
      </div>

      {!ran ? (
        <button className="ai-run-btn" onClick={handleOptimise}>
          <Sparkles size={13} />
          Optimise for Carbon
        </button>
      ) : (
        <>
          {recs.length === 0 ? (
            <div className="ai-empty">
              <CheckCircle2 size={20} style={{ color: '#27ae60' }} />
              <span>Already at minimum carbon — no swaps found.</span>
            </div>
          ) : (
            <>
              <div className="ai-summary">
                Switching <strong>{unapplied.length}</strong> variant{unapplied.length !== 1 ? 's' : ''} saves{' '}
                <strong style={{ color: '#27ae60' }}>{totalSaving} kg CO₂e</strong>
              </div>

              {unapplied.length > 1 && (
                <button className="ai-apply-all-btn" onClick={handleApplyAll}>
                  Apply all {unapplied.length} suggestions
                </button>
              )}

              <div className="ai-recs">
                {recs.map(rec => {
                  const isApplied = applied.has(rec.partId)
                  return (
                    <div key={rec.partId} className={`ai-rec ${isApplied ? 'ai-rec--applied' : ''}`}>
                      <div className="ai-rec-header">
                        <span className="bom-swatch" style={{ background: rec.partColor }} />
                        <span className="ai-rec-part">{rec.partId}</span>
                        <span className="ai-rec-saving">−{rec.carbonSaving} kg CO₂e</span>
                      </div>
                      <div className="ai-rec-swap">
                        <span className="ai-rec-label">{rec.currentLabel}</span>
                        <ArrowRight size={12} style={{ color: '#95a5a6', flexShrink: 0 }} />
                        <span className="ai-rec-label ai-rec-label--new">{rec.suggestedLabel}</span>
                        <span className={`ai-rec-cost ${rec.costDelta > 0 ? 'ai-rec-cost--up' : rec.costDelta < 0 ? 'ai-rec-cost--down' : ''}`}>
                          {rec.costDelta > 0 ? `+$${rec.costDelta}` : rec.costDelta < 0 ? `-$${Math.abs(rec.costDelta)}` : 'same cost'}
                        </span>
                      </div>
                      {isApplied ? (
                        <div className="ai-rec-applied-badge">
                          <CheckCircle2 size={12} /> Applied
                        </div>
                      ) : (
                        <button className="ai-rec-apply-btn" onClick={() => handleApply(rec)}>
                          Apply
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <button className="ai-run-btn ai-run-btn--rerun" onClick={handleOptimise}>
                Re-analyse
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
