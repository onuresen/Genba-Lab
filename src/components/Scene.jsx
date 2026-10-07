import { useRef, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, ContactShadows, PerspectiveCamera, Environment, Sky, Clouds, Cloud, Stars } from '@react-three/drei'
import { gsap } from 'gsap'
import * as THREE from 'three'
import Part from './Part'
import DimensionLines from './DimensionLines'
import Connection from './Connection'
import Crane from './Crane'
import CinematicMode from './CinematicMode'
import WindArrows from './WindArrows'
import WaterFlow from './WaterFlow'
import FireCompartments from './FireCompartments'
import ThermalOverlay from './ThermalOverlay'
import FactoryGrid from './FactoryGrid'
import FireEffects from './FireEffects'
import WindStreamlines from './WindStreamlines'
import EarthquakeEffects from './EarthquakeEffects'
import { useKit } from './KitContext'
import RenderDiagnostics from './RenderDiagnostics'
import { getContinuousRenderReasons } from '../utils/renderActivity'
import { computeCraneLayout } from '../utils/craneLayout'
import { cameraViews, modelFrame } from '../utils/modelMetrics'
import { factoryLayout } from '../utils/factoryLayout'

// ── GSAP → R3F invalidation bridge ─────────────────────────
// In `frameloop="demand"` mode R3F only renders when a React prop changes or
// something calls invalidate(). Our animations (explode, sequence, camera,
// crane, earthquake, cinematic) are driven by GSAP, which mutates three.js
// objects imperatively and does NOT trigger a render. This pumps a render
// frame only while at least one GSAP tween is active, so an idle scene truly
// idles at 0fps while every animation still plays smoothly.
const COMPACT_LABEL_LIMIT = 30

