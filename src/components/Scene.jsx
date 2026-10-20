import { useRef, useEffect, useLayoutEffect, useMemo, memo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Environment, Lightformer, Sky, Clouds, Cloud, Stars } from '@react-three/drei'
import { gsap } from 'gsap'
import * as THREE from 'three'
import Part from './Part'
import DimensionLines from './DimensionLines'
import Connection from './Connection'
import Crane from './Crane'
import CinematicMode from './CinematicMode'
import WindArrows from './WindArrows'
import RainSimulation from './RainSimulation'
import WaterPressure from './WaterPressure'
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
import { cameraViews, fitDistance, modelFrame } from '../utils/modelMetrics'
import { factoryLayout } from '../utils/factoryLayout'
import { markShadowsDirty, takeShadowsDirty } from '../utils/shadowSync'
import { sunDirection } from '../utils/sun'
import { seismicParts } from '../utils/seismic'

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
        if (tweens[i].isActive()) {
          // A tween may move parts or the crane: their shadows move too.
          markShadowsDirty()
          invalidate()
          break
        }
      }
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [invalidate])
  return null
}

// Shadow map renders only on frames where something may have moved
// (see utils/shadowSync.js). Camera-only frames reuse the last one.
function ShadowSync() {
  const get = useThree(s => s.get)
  useEffect(() => {
    const { shadowMap } = get().gl
    shadowMap.autoUpdate = false
    shadowMap.needsUpdate = true
    return () => { shadowMap.autoUpdate = true }
  }, [get])
  // Every Scene render can change visibility, time of day or positions.
  useEffect(() => { markShadowsDirty() })
  useFrame(({ gl }) => {
    if (takeShadowsDirty()) gl.shadowMap.needsUpdate = true
  })
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
    flyTo(factoryMode ? factoryView(factory) : cameraViews(frame, camera.aspect).home)
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
      flyTo(cameraViews(frame, camera.aspect).home)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craneCabView])

  // Declared after the mode / cab-view effects so a pending command runs last
  // and overwrite:true cancels their default-view tweens.
  useEffect(() => {
    if (!cameraCmd || !controlsRef.current) return
    let pos, target

    if (cameraCmd.type === 'preset') {
      const p = cameraViews(frame, camera.aspect)[cameraCmd.preset]
      if (!p) return
      pos = p.pos; target = p.target
    } else if (cameraCmd.type === 'frame') {
      const [px, py, pz] = cameraCmd.pos
      // Fit the box on screen, portrait phones included (unit view direction).
      const dist = fitDistance(cameraCmd.size, camera.fov, camera.aspect) * (cameraCmd.pad ?? 1)
      pos = [px + dist * 0.61, py + dist * 0.51, pz + dist * 0.61]
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

// ── Lighting ───────────────────────────────────────────────
// Image-based light built in the scene from a few soft panels: no HDR download
// (the old `preset="city"` fetched 1.5 MB from a third-party CDN on every
// visit, and a blocked fetch crashed the whole canvas). Memoised: drei
// re-renders the cube map whenever its children change.
const StudioEnvironment = memo(function StudioEnvironment({ intensity }) {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={intensity}>
      <color attach="background" args={['#9aa6b2']} />
      <Lightformer form="circle" intensity={2.4} color="#ffffff" position={[0, 9, 0]} scale={14} />
      <Lightformer intensity={1.4} color="#fff2dc" position={[9, 3, 4]} scale={[14, 5, 1]} />
      <Lightformer intensity={0.9} color="#dbe7f5" position={[-9, 3, -4]} scale={[14, 5, 1]} />
      <Lightformer intensity={0.6} color="#eef2f6" position={[0, 2, -9]} scale={[18, 4, 1]} />
      <Lightformer intensity={0.35} color="#8e9a78" position={[0, -6, 0]} scale={[24, 24, 1]} />
    </Environment>
  )
})

const SUN_LOW = new THREE.Color('#ffc58a')
const SUN_HIGH = new THREE.Color('#fff6e8')
// Sun from the time-of-day slider. Casts the model's shadows; the shadow box
// follows the model size so a 70 m building gets crisp shadows too.
function Sun({ time, frame, castShadows }) {
  const lightRef = useRef()
  const target = useMemo(() => new THREE.Object3D(), [])
  const sun = sunDirection(time)
  const elevation = Math.max(0, sun.y)
  const [cx, cy, cz] = frame.center
  const r = frame.radius
  const dist = Math.max(40, r * 3)
  const dir = sun.clone().setY(Math.max(0.08, sun.y)).normalize()
  const color = useMemo(() => SUN_LOW.clone().lerp(SUN_HIGH, Math.min(1, elevation * 1.6)), [elevation])

  useLayoutEffect(() => {
    const light = lightRef.current
    if (!light) return
    const cam = light.shadow.camera
    const ext = r * 1.2 + 2
    cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext
    cam.near = Math.max(0.5, dist - ext * 2)
    cam.far = dist + ext * 2
    cam.updateProjectionMatrix()
    light.shadow.bias = -0.0003
    light.shadow.normalBias = Math.max(0.02, r * 0.0015)
    light.shadow.radius = 3
    markShadowsDirty()
  }, [r, dist])

  return (
    <>
      <primitive object={target} position={[cx, cy, cz]} />
      <directionalLight
        ref={lightRef}
        target={target}
        position={[cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist]}
        color={color}
        intensity={0.3 + 1.9 * elevation}
        castShadow={castShadows}
        shadow-mapSize={[2048, 2048]}
      />
    </>
  )
}

// A soft disc that fades into the horizon instead of a hard-edged square.
function useFadeTexture() {
  const texture = useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, '#fff')
    g.addColorStop(0.35, '#fff')
    g.addColorStop(1, '#000')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    return new THREE.CanvasTexture(canvas)
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

export default function Scene({
  isExploded,
  visible,
  onSelect,
  onClearSelect,
  selectedId,
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
  onFireClick,
  showFireCompartments,
  darkMode,
}) {
  const controlsRef = useRef()
  const { parts } = useKit()
  const craneLayout = useMemo(() => computeCraneLayout(parts), [parts])
  const frame = useMemo(() => modelFrame(parts), [parts])
  const quakeIds = useMemo(() => new Set(seismicParts(parts ?? []).map(p => p.id)), [parts])
  const fadeTexture = useFadeTexture()
  // Ken grid (910 mm module) covers the model footprint.
  const footprint = Math.max(frame.size[0], frame.size[2])
  const kenModules = Math.min(400, Math.max(20, Math.ceil((footprint + 2) / 0.91)))
  // Ground must hold the model and the crane's reach, then fade out well beyond.
  const groundSize = Math.max(100, Math.ceil((Math.abs(craneLayout.x) + craneLayout.jibLen) * 3))
  const groundRadius = Math.max(220, frame.radius * 12, groundSize)

  const time = envSettings?.time ?? 12
  const isDaytime = time > 5 && time < 19
  const daylight = Math.max(0, sunDirection(time).y)
  const shadowsOn = envSettings?.shadows !== false && !factoryMode && isDaytime
  const showEdges = envSettings?.edges !== false

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

  const background = factoryMode ? '#eef2f7' : darkMode ? '#1b212b' : '#dfe6ec'

  return (
    <Canvas
      frameloop={continuousActive ? 'always' : 'demand'}
      dpr={[1, 1.5]}
      shadows="percentage"
      style={{ position: 'absolute', inset: 0, background }}
      gl={{
        localClippingEnabled: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => onRendererReady?.(gl)}
    >
      <PerspectiveCamera makeDefault position={[8, 8, 8]} fov={45} near={0.1} far={Math.max(2000, groundRadius * 3)} />
      <OrbitControls ref={controlsRef} makeDefault enableDamping />
      <GsapBridge />
      <ShadowSync />
      {diagnosticsEnabled && <RenderDiagnostics continuousReasons={continuousReasons} />}
      <CameraController factoryMode={factoryMode} controlsRef={controlsRef} cameraCmd={cameraCmd} craneCabView={craneCabView} craneLayout={craneLayout} frame={frame} factory={factoryLayout(visibleCount)} />

      {/* ── Light: soft studio fill + sun from the time-of-day slider ── */}
      <StudioEnvironment intensity={factoryMode ? 0.9 : 0.25 + 0.6 * daylight} />
      <ambientLight intensity={factoryMode ? 0.5 : isDaytime ? 0.15 : 0.08} />
      {factoryMode || !envSettings
        ? <directionalLight position={[5, 10, 5]} intensity={1.2} />
        : (
          <>
            <Sky sunPosition={sunDirection(time).multiplyScalar(50).toArray()} turbidity={2.2} rayleigh={1.1} mieCoefficient={0.004} mieDirectionalG={0.82} />
            {isDaytime && <Sun time={time} frame={frame} castShadows={shadowsOn} />}

            {envSettings.stars && (
              <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
            )}

            {envSettings.clouds && (
              <Clouds material={THREE.MeshLambertMaterial}>
                <Cloud bounds={[20, 2, 20]} volume={15} color="#ffffff" position={[0, 18, 0]} opacity={0.6} speed={0.2} />
              </Clouds>
            )}
          </>
        )}

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
            isSelected={selectedId === part.id}
            showEdges={showEdges}
            onSelect={onSelect}
            onFrame={onFramePart}
            activeVariant={activeVariant}
            sequenceMode={sequenceMode}
            sequenceStep={sequenceStep}
            sectionCutActive={sectionCutActive}
            sectionCutY={sectionCutY}
            isShaking={isShaking}
            hasShaken={hasShaken}
            inQuakeCheck={quakeIds.has(part.id)}
            earthquakeMagnitude={earthquakeMagnitude}
            highlightedWeek={highlightedWeek}
            showAcoustic={showAcoustic}
            fireMode={fireMode}
            fireStatus={fireState?.[part.id] ?? 'ok'}
            onFireClick={onFireClick}
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

      {/* Ground: fades into the horizon, receives the sun's shadows */}
      {!factoryMode && envSettings?.grass && (
        <mesh position={[frame.center[0], -0.27, frame.center[2]]} rotation={[-Math.PI / 2, 0, 0]} onClick={onClearSelect} receiveShadow>
          <circleGeometry args={[groundRadius, 96]} />
          <meshStandardMaterial color="#6f8f52" roughness={0.95} alphaMap={fadeTexture} transparent depthWrite={false} />
        </mesh>
      )}

      {/* Ken Grid — 910mm modular grid (Japan standard) */}
      {!factoryMode && envSettings?.kenGrid && (
        <gridHelper args={[kenModules * 0.91, kenModules, '#8b7355', '#c4b49a']} position={[frame.center[0], -0.265, frame.center[2]]} />
      )}

      {/* Invisible click plane when the ground is off */}
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
          <WindArrows parts={parts} visible={visible} windSpeed={windSpeed ?? 8} frame={frame} />
        </>
      )}

      {!factoryMode && showWaterSim && (
        <RainSimulation parts={parts} visible={visible} />
      )}
      {!factoryMode && showWaterSim && (
        <WaterPressure parts={parts} visible={visible} windSpeed={windSpeed ?? 8} />
      )}

      {!factoryMode && showThermal && (
        <ThermalOverlay parts={parts} visible={visible} selectedVariants={selectedVariants} frame={frame} />
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
