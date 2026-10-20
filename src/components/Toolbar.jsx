import { useRef, useState } from 'react'
import {
  MousePointer2, Scissors,
  Ruler, Link2, BarChart3, Undo2, Redo2, Layers, Zap,
  Clapperboard, Activity, Wind, LayoutTemplate,
  Droplets, Menu, X, Flame, Shield, Thermometer, Volume2, Factory, HardHat,
} from 'lucide-react'
import ShareButton from './ShareButton'

// Fast tooltip under the toolbar: name, one short hint, shortcut key.
// Rendered outside the (scrollable) toolbar so it is never clipped.
function useTooltip() {
  const [tip, setTip] = useState(null)
  const timer = useRef(null)
  function show(e, info) {
    const rect = e.currentTarget.getBoundingClientRect()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setTip({ ...info, x: rect.left + rect.width / 2, y: rect.bottom + 8 }), 120)
  }
  function hide() {
    clearTimeout(timer.current)
    setTip(null)
  }
  return { tip, show, hide }
}

function ToolButton({ icon, label, hint, keyName, active, disabled, onClick, tooltip, danger, text }) {
  const Icon = icon
  return (
    <button
      className={`tb-btn${text ? ' tb-btn--text' : ''}${active ? ' tb-btn--active' : ''}${danger && active ? ' tb-btn--danger' : ''}`}
      aria-label={keyName ? `${label} (${keyName})` : label}
      aria-pressed={active ?? undefined}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={e => tooltip.show(e, { label, hint, keyName })}
      onMouseLeave={tooltip.hide}
      onMouseDown={e => { e.preventDefault(); tooltip.hide() }}
      onFocus={e => tooltip.show(e, { label, hint, keyName })}
      onBlur={tooltip.hide}
    >
      <Icon size={text ? 13 : 15} />
      {text}
    </button>
  )
}

function Group({ label, children }) {
  return (
    <div className="toolbar-group" role="group" aria-label={label}>
      <span className="toolbar-group__label" aria-hidden="true">{label}</span>
      <div className="toolbar-group__buttons">{children}</div>
    </div>
  )
}

