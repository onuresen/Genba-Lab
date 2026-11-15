import { useRef, useEffect, useState, useMemo, memo } from 'react'
import { Html } from '@react-three/drei'
import { gsap } from 'gsap'
import * as THREE from 'three'
import { acousticColor, inferStcRating } from '../utils/materialMetrics'
import { useIfcGeometry } from '../utils/ifcGeometryStore'
import { noRaycast, useEdges } from '../utils/edges'
import { markShadowsDirty } from '../utils/shadowSync'
import { resolvePartVisual } from '../utils/partVisual'
import { motionDuration, prefersReducedMotion } from '../utils/motion'
import { quakeCompile, quakeCacheKey } from '../utils/quakeDeform'

// Stable small number per id: which way a damaged part leans.
function leanSign(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return h & 1 ? 1 : -1
}

// One imported IFC part (or group of elements).
// Renders its real mesh; falls back to a box from `size` while the mesh loads
// or if it is missing from IndexedDB.
function Part({
  data,
  isExploded,
  isVisible,
  isSelected,
  showEdges,
  onSelect,
  onFrame,
  activeVariant,
  sequenceMode,
  sequenceStep,
  sectionCutActive,
  sectionCutY,
  isShaking,
  hasShaken,
  quakeLevel, // storey damage level (structure only), from utils/seismic
  highlightedWeek,
  showAcoustic,
  fireMode,
  fireStatus,
  onFireClick,
  compactLabels,
  focusRole,
}) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const prevSequenceStep = useRef(-1)
  const ifcGeometry = useIfcGeometry(data.shape === 'ifc' ? data.ifcGeometry : null)
  const [sx, sy, sz] = data.size
  const boxGeometry = useMemo(
    () => (ifcGeometry ? null : new THREE.BoxGeometry(sx, sy, sz)),
    [ifcGeometry, sx, sy, sz]
  )
  useEffect(() => () => boxGeometry?.dispose(), [boxGeometry])
  const geometry = ifcGeometry ?? boxGeometry
  const edges = useEdges(showEdges ? geometry : null, ifcGeometry ? 30 : 15)

  const baseColor = activeVariant?.color ?? data.variants[0].color
  const stcRating = inferStcRating(activeVariant)
  const acousticTint = acousticColor(stcRating)
  const color = showAcoustic ? acousticTint : baseColor

  // ── Clipping plane ──────────────────────────────────────
  const clippingPlanes = useMemo(
    () => sectionCutActive ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), sectionCutY)] : [],
    [sectionCutActive, sectionCutY]
  )

  // ── Explode / Assemble animation ────────────────────────
  useEffect(() => {
    if (sequenceMode) return
    const target = isExploded ? data.exp : data.pos
    const hasConnections = (data.connections ?? []).length > 0
    gsap.to(meshRef.current.position, {
      x: target[0], y: target[1], z: target[2],
      duration: motionDuration(hasConnections ? 1.4 : 1),
      ease: hasConnections ? 'elastic.out(1, 0.5)' : 'expo.out',
    })
  }, [isExploded, sequenceMode])

  // ── Assembly sequence animation ─────────────────────────
  useEffect(() => {
    if (!sequenceMode) {
      gsap.to(meshRef.current.position, {
        x: data.pos[0], y: data.pos[1], z: data.pos[2],
        duration: motionDuration(0.6), ease: 'expo.out',
      })
      prevSequenceStep.current = -1
      return
    }

    const mySeq = data.sequence
    if (sequenceStep < mySeq) {
      gsap.set(meshRef.current.position, {
        x: data.exp[0], y: data.exp[1] - 6, z: data.exp[2],
      })
    } else if (sequenceStep === mySeq && prevSequenceStep.current < mySeq) {
      gsap.set(meshRef.current.position, {
        x: data.exp[0], y: data.exp[1], z: data.exp[2],
      })
      gsap.to(meshRef.current.position, {
        x: data.pos[0], y: data.pos[1], z: data.pos[2],
        duration: motionDuration(1), ease: 'expo.out',
      })
    } else if (sequenceStep > mySeq) {
      gsap.to(meshRef.current.position, {
        x: data.pos[0], y: data.pos[1], z: data.pos[2],
        duration: motionDuration(0.5), ease: 'expo.out',
      })
    }
    prevSequenceStep.current = sequenceStep
  }, [sequenceMode, sequenceStep])

  // ── Earthquake shake ─────────────────────────────────────
  // Storeys sway in the vertex shader (utils/quakeDeform.js), driven by
  // QuakePlayback from the storey time history. Reduced motion: no sway.

  // ── Earthquake damage: failed structure leans and settles ─
  // Only the structure the verdict checks (utils/seismic.js) flashes or fails:
  // quakeLevel is null for windows, doors and coverings.
  const quakeKey = quakeLevel?.key
  const afterShake = !!hasShaken && !isShaking
  const damaged = afterShake && quakeKey === 'collapse' && !sequenceMode && !isExploded
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (damaged) {
      // About 10 cm at the ends whatever the size: a long beam must not swing through the slab.
      const lean = leanSign(data.id) * Math.min(0.07, 0.22 / Math.max(...data.size))
      const drop = Math.min(0.12, data.size[1] * 0.05)
      const d = motionDuration(0.9)
      gsap.to(mesh.rotation, { z: lean, x: lean * 0.4, duration: d, delay: d && 0.25, ease: 'bounce.out' })
      gsap.to(mesh.position, { y: data.pos[1] - drop, duration: d, delay: d && 0.25, ease: 'bounce.out' })
      return () => {
        gsap.to(mesh.rotation, { x: 0, z: 0, duration: 0.5, ease: 'expo.out' })
        gsap.to(mesh.position, { y: data.pos[1], duration: 0.5, ease: 'expo.out' })
      }
    }
  }, [damaged])

  // A mesh arriving from IndexedDB or a visibility change moves its shadow.
  const seqVisible = !sequenceMode || sequenceStep >= data.sequence
  const finalVisible = isVisible && seqVisible
  useEffect(() => { markShadowsDirty() }, [geometry, finalVisible])

  // ── Pointer cursor ───────────────────────────────────────
  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hovered])

  function handleDoubleClick(e) {
    e.stopPropagation()
    onFrame?.({ pos: data.pos, size: data.size, pad: 1.8 })
  }

  function handleClick(e) {
    e.stopPropagation()
    if (fireMode) {
      onFireClick?.(data.id)
      return
    }
    if (!prefersReducedMotion()) {
      gsap.fromTo(
        meshRef.current.scale,
        { x: 1, y: 1, z: 1 },
        { x: 1.05, y: 1.05, z: 1.05, duration: 0.1, yoyo: true, repeat: 1 }
      )
    }
    onSelect({ ...data, meta: activeVariant?.meta ?? data.variants[0].meta })
  }

  // ── Material properties ──────────────────────────────────
  const shakeAtRisk = isShaking && (quakeKey === 'severe' || quakeKey === 'collapse')
  const quakeTint = afterShake && quakeKey && quakeKey !== 'ok' ? quakeLevel.color : null
  const partWeek = data.week ?? Math.ceil((data.sequence ?? 1) / 2)
  const isWeekHighlighted = highlightedWeek != null && partWeek === highlightedWeek
  const isWeekDimmed = highlightedWeek != null && partWeek !== highlightedWeek
  const visual = resolvePartVisual({
    color,
    acousticTint: showAcoustic ? acousticTint : null,
    fireStatus,
    shakeAtRisk,
    damaged,
    quakeTint,
    weekHighlighted: isWeekHighlighted,
    weekDimmed: isWeekDimmed,
    selected: isSelected,
    hovered,
    focusRole,
  })

  // ── Label ────────────────────────────────────────────────
  const showNormalLabel = hovered || (isExploded && !compactLabels) || (sequenceMode && sequenceStep === data.sequence)
  const showAcousticLabel = showAcoustic && finalVisible && !compactLabels
  const showLabel = showNormalLabel || showAcousticLabel
  const labelText = showAcousticLabel && !showNormalLabel ? `STC ${stcRating}` : data.id
  const labelY = data.size[1] / 2 + 0.25

  return (
    <mesh
      ref={meshRef}
      position={data.pos}
      visible={finalVisible}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      castShadow
      receiveShadow
    >
      {geometry && <primitive object={geometry} attach="geometry" dispose={null} />}
      <meshStandardMaterial
        color={color}
        roughness={0.82}
        transparent={visual.transparent}
        opacity={visual.opacity}
        depthWrite={visual.depthWrite}
        emissive={visual.emissive}
        emissiveIntensity={visual.emissiveIntensity}
        clippingPlanes={clippingPlanes}
        clipShadows
        side={ifcGeometry ? THREE.DoubleSide : THREE.FrontSide}
        // Push faces back a hair so outlines draw on top without flicker.
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        onBeforeCompile={quakeCompile}
        customProgramCacheKey={quakeCacheKey}
      />
      {edges && (
        <lineSegments geometry={edges} raycast={noRaycast} dispose={null}>
          <lineBasicMaterial
            color={visual.edgeColor}
            transparent
            opacity={visual.edgeOpacity}
            depthWrite={false}
            clippingPlanes={clippingPlanes}
            onBeforeCompile={quakeCompile}
            customProgramCacheKey={quakeCacheKey}
          />
        </lineSegments>
      )}

      {showLabel && (
        <Html position={[0, labelY, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="part-label">{labelText}</div>
        </Html>
      )}
    </mesh>
  )
}

export default memo(Part)
