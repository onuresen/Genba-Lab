import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Scene from './components/Scene'
import InfoPanel from './components/InfoPanel'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import MetricsPanel from './components/MetricsPanel'
import ShortcutsModal from './components/ShortcutsModal'
import ViewCube from './components/ViewCube'
import CranePanel from './components/CranePanel'
import EarthquakePanel from './components/EarthquakePanel'
import FloorPlanPanel from './components/FloorPlanPanel'
import FirePanel from './components/FirePanel'
import SequencePlayer from './components/SequencePlayer'
import Celebration from './components/Celebration'
import StartScreen from './components/StartScreen'
import DropOverlay from './components/DropOverlay'
import { useKit } from './components/KitContext'
import { useIfcImport } from './utils/useIfcImport'
import { computeCraneLayout, partBounds } from './utils/craneLayout'
import { estimateFloorArea } from './utils/modelMetrics'
import { fireGradeOf, fireRoundResult, spreadFire } from './utils/fireSim'
import { getSeismicScore, getVerdict, seismicParts } from './utils/seismic'
import './App.css'

// Build playback: 1× places the whole model in about 45 s, whatever its size.
const BUILD_SECONDS = 45
function stepMs(maxStep, speed) {
  return Math.min(1200, Math.max(250, (BUILD_SECONDS * 1000) / Math.max(1, maxStep))) / speed
}

