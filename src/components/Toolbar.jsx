import {
  MousePointer2, Scissors,
  Ruler, Link2, BarChart3, Undo2, Redo2, Layers, Zap,
  Moon, Sun, Keyboard, HardHat, Clapperboard, Camera, Activity, Wind, LayoutTemplate,
  Droplets, Menu, X, Flame, Shield, Thermometer, Volume2, Factory
} from 'lucide-react'
import ShareButton from './ShareButton'

export default function Toolbar({
  exploded, onToggleExplode,
  sectionCutActive, onToggleSectionCut,
  showDimensions, onToggleDimensions,
  showConnections, onToggleConnections,
  showMetrics, onToggleMetrics,
  factoryMode, onToggleFactoryMode,
  sequenceMode, onToggleSequence,
  darkMode, onToggleDark, onToggleShortcuts,
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
  const isSelectMode = !factoryMode && !sequenceMode

  function handleSelectMode() {
    if (factoryMode) onToggleFactoryMode()
    if (sequenceMode) onToggleSequence()
  }

  return (
    <div className="toolbar">

      <button
        className={`tb-btn tb-btn--mobile-only ${mobileSidebarOpen ? 'tb-btn--active' : ''}`}
        title="Layers"
        onClick={onToggleMobileSidebar}
      >
        {mobileSidebarOpen ? <X size={15} /> : <Menu size={15} />}
      </button>
      <div className="toolbar-sep tb-sep--mobile-only" />

      <div className="toolbar-group">
        <button
          className={`tb-btn ${isSelectMode ? 'tb-btn--active' : ''}`}
          title="Select"
          onClick={handleSelectMode}
        >
          <MousePointer2 size={15} />
        </button>
        <button
          className={`tb-btn ${sectionCutActive ? 'tb-btn--active' : ''}`}
          title="Section Cut"
          onClick={onToggleSectionCut}
          disabled={factoryMode}
        >
          <Scissors size={15} />
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button
          className={`tb-btn ${showDimensions ? 'tb-btn--active' : ''}`}
          title="Dimension Overlay"
          onClick={onToggleDimensions}
          disabled={factoryMode}
        >
          <Ruler size={15} />
        </button>
        <button
          className={`tb-btn ${showConnections ? 'tb-btn--active' : ''}`}
          title="Connection lines (L)"
          onClick={onToggleConnections}
          disabled={factoryMode}
        >
          <Link2 size={15} />
        </button>
        <button
          className={`tb-btn ${showMetrics ? 'tb-btn--active' : ''}`}
          title="Metrics (Cost · Carbon · BOM)"
          onClick={onToggleMetrics}
        >
          <BarChart3 size={15} />
        </button>
        <button
          className={`tb-btn ${factoryMode ? 'tb-btn--active' : ''}`}
          title="Prefab Factory Layout"
          onClick={onToggleFactoryMode}
          disabled={sequenceMode}
        >
          <Factory size={15} />
        </button>
        <button
          className={`tb-btn ${sequenceMode ? 'tb-btn--active' : ''}`}
          title="Assembly Sequence"
          onClick={onToggleSequence}
          disabled={factoryMode}
        >
          <Layers size={15} />
        </button>
        <button
          className={`tb-btn ${showCrane ? 'tb-btn--active' : ''}`}
          title="Tower Crane"
          onClick={onToggleCrane}
          disabled={factoryMode}
        >
          <HardHat size={15} />
        </button>
        <button
          className={`tb-btn ${showEarthquake ? 'tb-btn--active' : ''}`}
          title="Earthquake Simulation"
          onClick={onToggleEarthquake}
          disabled={factoryMode}
        >
          <Activity size={15} />
        </button>
        <button
          className={`tb-btn ${showWindArrows ? 'tb-btn--active' : ''}`}
          title="Wind Load Arrows"
          onClick={onToggleWindArrows}
          disabled={factoryMode}
        >
          <Wind size={15} />
        </button>
        <button
          className={`tb-btn ${showWaterSim ? 'tb-btn--active' : ''}`}
          title="Water Analysis"
          onClick={onToggleWaterSim}
          disabled={factoryMode}
        >
          <Droplets size={15} />
        </button>
        <button
          className={`tb-btn ${showThermal ? 'tb-btn--active' : ''}`}
          title="Thermal Bridge Visualizer"
          onClick={onToggleThermal}
          disabled={factoryMode}
        >
          <Thermometer size={15} />
        </button>
        <button
          className={`tb-btn ${showAcoustic ? 'tb-btn--active' : ''}`}
          title="Acoustic Performance Overlay"
          onClick={onToggleAcoustic}
          disabled={factoryMode}
        >
          <Volume2 size={15} />
        </button>
        <button
          className="tb-btn"
          title="Floor Plan"
          onClick={onShowFloorPlan}
          disabled={factoryMode}
        >
          <LayoutTemplate size={15} />
        </button>
        <button
          className={`tb-btn ${fireMode ? 'tb-btn--active' : ''}`}
          title="Fire Spread Simulation"
          onClick={onToggleFireMode}
          disabled={factoryMode}
          style={fireMode ? { color: '#e74c3c' } : {}}
        >
          <Flame size={15} />
        </button>
        <button
          className={`tb-btn ${showFireCompartments ? 'tb-btn--active' : ''}`}
          title="Fire Compartment Visualizer"
          onClick={onToggleFireCompartments}
          disabled={factoryMode}
        >
          <Shield size={15} />
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button className="tb-btn" title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
          <Undo2 size={15} />
        </button>
        <button className="tb-btn" title="Redo (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
          <Redo2 size={15} />
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button
          className={`tb-btn tb-btn--text ${exploded ? 'tb-btn--active' : ''}`}
          title="Explode / Assemble"
          onClick={onToggleExplode}
          disabled={sequenceMode || factoryMode}
        >
          <Zap size={13} />
          {exploded ? 'ASSEMBLE' : 'EXPLODE'}
        </button>
      </div>

      <div className="toolbar-sep" />


      <div className="toolbar-group">
        <button
          className={`tb-btn tb-btn--text ${cinematicMode ? 'tb-btn--active' : ''}`}
          title="Cinematic demo tour"
          onClick={onToggleCinematic}
          disabled={factoryMode}
        >
          <Clapperboard size={13} />
          DEMO
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <ShareButton shareMetrics={shareMetrics} onShare={onShare} />
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button
          className="tb-btn"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={onToggleDark}
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button
          className="tb-btn"
          title="Keyboard shortcuts (?)"
          onClick={onToggleShortcuts}
        >
          <Keyboard size={15} />
        </button>
      </div>

    </div>
  )
}