export default function Toolbar({
  exploded, onToggleExplode,
  sectionCutActive, onToggleSectionCut,
  showDimensions, onToggleDimensions,
  showConnections, onToggleConnections,
  showMetrics, onToggleMetrics,
  factoryMode, onToggleFactoryMode,
  sequenceMode, onToggleSequence,
  onUndo, onRedo, canUndo, canRedo,
  showCrane, onToggleCrane,
  onShare, shareMetrics,
  cinematicMode, onToggleCinematic,
  showEarthquake, onToggleEarthquake,
  showWindArrows, onToggleWindArrows,
  showWaterSim, onToggleWaterSim,
  showThermal, onToggleThermal,
  showAcoustic, onToggleAcoustic,
  onShowFloorPlan,
  fireMode, onToggleFireMode,
  showFireCompartments, onToggleFireCompartments,
  mobileSidebarOpen, onToggleMobileSidebar,
}) {
  const tooltip = useTooltip()
  const isSelectMode = !factoryMode && !sequenceMode

  function handleSelectMode() {
    if (factoryMode) onToggleFactoryMode()
    if (sequenceMode) onToggleSequence()
  }

  const t = { tooltip }

  return (
    <>
      <div className="toolbar" onMouseLeave={tooltip.hide}>
        <button
          className={`tb-btn tb-btn--mobile-only ${mobileSidebarOpen ? 'tb-btn--active' : ''}`}
          aria-label="Layers"
          onClick={onToggleMobileSidebar}
        >
          {mobileSidebarOpen ? <X size={15} /> : <Menu size={15} />}
        </button>
        <div className="toolbar-sep tb-sep--mobile-only" />

        <Group label="View">
          <ToolButton {...t} icon={MousePointer2} label="Select" hint="Click a part to inspect it" keyName="S" active={isSelectMode} onClick={handleSelectMode} />
          <ToolButton {...t} icon={Scissors} label="Section cut" hint="Slice the model at a height" keyName="X" active={sectionCutActive} onClick={onToggleSectionCut} disabled={factoryMode} />
          <ToolButton {...t} icon={Ruler} label="Dimensions" hint="Overall width, depth and height" keyName="D" active={showDimensions} onClick={onToggleDimensions} disabled={factoryMode} />
          <ToolButton {...t} icon={Link2} label="Connections" hint="Lines between touching parts" keyName="L" active={showConnections} onClick={onToggleConnections} disabled={factoryMode} />
          <ToolButton {...t} icon={LayoutTemplate} label="Floor plan" hint="2D plan, SVG export" keyName="P" onClick={onShowFloorPlan} disabled={factoryMode} />
        </Group>

        <div className="toolbar-sep" />

        <Group label="Build">
          <ToolButton {...t} icon={Layers} label="Build sequence" hint="Watch the model go up, part by part" keyName="B" active={sequenceMode} onClick={onToggleSequence} disabled={factoryMode} />
          <ToolButton {...t} icon={HardHat} label="Tower crane" hint="Crane sized to the model, lift checks" keyName="C" active={showCrane} onClick={onToggleCrane} disabled={factoryMode} />
          <ToolButton {...t} icon={Factory} label="Factory layout" hint="Parts by production bay" keyName="F" active={factoryMode} onClick={onToggleFactoryMode} disabled={sequenceMode} />
        </Group>

        <div className="toolbar-sep" />

        <Group label="Simulate">
          <ToolButton {...t} icon={Activity} label="Earthquake" hint="Shake the model by magnitude" keyName="Q" active={showEarthquake} onClick={onToggleEarthquake} disabled={factoryMode} />
          <ToolButton {...t} icon={Wind} label="Wind" hint="Pressure arrows and streamlines" keyName="W" active={showWindArrows} onClick={onToggleWindArrows} disabled={factoryMode} />
          <ToolButton {...t} icon={Droplets} label="Rain" hint="Rain and driving-rain pressure" keyName="R" active={showWaterSim} onClick={onToggleWaterSim} disabled={factoryMode} />
          <ToolButton {...t} icon={Flame} label="Fire" hint="Start a fire, then put it out" keyName="I" active={fireMode} danger onClick={onToggleFireMode} disabled={factoryMode} />
          <ToolButton {...t} icon={Shield} label="Fire compartments" hint="Storeys vs the 500 m² limit" active={showFireCompartments} onClick={onToggleFireCompartments} disabled={factoryMode} />
        </Group>

        <div className="toolbar-sep" />

        <Group label="Analyze">
          <ToolButton {...t} icon={Thermometer} label="Thermal bridges" hint="Heat loss at joints" keyName="T" active={showThermal} onClick={onToggleThermal} disabled={factoryMode} />
          <ToolButton {...t} icon={Volume2} label="Acoustics" hint="Sound insulation by part" keyName="A" active={showAcoustic} onClick={onToggleAcoustic} disabled={factoryMode} />
          <ToolButton {...t} icon={BarChart3} label="Metrics" hint="Cost, carbon, BOM, schedule" keyName="M" active={showMetrics} onClick={onToggleMetrics} />
        </Group>

        <div className="toolbar-sep" />

        <Group label="Show">
          <ToolButton {...t} icon={Zap} text={exploded ? 'ASSEMBLE' : 'EXPLODE'} label={exploded ? 'Assemble' : 'Explode'} hint="Pull the parts apart" keyName="E" active={exploded} onClick={onToggleExplode} disabled={sequenceMode || factoryMode} />
          <ToolButton {...t} icon={Clapperboard} label="Demo tour" hint="A short guided camera tour" active={cinematicMode} onClick={onToggleCinematic} disabled={factoryMode} />
          <ShareButton shareMetrics={shareMetrics} onShare={onShare} tooltip={tooltip} />
          <ToolButton {...t} icon={Undo2} label="Undo" hint="Factory order and connection edits" keyName="Ctrl+Z" onClick={onUndo} disabled={!canUndo} />
          <ToolButton {...t} icon={Redo2} label="Redo" keyName="Ctrl+Y" onClick={onRedo} disabled={!canRedo} />
        </Group>
      </div>

      {tooltip.tip && (
        <div className="tb-tooltip" style={{ left: tooltip.tip.x, top: tooltip.tip.y }} role="tooltip">
          <div className="tb-tooltip__title">
            {tooltip.tip.label}
            {tooltip.tip.keyName && <kbd>{tooltip.tip.keyName}</kbd>}
          </div>
          {tooltip.tip.hint && <div className="tb-tooltip__hint">{tooltip.tip.hint}</div>}
        </div>
      )}
    </>
  )
}