export default function App() {
  const { parts, projectSettings, isLoading, undo, redo, canUndo, canRedo } = useKit()
  const ifc = useIfcImport()

  const [exploded, setExploded] = useState(false)
  const [selected, setSelected] = useState(null)
  const [visible, setVisible] = useState({})
  const [selectedVariants, setSelectedVariants] = useState({})
  const [activePreset, setActivePreset] = useState(null)

  // A new model starts fully visible with its imported variants. Edits to the
  // same model (factory order, connections, undo) keep what you hid or switched.
  const modelKey = projectSettings?.source?.modelKey ?? null
  const [viewKey, setViewKey] = useState(null)
  if (parts.length > 0 && modelKey !== viewKey) {
    setViewKey(modelKey)
    setVisible(Object.fromEntries(parts.map(p => [p.id, true])))
    setSelectedVariants(Object.fromEntries(parts.map(p => [p.id, 0])))
    setSelected(null)
    setActivePreset(null)
  }

  const [sequenceMode, setSequenceMode] = useState(false)
  const [sequenceStep, setSequenceStep] = useState(0)
  const [seqPlaying, setSeqPlaying] = useState(false)
  const [seqSpeed, setSeqSpeed] = useState(1)

  const [showMetrics, setShowMetrics] = useState(false)
  const [showDimensions, setShowDimensions] = useState(false)
  // Connection lines clutter real models; off by default.
  const [showConnections, setShowConnections] = useState(false)

  const [sectionCutActive, setSectionCutActive] = useState(false)
  const [sectionCutY, setSectionCutY] = useState(3.5)

  const [envSettings, setEnvSettings] = useState({ grass: true, time: 14, clouds: false, stars: false, kenGrid: false, shadows: true, edges: true })

  const [factoryMode, setFactoryMode] = useState(false)

  const [cameraCmd, setCameraCmd] = useState(null)

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('genba-lab-dark') === 'true')
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showCrane, setShowCrane] = useState(false)
  const [showCraneRadius, setShowCraneRadius] = useState(false)
  const [cinematicMode, setCinematicMode] = useState(false)
  const rendererRef = useRef(null)

  // Result moments: topped out, earthquake verdict, fire out.
  const [celebration, setCelebration] = useState(null)
  const celebrate = useCallback(event => setCelebration({ ...event, ts: Date.now() }), [])
  const clearCelebration = useCallback(() => setCelebration(null), [])

  // ── Gantt / schedule ─────────────────────────────────────
  const [highlightedWeek, setHighlightedWeek] = useState(null)

  // ── Multi-crane ──────────────────────────────────────────
  const [showSecondCrane, setShowSecondCrane] = useState(false)
  const [secondCraneX, setSecondCraneX] = useState(-8)

  // ── Wind arrows ──────────────────────────────────────────
  const [showWindArrows, setShowWindArrows] = useState(false)
  const [windSpeed, setWindSpeed] = useState(8.0)

  // ── Water simulation ─────────────────────────────────────
  const [showWaterSim, setShowWaterSim] = useState(false)

  // ── Group C: Material overlays ───────────────────────────
  const [showThermal, setShowThermal] = useState(false)
  const [showAcoustic, setShowAcoustic] = useState(false)

  // ── Floor plan ───────────────────────────────────────────
  const [showFloorPlan, setShowFloorPlan] = useState(false)

  // ── Mobile panel toggles ─────────────────────────────────
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // ── Group A: Crane Tools ─────────────────────────────────
  const [liftPlanMode, setLiftPlanMode] = useState(false)
  const [liftStart, setLiftStart] = useState(null)   // {x, z} world coords
  const [liftEnd, setLiftEnd] = useState(null)       // {x, z} world coords
  const [craneCabView, setCraneCabView] = useState(false)

  // ── Group B: Fire & Safety ───────────────────────────────
  const [fireMode, setFireMode] = useState(false)
  const [fireState, setFireState] = useState({})
  const [fireElapsed, setFireElapsed] = useState(0)
  const [fireIntensity, setFireIntensity] = useState(65)
  const [showFireCompartments, setShowFireCompartments] = useState(false)
  const fireBurnStartRef = useRef({})
  const fireStartRef = useRef(0)
  // Latest fire state for the stable click handler and the spread timer.
  const fireStateRef = useRef(fireState)
  useEffect(() => { fireStateRef.current = fireState }, [fireState])

  // ── Earthquake ───────────────────────────────────────────
  const [showEarthquake, setShowEarthquake] = useState(false)
  const [earthquakeMagnitude, setEarthquakeMagnitude] = useState(6.0)
  const [isShaking, setIsShaking] = useState(false)
  const [hasShaken, setHasShaken] = useState(false)
  const [earthquakeCountdown, setEarthquakeCountdown] = useState(null)

  const sortedParts = useMemo(
    () => [...parts].sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99)),
    [parts]
  )
  const currentPartWeight = (() => {
    if (!sequenceMode || sequenceStep <= 0) return 0
    const part = sortedParts[sequenceStep - 1]
    if (!part) return 0
    const variantIdx = selectedVariants[part.id] ?? 0
    return part.variants[variantIdx]?.weight_kg ?? 0
  })()

  useEffect(() => {
    localStorage.setItem('genba-lab-dark', darkMode)
  }, [darkMode])

  // ── Handlers ─────────────────────────────────────────────
  function togglePart(id) {
    setVisible(v => ({ ...v, [id]: !v[id] }))
    setActivePreset(null)
  }

  function setVariant(partId, variantIdx) {
    setSelectedVariants(v => ({ ...v, [partId]: variantIdx }))
    setActivePreset(null)
  }

  function applyPreset(preset) {
    const defaultVariants = Object.fromEntries(parts.map(p => [p.id, 0]))
    const defaultVisible = Object.fromEntries(parts.map(p => [p.id, true]))
    setSelectedVariants({ ...defaultVariants, ...preset.variants })
    setVisible({ ...defaultVisible, ...preset.visible })
    setActivePreset(preset.id)
    setSelected(null)
  }

  // ── Build sequence ───────────────────────────────────────
  const maxStep = parts.length
  const storeyCount = useMemo(() => new Set(parts.map(p => p.fire_compartment).filter(Boolean)).size, [parts])

  const goToStep = useCallback(n => {
    const target = Math.max(0, Math.min(maxStep, n))
    setSequenceStep(target)
    if (target === maxStep && maxStep > 0) {
      setSeqPlaying(false)
      celebrate({
        title: '上棟 · Topped out!',
        subtitle: `${maxStep} parts placed${storeyCount > 1 ? ` · ${storeyCount} storeys` : ''}`,
        tone: 'win',
      })
    }
  }, [maxStep, storeyCount, celebrate])

  // Autoplay: one part per tick; stops at the last part.
  useEffect(() => {
    if (!sequenceMode || !seqPlaying || cinematicMode) return
    const id = setTimeout(() => goToStep(sequenceStep + 1), stepMs(maxStep, seqSpeed))
    return () => clearTimeout(id)
  }, [sequenceMode, seqPlaying, sequenceStep, seqSpeed, maxStep, goToStep, cinematicMode])

  function toggleSequenceMode() {
    setExploded(false)
    setSequenceStep(0)
    if (sequenceMode) {
      setSequenceMode(false)
      setSeqPlaying(false)
    } else {
      // Entering build mode starts the build right away.
      setSequenceMode(true)
      setSeqPlaying(true)
    }
  }

  function toggleSeqPlay() {
    if (!seqPlaying && sequenceStep >= maxStep) setSequenceStep(0)
    setSeqPlaying(v => !v)
  }

  function stepSequence(delta) {
    setSeqPlaying(false)
    goToStep(sequenceStep + delta)
  }

  function seekSequence(n) {
    setSeqPlaying(false)
    goToStep(n)
  }

  function toggleFactoryMode() {
    if (!factoryMode) {
      setExploded(false)
      setSequenceMode(false)
      setSequenceStep(0)
      setSeqPlaying(false)
      setCinematicMode(false)
      setCraneCabView(false)
      setLiftPlanMode(false)
      setLiftStart(null)
      setLiftEnd(null)
      setSelected(null)
    }
    setFactoryMode(v => !v)
  }

  function toggleSectionCut() {
    // Start at mid-height of the model (the old fixed 3.5 m missed most buildings).
    if (!sectionCutActive) {
      const b = partBounds(parts)
      if (b) setSectionCutY(+((b.min[1] + b.max[1]) / 2).toFixed(2))
    }
    setSectionCutActive(v => !v)
  }

  function handleCameraPreset(preset) {
    setCameraCmd({ type: 'preset', preset, ts: Date.now() })
  }

  // pad > 1 leaves room around a single part; whole-model framing fits tight.
  const handleFramePart = useCallback(({ pos, size, pad = 1 }) => {
    setCameraCmd({ type: 'frame', pos, size, pad, ts: Date.now() })
  }, [])

  // IFC models are often far bigger than the default camera view.
  // Frame the whole model once per imported model (also after reload).
  useEffect(() => {
    if (!modelKey || !parts?.length) return
    const b = partBounds(parts)
    handleFramePart({
      pos: b.min.map((v, k) => (v + b.max[k]) / 2),
      size: b.min.map((v, k) => b.max[k] - v),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey])

  // The crane stands outside the model: when it is switched on, frame both.
  useEffect(() => {
    if (!showCrane || !parts?.length) return
    const b = partBounds(parts)
    const crane = computeCraneLayout(parts)
    const min = [Math.min(b.min[0], crane.x - 1), 0, Math.min(b.min[2], crane.z - 1)]
    const max = [Math.max(b.max[0], crane.x + crane.ctrLen), crane.apexY, Math.max(b.max[2], crane.z + 1)]
    handleFramePart({
      pos: min.map((v, k) => (v + max[k]) / 2),
      size: min.map((v, k) => max[k] - v),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCrane])

  // ── Earthquake ───────────────────────────────────────────
  function announceQuake(magnitude) {
    const structure = seismicParts(parts)
    const verdict = getVerdict(magnitude, structure, selectedVariants)
    if (!verdict) return
    const score = getSeismicScore(magnitude, structure, selectedVariants)
    const m = magnitude.toFixed(1)
    const n = verdict.parts.length
    if (verdict.level === 'safe') celebrate({ title: `Survived M${m}!`, subtitle: `Seismic score ${score}/100 · no structural damage`, tone: 'win' })
    else if (verdict.level === 'caution') celebrate({ title: 'Standing, but damaged', subtitle: `${n} part${n === 1 ? '' : 's'} at risk · score ${score}/100`, tone: 'warn' })
    else celebrate({ title: 'Structural failure', subtitle: `${n} part${n === 1 ? '' : 's'} failed at M${m} · score ${score}/100`, tone: 'fail' })
  }

  function handleShake() {
    if (isShaking || earthquakeCountdown != null) return
    const magnitude = earthquakeMagnitude
    setHasShaken(false)
    setEarthquakeCountdown(3)
    let next = 3
    const countdownId = setInterval(() => {
      next -= 1
      if (next <= 0) {
        clearInterval(countdownId)
        setEarthquakeCountdown(null)
        setIsShaking(true)
        const duration = (magnitude * 0.35 + 1) * 1000
        setTimeout(() => {
          setIsShaking(false)
          setHasShaken(true)
          announceQuake(magnitude)
        }, duration)
      } else {
        setEarthquakeCountdown(next)
      }
    }, 650)
  }

  // ── Fire ─────────────────────────────────────────────────
  const finishFireRound = useCallback(state => {
    const elapsed = Math.round((Date.now() - fireStartRef.current) / 1000)
    const result = fireRoundResult(state, parts.length, elapsed)
    if (result) celebrate({ title: result.title, subtitle: result.subtitle, tone: result.tone })
  }, [parts.length, celebrate])

  const anyBurning = Object.values(fireState).some(status => status === 'burning')
  useEffect(() => {
    if (!fireMode || !anyBurning || factoryMode) return
    let tick = 0
    const id = setInterval(() => {
      tick += 1
      setFireElapsed(e => e + 1)
      const prev = fireStateRef.current
      const next = spreadFire({
        parts, state: prev, burnStart: fireBurnStartRef.current,
        selectedVariants, intensity: fireIntensity, now: Date.now(), tick,
      })
      if (next !== prev) {
        fireStateRef.current = next
        setFireState(next)
        finishFireRound(next)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [fireMode, anyBurning, parts, selectedVariants, fireIntensity, factoryMode, finishFireRound])

  // New fire round at one part.
  const handleIgnite = useCallback((partId) => {
    const now = Date.now()
    fireBurnStartRef.current = { [partId]: now }
    fireStartRef.current = now
    const next = { [partId]: 'burning' }
    fireStateRef.current = next
    setFireState(next)
    setFireElapsed(0)
  }, [])

  // Click in fire mode: put a burning part out, or set another part on fire.
  const handleFireClick = useCallback((partId) => {
    const state = fireStateRef.current
    const status = state[partId] ?? 'ok'
    if (status === 'burning') {
      const next = { ...state, [partId]: 'out' }
      fireStateRef.current = next
      setFireState(next)
      finishFireRound(next)
      return
    }
    if (!Object.values(state).some(s => s === 'burning')) {
      handleIgnite(partId)
      return
    }
    if (status === 'ok') {
      fireBurnStartRef.current[partId] = Date.now()
      const next = { ...state, [partId]: 'burning' }
      fireStateRef.current = next
      setFireState(next)
    }
  }, [handleIgnite, finishFireRound])

  // A random part among the weakest fire rating, above ground (a burning
  // footing is no test), so every restart is a new scenario.
  function handleIgniteFirst() {
    if (!parts?.length) return
    const rank = { 'non-rated': 0, '1hr': 1, '2hr': 2 }
    const BURIED = new Set(['IfcFooting', 'IfcPile'])
    const pool = parts.filter(p => visible[p.id] !== false && !BURIED.has(p.variants[0]?.ifc_entity))
    const candidates = pool.length ? pool : parts
    const weakest = Math.min(...candidates.map(p => rank[fireGradeOf(p, selectedVariants)] ?? 0))
    const options = candidates.filter(p => (rank[fireGradeOf(p, selectedVariants)] ?? 0) === weakest)
    handleIgnite(options[Math.floor(Math.random() * options.length)].id)
  }

  function handleExtinguish() {
    fireBurnStartRef.current = {}
    fireStateRef.current = {}
    setFireState({})
    setFireElapsed(0)
  }

  function handleToggleFireMode() {
    if (fireMode) { handleExtinguish() }
    setFireMode(v => !v)
  }

  // ── Lift plan handlers ────────────────────────────────────
  function handleLiftPoint({ x, z }) {
    if (!liftStart) {
      setLiftStart({ x, z })
      setLiftEnd(null)
    } else if (!liftEnd) {
      setLiftEnd({ x, z })
    } else {
      // Reset and start new plan
      setLiftStart({ x, z })
      setLiftEnd(null)
    }
  }

  function handleToggleLiftPlan() {
    setLiftPlanMode(v => !v)
    setLiftStart(null)
    setLiftEnd(null)
  }

  // ── Global keyboard shortcuts ─────────────────────────────
  // The listener is added once and always calls the latest handler, so undo,
  // redo and the mode toggles never read stale state (Ctrl+Z used to do
  // nothing after a factory reorder).
  function onKey(e) {
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
    // Space / Enter on a focused button press that button, nothing else.
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
    if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }
    if (mod || e.altKey) return
    if (e.key === '?') { setShowShortcuts(s => !s); return }
    if (e.key === 'Escape') {
      if (showShortcuts) setShowShortcuts(false)
      else if (showFloorPlan) setShowFloorPlan(false)
      else if (selected) setSelected(null)
      else if (showMetrics) setShowMetrics(false)
      return
    }
    if (sequenceMode && !cinematicMode) {
      if (e.key === ' ') { e.preventDefault(); toggleSeqPlay(); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepSequence(1); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepSequence(-1); return }
      if (e.key === 'Home') { seekSequence(0); return }
      if (e.key === 'End') { seekSequence(maxStep); return }
    }
    if (e.repeat) return
    const inModel = !factoryMode
    switch (e.key.toLowerCase()) {
      case 'e': if (inModel && !sequenceMode) setExploded(v => !v); break
      case 'd': if (inModel) setShowDimensions(v => !v); break
      case 'l': if (inModel) setShowConnections(v => !v); break
      case 'm': setShowMetrics(v => !v); break
      case 'x': if (inModel) toggleSectionCut(); break
      case 'f': if (!sequenceMode) toggleFactoryMode(); break
      case 'b': if (inModel) toggleSequenceMode(); break
      case 'c': if (inModel) setShowCrane(v => !v); break
      case 'q': if (inModel) { setShowEarthquake(v => !v); setHasShaken(false) } break
      case 'w': if (inModel) setShowWindArrows(v => !v); break
      case 'r': if (inModel) setShowWaterSim(v => !v); break
      case 'i': if (inModel) handleToggleFireMode(); break
      case 't': if (inModel) setShowThermal(v => !v); break
      case 'a': if (inModel) setShowAcoustic(v => !v); break
      case 'p': if (inModel) setShowFloorPlan(v => !v); break
      case '1': handleCameraPreset('front'); break
      case '2': handleCameraPreset('top'); break
      case '3': handleCameraPreset('right'); break
      case '0': handleCameraPreset('home'); break
      case 's':
        if (factoryMode) setFactoryMode(false)
        if (sequenceMode) { setSequenceMode(false); setSequenceStep(0); setSeqPlaying(false) }
        setSelected(null)
        break
      default: break
    }
  }
  const onKeyRef = useRef(onKey)
  useEffect(() => { onKeyRef.current = onKey })
  useEffect(() => {
    const listener = e => onKeyRef.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  // ── Share / screenshot ───────────────────────────────────
  const shareMetrics = (() => {
    if (!parts) return { carbon: 0, casbee: 'A', cost: '$0', parts: 0 }
    const activeParts = parts.filter(p => visible[p.id])
    const totalCarbon = activeParts.reduce((s, p) => {
      const v = p.variants[selectedVariants[p.id] ?? 0]
      return s + (v?.carbon_kgco2e ?? 0)
    }, 0)
    const totalCost = activeParts.reduce((s, p) => {
      const v = p.variants[selectedVariants[p.id] ?? 0]
      return s + (v?.unit_cost_usd ?? 0) + (v?.labor_cost_usd ?? 0)
    }, 0)
    const carbonPerM2 = totalCarbon / estimateFloorArea(parts)
    const casbee = carbonPerM2 <= 200 ? 'S' : carbonPerM2 <= 350 ? 'A' : carbonPerM2 <= 500 ? 'B+' : carbonPerM2 <= 700 ? 'B-' : 'C'
    return {
      carbon: Math.round(totalCarbon),
      casbee,
      cost: `$${Math.round(totalCost).toLocaleString()}`,
      parts: activeParts.length,
    }
  })()

  async function handleShare() {
    if (!rendererRef.current) return
    const gl = rendererRef.current
    const src = gl.domElement.toDataURL('image/png')

    const img = new Image()
    img.src = src
    await new Promise(r => { img.onload = r })

    const W = img.width, H = img.height
    const cvs = document.createElement('canvas')
    cvs.width = W; cvs.height = H
    const ctx = cvs.getContext('2d')
    ctx.drawImage(img, 0, 0)

    const pad = Math.round(W * 0.018)
    const bW = Math.round(W * 0.42)
    const bH = Math.round(H * 0.13)
    const bX = pad, bY = H - bH - pad, rr = 10

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(bX + rr, bY); ctx.lineTo(bX + bW - rr, bY)
    ctx.quadraticCurveTo(bX + bW, bY, bX + bW, bY + rr)
    ctx.lineTo(bX + bW, bY + bH - rr)
    ctx.quadraticCurveTo(bX + bW, bY + bH, bX + bW - rr, bY + bH)
    ctx.lineTo(bX + rr, bY + bH)
    ctx.quadraticCurveTo(bX, bY + bH, bX, bY + bH - rr)
    ctx.lineTo(bX, bY + rr)
    ctx.quadraticCurveTo(bX, bY, bX + rr, bY)
    ctx.closePath()
    ctx.fillStyle = 'rgba(20,24,36,0.88)'
    ctx.fill()
    ctx.restore()

    const fs1 = Math.round(bH * 0.28), fs2 = Math.round(bH * 0.22), fs3 = Math.round(bH * 0.18)
    ctx.font = `700 ${fs1}px "Segoe UI",system-ui,sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.fillText('Genba Lab', bX + pad, bY + bH * 0.34)

    ctx.font = `500 ${fs2}px "Segoe UI",system-ui,sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.fillText(
      `${shareMetrics.carbon} kg CO₂e · CASBEE ${shareMetrics.casbee} · ${shareMetrics.cost} · ${shareMetrics.parts} parts`,
      bX + pad, bY + bH * 0.7
    )

    ctx.font = `400 ${fs3}px "Segoe UI",system-ui,sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('onuresen.github.io/Genba-Lab', bX + pad, bY + bH * 0.92)

    const link = document.createElement('a')
    link.download = 'genba-lab.png'
    link.href = cvs.toDataURL('image/png')
    link.click()

    const caption = `Tested in Genba Lab: a real building model in the browser.

📐 ${shareMetrics.parts} parts
♻️ ${shareMetrics.carbon} kg CO₂e embodied carbon (estimate)
💰 ${shareMetrics.cost} (estimate)

🔗 https://onuresen.github.io/Genba-Lab/`

    try { await navigator.clipboard.writeText(caption) } catch { /* clipboard unavailable */ }
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white', background: '#2c3e50' }}>
        Loading…
      </div>
    )
  }

  if (!parts || parts.length === 0) {
    return (
      <>
        <StartScreen ifc={ifc} darkMode={darkMode} />
        <DropOverlay onFile={ifc.importFile} />
      </>
    )
  }

  return (
    <div id="root-container" data-theme={darkMode ? 'dark' : 'light'}>

      <Toolbar
        exploded={exploded}
        onToggleExplode={() => { setExploded(v => !v); setSequenceMode(false) }}
        sectionCutActive={sectionCutActive}
        onToggleSectionCut={toggleSectionCut}
        showDimensions={showDimensions}
        showConnections={showConnections}
        onToggleConnections={() => setShowConnections(v => !v)}
        onToggleDimensions={() => setShowDimensions(v => !v)}
        showMetrics={showMetrics}
        onToggleMetrics={() => setShowMetrics(v => !v)}
        factoryMode={factoryMode}
        onToggleFactoryMode={toggleFactoryMode}
        sequenceMode={sequenceMode}
        onToggleSequence={toggleSequenceMode}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        showCrane={showCrane}
        onToggleCrane={() => setShowCrane(v => !v)}
        showEarthquake={showEarthquake}
        onToggleEarthquake={() => { setShowEarthquake(v => !v); setHasShaken(false) }}
        showWindArrows={showWindArrows}
        onToggleWindArrows={() => setShowWindArrows(v => !v)}
        showWaterSim={showWaterSim}
        onToggleWaterSim={() => setShowWaterSim(v => !v)}
        showThermal={showThermal}
        onToggleThermal={() => setShowThermal(v => !v)}
        showAcoustic={showAcoustic}
        onToggleAcoustic={() => setShowAcoustic(v => !v)}
        onShowFloorPlan={() => setShowFloorPlan(true)}
        fireMode={fireMode}
        onToggleFireMode={handleToggleFireMode}
        showFireCompartments={showFireCompartments}
        onToggleFireCompartments={() => setShowFireCompartments(v => !v)}
        mobileSidebarOpen={mobileSidebarOpen}
        onToggleMobileSidebar={() => setMobileSidebarOpen(v => !v)}
        onShare={handleShare}
        shareMetrics={shareMetrics}
        cinematicMode={cinematicMode}
        onToggleCinematic={() => setCinematicMode(v => !v)}
      />

      <Sidebar
        visible={visible}
        onToggle={togglePart}
        selected={selected}
        onSelect={setSelected}
        onFramePart={handleFramePart}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        selectedVariants={selectedVariants}
        activePreset={activePreset}
        onApplyPreset={applyPreset}
        factoryMode={factoryMode}
        ifc={ifc}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(v => !v)}
        onToggleShortcuts={() => setShowShortcuts(v => !v)}
      />

      <Scene
        isExploded={sequenceMode ? false : exploded}
        visible={visible}
        onSelect={setSelected}
        onClearSelect={() => setSelected(null)}
        selectedVariants={selectedVariants}
        sequenceMode={sequenceMode}
        sequenceStep={sequenceStep}
        showDimensions={showDimensions}
        showConnections={showConnections}
        sectionCutActive={sectionCutActive}
        sectionCutY={sectionCutY}
        factoryMode={factoryMode}
        envSettings={envSettings}
        cameraCmd={cameraCmd}
        onFramePart={handleFramePart}
        showCrane={showCrane}
        showCraneRadius={showCraneRadius}
        currentPartWeight={currentPartWeight}
        isShaking={isShaking}
        earthquakeMagnitude={earthquakeMagnitude}
        hasShaken={hasShaken}
        highlightedWeek={highlightedWeek}
        showSecondCrane={showSecondCrane}
        secondCraneX={secondCraneX}
        showWindArrows={showWindArrows}
        windSpeed={windSpeed}
        showWaterSim={showWaterSim}
        showThermal={showThermal}
        showAcoustic={showAcoustic}
        liftPlanMode={liftPlanMode}
        liftStart={liftStart}
        liftEnd={liftEnd}
        onLiftPoint={handleLiftPoint}
        craneCabView={craneCabView}
        fireMode={fireMode}
        fireState={fireState}
        fireIntensity={fireIntensity}
        onFireClick={handleFireClick}
        showFireCompartments={showFireCompartments}
        selectedId={selected?.id ?? null}
        darkMode={darkMode}
        onRendererReady={gl => { rendererRef.current = gl }}
        cinematicMode={cinematicMode}
        onCinematicEnd={() => setCinematicMode(false)}
        onSetExploded={setExploded}
        onSetSequenceMode={setSequenceMode}
        onSetSequenceStep={setSequenceStep}
        onSetShowMetrics={setShowMetrics}
        maxStep={maxStep}
      />

      <InfoPanel
        selected={selected}
        onClearSelected={() => setSelected(null)}
        onFramePart={handleFramePart}
        selectedVariants={selectedVariants}
        onVariantChange={setVariant}
        sectionCutActive={sectionCutActive}
        sectionCutY={sectionCutY}
        onSectionCutY={setSectionCutY}
        envSettings={envSettings}
        setEnvSettings={setEnvSettings}
        showAcoustic={showAcoustic}
      />

      {sequenceMode && !cinematicMode && (
        <SequencePlayer
          parts={sortedParts}
          step={sequenceStep}
          maxStep={maxStep}
          playing={seqPlaying}
          speed={seqSpeed}
          onTogglePlay={toggleSeqPlay}
          onStep={stepSequence}
          onSeek={seekSequence}
          onSpeed={setSeqSpeed}
          onExit={toggleSequenceMode}
        />
      )}

      {showMetrics && (
        <MetricsPanel
          selectedVariants={selectedVariants}
          visible={visible}
          onClose={() => setShowMetrics(false)}
          onVariantChange={setVariant}
          highlightedWeek={highlightedWeek}
          onHighlightWeek={w => setHighlightedWeek(w)}
        />
      )}

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {showCrane && (
        <CranePanel
          sequenceMode={sequenceMode}
          sequenceStep={sequenceStep}
          currentPartWeight={currentPartWeight}
          showRadius={showCraneRadius}
          onToggleRadius={() => setShowCraneRadius(v => !v)}
          onWindChange={setWindSpeed}
          liveWind={showWindArrows}
          showSecondCrane={showSecondCrane}
          onToggleSecondCrane={() => setShowSecondCrane(v => !v)}
          secondCraneX={secondCraneX}
          onSecondCraneX={setSecondCraneX}
          liftPlanMode={liftPlanMode}
          liftStart={liftStart}
          liftEnd={liftEnd}
          onToggleLiftPlan={handleToggleLiftPlan}
          craneCabView={craneCabView}
          onToggleCabView={() => setCraneCabView(v => !v)}
        />
      )}

      {fireMode && (
        <FirePanel
          fireState={fireState}
          fireElapsed={fireElapsed}
          fireIntensity={fireIntensity}
          onFireIntensity={setFireIntensity}
          onIgniteFirst={handleIgniteFirst}
          onExtinguish={handleExtinguish}
          selectedVariants={selectedVariants}
        />
      )}

      {showEarthquake && (
        <EarthquakePanel
          magnitude={earthquakeMagnitude}
          onMagnitude={setEarthquakeMagnitude}
          isShaking={isShaking}
          countdown={earthquakeCountdown}
          onShake={handleShake}
          hasShaken={hasShaken}
          selectedVariants={selectedVariants}
        />
      )}

      {showFloorPlan && (
        <FloorPlanPanel
          visible={visible}
          showKenGrid={envSettings.kenGrid}
          onClose={() => setShowFloorPlan(false)}
        />
      )}

      <ViewCube onPreset={handleCameraPreset} darkMode={darkMode} />

      {celebration && <Celebration event={celebration} onDone={clearCelebration} />}
      <DropOverlay onFile={ifc.importFile} />
    </div>
  )
}
