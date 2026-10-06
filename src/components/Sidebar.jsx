import { useState } from 'react'
import { useKit } from './KitContext'
import IfcLoadButton from './IfcLoadButton'

function EyeOpen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeClosed() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function Sidebar({
  visible, onToggle, selected, onSelect,
  selectedVariants,
  activePreset, onApplyPreset,
  factoryMode,
  isOpen, onClose,
}) {
  const { parts, presets, savePreset, removePreset, projectSettings, setProjectSettings } = useKit()
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')

  function handleSavePreset() {
    const name = presetName.trim()
    if (!name) return
    savePreset(name, selectedVariants, visible)
    setPresetName('')
    setSavingPreset(false)
  }

  const visibleParts = parts.filter(part => visible[part.id])
  const factoryParts = visibleParts.filter(part => part.factory_work === true)
  const sitePrepParts = visibleParts.filter(part => part.factory_work === false)


  return (
    <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
      <button className="sidebar-close-btn" onClick={onClose} aria-label="Close">✕</button>
      <div className="sidebar-brand">
        Genba Lab
        <button
          className={`currency-toggle ${projectSettings.currency === 'JPY' ? 'currency-toggle--active' : ''}`}
          title={projectSettings.currency === 'JPY' ? 'Switch to USD' : 'Switch to JPY (¥)'}
          onClick={() => setProjectSettings(s => ({ ...s, currency: s.currency === 'USD' ? 'JPY' : 'USD' }))}
        >
          {projectSettings.currency === 'JPY' ? '¥' : '$'}
        </button>
      </div>

      {factoryMode && (
        <div className="factory-sidebar-summary">
          <div className="sidebar-section-label">Factory Plan</div>
          <div className="factory-sidebar-kpis">
            <div>
              <strong>{visibleParts.length}</strong>
              <span>bays</span>
            </div>
            <div>
              <strong>{factoryParts.length}</strong>
              <span>factory</span>
            </div>
            <div>
              <strong>{sitePrepParts.length}</strong>
              <span>site prep</span>
            </div>
          </div>
          <div className="factory-sequence-list">
            {visibleParts
              .slice()
              .sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99))
              .map(part => (
                <div key={part.id} className="factory-sequence-row">
                  <span>#{part.sequence ?? '-'}</span>
                  <strong>{part.id}</strong>
                </div>
              ))}
          </div>
          <div className="sidebar-divider" />
        </div>
      )}

      {/* ── Presets ── */}
      {(
        <>
          <div className="sidebar-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Presets</span>
            <button
              className="preset-save-toggle"
              onClick={() => { setSavingPreset(s => !s); setPresetName('') }}
              title="Save current configuration as a new preset"
            >
              {savingPreset ? '✕' : '+'}
            </button>
          </div>

          {savingPreset && (
            <div className="preset-save-row">
              <input
                className="preset-save-input"
                type="text"
                placeholder="Preset name…"
                value={presetName}
                autoFocus
                onChange={e => setPresetName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleSavePreset()
                  if (e.key === 'Escape') { setSavingPreset(false); setPresetName('') }
                }}
              />
              <button
                className="preset-save-confirm"
                onClick={handleSavePreset}
                disabled={!presetName.trim()}
              >
                Save
              </button>
            </div>
          )}

          <div className="preset-row">
            {presets.map(preset => (
              <div key={preset.id} className="preset-btn-wrap">
                <button
                  className={`preset-btn ${activePreset === preset.id ? 'preset-btn--active' : ''}`}
                  onClick={() => onApplyPreset(preset)}
                  title={preset.description}
                >
                  {preset.label}
                </button>
                {preset.custom && (
                  <button
                    className="preset-delete-btn"
                    onClick={() => removePreset(preset.id)}
                    title="Delete preset"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="sidebar-divider" />
        </>
      )}

      {/* ── Layers / Components ── */}
      {(
        <>
          <div className="sidebar-section-label">Layers</div>
          <ul className="parts-list">
            {parts.map(part => {
              const variantIdx = selectedVariants[part.id] ?? 0
              const activeColor = part.variants[variantIdx].color
              const isActive = selected?.id === part.id
              const isHidden = !visible[part.id]
              return (
                <li
                  key={part.id}
                  className={[
                    'part-item',
                    isActive ? 'part-item--active' : '',
                    isHidden ? 'part-item--hidden' : '',
                  ].join(' ')}
                >
                  <div className="part-swatch" style={{ background: activeColor }} />
                  <span className="part-name" onClick={() => onSelect?.(part)} style={{ cursor: 'pointer' }}>{part.id}</span>
                  <button
                    className="part-toggle"
                    onClick={() => onToggle(part.id)}
                    title={isHidden ? 'Show' : 'Hide'}
                  >
                    {isHidden ? <EyeClosed /> : <EyeOpen />}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="sidebar-divider" />
        </>
      )}


      {/* ── Load model ── */}
      <div style={{ paddingBottom: 12 }}>
        <div className="sidebar-section-label">Model</div>
        <IfcLoadButton />
      </div>

      <div className="sidebar-hint">
        {factoryMode ? 'Toggle layers to update factory bays' : 'Click a part to inspect'}
      </div>
    </aside>
  )
}