function GsapBridge() {
  const invalidate = useThree(s => s.invalidate)
  useEffect(() => {
    const tick = () => {
      const tweens = gsap.globalTimeline.getChildren(true, true, false)
      for (let i = 0; i < tweens.length; i++) {
        if (tweens[i].isActive()) { invalidate(); break }
      }
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [invalidate])
  return null
}

function factoryView(layout) {
  const span = Math.max(layout.width, layout.depth)
  return { pos: [0, Math.max(12, span * 1.05), layout.centerZ + Math.max(9, span * 0.75)], target: [0, 0, layout.centerZ] }
}

function CameraController({ factoryMode, controlsRef, cameraCmd, craneCabView, craneLayout, frame, factory }) {
  const { camera } = useThree()

  function flyTo({ pos, target }, duration = 1.2) {
    gsap.to(camera.position, { x: pos[0], y: pos[1], z: pos[2], duration, ease: 'expo.inOut' })
    if (controlsRef.current) {
      gsap.to(controlsRef.current.target, {
        x: target[0], y: target[1], z: target[2],
        duration, ease: 'expo.inOut',
        onUpdate: () => controlsRef.current?.update(),
      })
    }
  }

  useEffect(() => {
    flyTo(factoryMode ? factoryView(factory) : cameraViews(frame).home)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factoryMode, camera, controlsRef])

  // ── Crane Cab View ───────────────────────────────────────
  useEffect(() => {
    if (!controlsRef.current) return
    if (craneCabView) {
      controlsRef.current.enabled = false
      // Operator cab: just above the jib, looking along it toward the model.
      const { x, z, jibY, jibLen } = craneLayout
      gsap.to(camera.position, { x, y: jibY + 2, z: z - 1, duration: 1.2, ease: 'expo.inOut' })
      gsap.to(controlsRef.current.target, {
        x: x - jibLen, y: jibY * 0.4, z,
        duration: 1.2, ease: 'expo.inOut',
        onUpdate: () => controlsRef.current?.update(),
      })
    } else {
      controlsRef.current.enabled = true
      flyTo(cameraViews(frame).home)
    }
  }, [craneCabView])

  // Declared after the mode / cab-view effects so a pending command runs last
  // and overwrite:true cancels their default-view tweens.
  useEffect(() => {
    if (!cameraCmd || !controlsRef.current) return
    let pos, target

    if (cameraCmd.type === 'preset') {
      const p = cameraViews(frame)[cameraCmd.preset]
      if (!p) return
      pos = p.pos; target = p.target
    } else if (cameraCmd.type === 'frame') {
      const [px, py, pz] = cameraCmd.pos
      const dist = Math.max(...cameraCmd.size) * 2 + 3
      pos = [px + dist * 0.6, py + dist * 0.5, pz + dist * 0.6]
      target = [px, py, pz]
    }

    gsap.to(camera.position, { x: pos[0], y: pos[1], z: pos[2], duration: 1, ease: 'expo.inOut', overwrite: true })
    gsap.to(controlsRef.current.target, {
      x: target[0], y: target[1], z: target[2],
      duration: 1, ease: 'expo.inOut', overwrite: true,
      onUpdate: () => controlsRef.current?.update(),
    })
    // `camera` too: drei's makeDefault camera replaces R3F's right after mount,
    // and a pending command must apply to the camera that actually renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraCmd?.ts, camera])

  return null
}

export default function Scene({
  isExploded,
  visible,
  onSelect,
  onClearSelect,
  selectedVariants,
  sequenceMode,
  sequenceStep,
  showDimensions,
  showConnections,
  sectionCutActive,
  sectionCutY,
  factoryMode,
  envSettings,
  cameraCmd,
  onFramePart,
  showCrane,
  showCraneRadius,
  currentPartWeight,
  onRendererReady,
  cinematicMode,
  onCinematicEnd,
  onSetExploded,
  onSetSequenceMode,
  onSetSequenceStep,
  onSetShowMetrics,
  maxStep,
  isShaking,
  earthquakeMagnitude,
  hasShaken,
  highlightedWeek,
  showSecondCrane,
  secondCraneX,
  showWindArrows,
  windSpeed,
  showWaterSim,
  rainfall,
  onWaterResult,
  showThermal,
  showAcoustic,
  liftPlanMode,
  liftStart,
  liftEnd,
  onLiftPoint,
  craneCabView,
  fireMode,
  fireState,
  fireIntensity,
  onIgnite,
  showFireCompartments,
}) {
  const controlsRef = useRef()
  const { parts } = useKit()
  const craneLayout = useMemo(() => computeCraneLayout(parts), [parts])
  const frame = useMemo(() => modelFrame(parts), [parts])
  // Ken grid (910 mm module) and ground shadow cover the model footprint.
  const footprint = Math.max(frame.size[0], frame.size[2])
  const kenModules = Math.min(400, Math.max(20, Math.ceil((footprint + 2) / 0.91)))
  // Ground must hold the model and the crane's reach.
  const groundSize = Math.max(100, Math.ceil((Math.abs(craneLayout.x) + craneLayout.jibLen) * 3))

  // Only effects that visibly change on every frame may select `always`.
  // Static panels/results and all GSAP transitions stay on demand; GsapBridge
  // invalidates while their tweens are actually active.
  const continuousReasons = getContinuousRenderReasons({
    factoryMode,
    showWaterSim,
    showThermal,
    showWindArrows,
    fireState,
    isShaking,
    envSettings,
  })
  const continuousActive = continuousReasons.length > 0
  // Big kits (e.g. IFC imports): one label per part/connection in explode mode
  // is unreadable, so labels then only show on hover.
  const visibleCount = parts ? parts.reduce((n, p) => n + (visible[p.id] ? 1 : 0), 0) : 0
  const compactLabels = visibleCount > COMPACT_LABEL_LIMIT

  const diagnosticsEnabled = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('perf')

  return (
    <Canvas
      frameloop={continuousActive ? 'always' : 'demand'}
      dpr={[1, 1.5]}
      shadows={false}
      style={{ position: 'absolute', inset: 0, background: factoryMode ? '#eef2f7' : '#f4f4f4' }}
      gl={{
        localClippingEnabled: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => onRendererReady?.(gl)}
    >
      <PerspectiveCamera makeDefault position={[8, 8, 8]} fov={45} />
      <OrbitControls ref={controlsRef} makeDefault enableDamping />
      <GsapBridge />
      {diagnosticsEnabled && <RenderDiagnostics continuousReasons={continuousReasons} />}
      <CameraController factoryMode={factoryMode} controlsRef={controlsRef} cameraCmd={cameraCmd} craneCabView={craneCabView} craneLayout={craneLayout} frame={frame} factory={factoryLayout(visibleCount)} />

      <ambientLight intensity={!factoryMode && envSettings && (envSettings.time < 6 || envSettings.time > 18) ? 0.2 : 0.8} />
      
      {/* ── Dynamic Sky and Sun ─────────────────────────── */}
      <Environment preset="city" />
      {(() => {
        if (factoryMode || !envSettings) {
          return <directionalLight position={[5, 10, 5]} intensity={1} />
        }
        
        const time = envSettings.time;
        // Map 6am to 0, 12pm to PI/2, 6pm to PI
        const theta = Math.PI * ((time - 6) / 12);
        const sunY = Math.max(-10, Math.sin(theta) * 50);
        const sunX = Math.cos(theta) * 50;
        const sunPos = [sunX, sunY, 15];
        const isDaytime = time > 5 && time < 19;
        
        return (
          <>
            <Sky sunPosition={sunPos} turbidity={0.6} rayleigh={0.8} />
            {isDaytime && <directionalLight position={sunPos} intensity={Math.max(0, Math.sin(theta))} />}
            
            {envSettings.stars && (
              <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
            )}
            
            {envSettings.clouds && (
              <Clouds material={THREE.MeshLambertMaterial}>
                <Cloud bounds={[20, 2, 20]} volume={15} color="#ffffff" position={[0, 18, 0]} opacity={0.6} speed={0.2} />
              </Clouds>
            )}
          </>
        )
      })()}

      {factoryMode && (
        <FactoryGrid parts={parts} visible={visible} selectedVariants={selectedVariants} />
      )}

      {/* ── Parts ────────────────────────────────────────── */}
      {!factoryMode && parts && parts.map((part) => {
        const variantIdx = selectedVariants[part.id] ?? 0
        const activeVariant = part.variants[variantIdx]
        return (
          <Part
            key={part.id}
            data={part}
            isExploded={isExploded}
            isVisible={visible[part.id]}
            onSelect={onSelect}
            onFrame={onFramePart}
            activeVariant={activeVariant}
            sequenceMode={sequenceMode}
            sequenceStep={sequenceStep}
            sectionCutActive={sectionCutActive}
            sectionCutY={sectionCutY}
            isShaking={isShaking}
            earthquakeMagnitude={earthquakeMagnitude}
            highlightedWeek={highlightedWeek}
            showAcoustic={showAcoustic}
            fireMode={fireMode}
            fireStatus={fireState?.[part.id] ?? 'ok'}
            onIgnite={onIgnite}
            compactLabels={compactLabels}
          />
        )
      })}

      {/* ── Connection indicators (deduplicated) ────────── */}
      {!factoryMode && showConnections && parts && (() => {
        const rendered = new Set()
        return parts.flatMap(partA =>
          (partA.connections ?? []).flatMap(conn => {
            const partB = parts.find(p => p.id === conn.to)
            if (!partB || !visible[partA.id] || !visible[partB.id]) return []
            const key = [partA.id, partB.id].sort().join('|')
            if (rendered.has(key)) return []
            rendered.add(key)
            return [<Connection key={key} partA={partA} partB={partB} connection={conn} isExploded={isExploded} compactLabels={compactLabels} />]
          })
        )
      })()}

      {!factoryMode && showDimensions && <DimensionLines parts={parts} visible={visible} />}

      {/* Grass / Background plane */}
      {!factoryMode && envSettings?.grass && (
        <mesh position={[0, -0.27, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClearSelect} receiveShadow>
          <planeGeometry args={[groundSize, groundSize]} />
          <meshStandardMaterial color="#557a2b" roughness={0.9} />
        </mesh>
      )}

      {/* Ken Grid — 910mm modular grid (Japan standard) */}
      {!factoryMode && envSettings?.kenGrid && (
        <gridHelper args={[kenModules * 0.91, kenModules, '#8b7355', '#c4b49a']} position={[frame.center[0], -0.265, frame.center[2]]} />
      )}

      {/* Invisible click plane when grass is off */}
      {!factoryMode && !envSettings?.grass && (
        <mesh position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClearSelect}>
          <planeGeometry args={[groundSize, groundSize]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      {/* Lift planning: click the ground to set pick-up and install points */}
      {!factoryMode && showCrane && liftPlanMode && (
        <mesh
          position={[0, -0.25, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          onClick={e => { e.stopPropagation(); onLiftPoint?.({ x: e.point.x, z: e.point.z }) }}
        >
          <planeGeometry args={[groundSize, groundSize]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {!factoryMode && showCrane && (
        <Crane
          layout={craneLayout}
          sequenceMode={sequenceMode}
          sequenceStep={sequenceStep}
          showRadius={showCraneRadius}
          currentPartWeight={currentPartWeight}
          liftStart={liftStart}
          liftEnd={liftEnd}
        />
      )}

      {!factoryMode && showCrane && showSecondCrane && (() => {
        // Crane 2 sits secondCraneX metres along X from crane 1.
        const c1x = craneLayout.x, c2x = craneLayout.x + (secondCraneX ?? -8)
        const JIB_REACH = craneLayout.jibLen
        const dist = Math.abs(c1x - c2x)
        const hasCollision = dist < JIB_REACH * 2
        const midX = (c1x + c2x) / 2
        // Overlap disc radius: how much the circles overlap
        const overlapR = hasCollision ? (JIB_REACH - dist / 2) : 0
        return (
          <group>
            <Crane
              layout={craneLayout}
              sequenceMode={false}
              sequenceStep={0}
              showRadius={showCraneRadius}
              currentPartWeight={0}
              offsetX={secondCraneX ?? -8}
            />
            {hasCollision && (
              <>
                {/* Collision zone disc */}
                <mesh position={[midX, 0.03, craneLayout.z]} rotation={[-Math.PI / 2, 0, 0]}>
                  <circleGeometry args={[Math.max(0.5, overlapR), 48]} />
                  <meshBasicMaterial color="#e74c3c" transparent opacity={0.22} />
                </mesh>
                {/* Collision zone ring outline */}
                <mesh position={[midX, 0.04, craneLayout.z]} rotation={[-Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[Math.max(0.5, overlapR), 0.08, 8, 48]} />
                  <meshBasicMaterial color="#e74c3c" transparent opacity={0.6} />
                </mesh>
              </>
            )}
          </group>
        )
      })()}

      {!factoryMode && showWindArrows && (
        <>
          <WindStreamlines parts={parts} visible={visible} windSpeed={windSpeed ?? 8} />
          <WindArrows parts={parts} visible={visible} windSpeed={windSpeed ?? 8} />
        </>
      )}

      {!factoryMode && showWaterSim && (
        <WaterFlow parts={parts} visible={visible} rainfall={rainfall} onResult={onWaterResult} />
      )}

      {!factoryMode && showThermal && (
        <ThermalOverlay parts={parts} visible={visible} selectedVariants={selectedVariants} />
      )}

      {!factoryMode && (isShaking || hasShaken) && (
        <EarthquakeEffects
          parts={parts}
          visible={visible}
          selectedVariants={selectedVariants}
          magnitude={earthquakeMagnitude ?? 6}
          isShaking={isShaking}
          hasShaken={hasShaken}
          frame={frame}
        />
      )}

      {!factoryMode && showFireCompartments && (
        <FireCompartments parts={parts} visible={visible} selectedVariants={selectedVariants} />
      )}

      {!factoryMode && fireMode && (
        <FireEffects parts={parts} visible={visible} fireState={fireState} intensity={fireIntensity} />
      )}

      <ContactShadows
        position={[frame.center[0], -0.26, frame.center[2]]}
        opacity={0.28}
        scale={Math.max(40, footprint * 2)}
        blur={1.5}
        resolution={512}
        frames={1}
      />

      <CinematicMode
        active={cinematicMode}
        controlsRef={controlsRef}
        onEnd={onCinematicEnd}
        onSetExploded={onSetExploded}
        onSetSequenceMode={onSetSequenceMode}
        onSetSequenceStep={onSetSequenceStep}
        onSetShowMetrics={onSetShowMetrics}
        maxStep={maxStep}
        frame={frame}
      />
    </Canvas>
  )
}
