import { useRef, useEffect, useState, useMemo, memo } from 'react'
import { Edges, Html } from '@react-three/drei'
import { gsap } from 'gsap'
import * as THREE from 'three'
import { acousticColor, inferStcRating } from '../utils/materialMetrics'
import { useIfcGeometry } from '../utils/ifcGeometryStore'

// One imported IFC part (or group of elements).
// Renders its real mesh; falls back to a box from `size` while the mesh loads
// or if it is missing from IndexedDB.
function Part({
  data,
  isExploded,
  isVisible,
  onSelect,
  onFrame,
  activeVariant,
  sequenceMode,
  sequenceStep,
  sectionCutActive,
  sectionCutY,
  isShaking,
  earthquakeMagnitude,
  highlightedWeek,
  showAcoustic,
  fireMode,
  fireStatus,
  onIgnite,
  compactLabels,
}) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const prevSequenceStep = useRef(-1)
  const ifcGeometry = useIfcGeometry(data.shape === 'ifc' ? data.ifcGeometry : null)

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
      duration: hasConnections ? 1.4 : 1,
      ease: hasConnections ? 'elastic.out(1, 0.5)' : 'expo.out',
    })
  }, [isExploded, sequenceMode])

  // ── Assembly sequence animation ─────────────────────────
  useEffect(() => {
    if (!sequenceMode) {
      gsap.to(meshRef.current.position, {
        x: data.pos[0], y: data.pos[1], z: data.pos[2],
        duration: 0.6, ease: 'expo.out',
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
        duration: 1, ease: 'expo.out',
      })
    } else if (sequenceStep > mySeq) {
      gsap.to(meshRef.current.position, {
        x: data.pos[0], y: data.pos[1], z: data.pos[2],
        duration: 0.5, ease: 'expo.out',
      })
    }
    prevSequenceStep.current = sequenceStep
  }, [sequenceMode, sequenceStep])

  // ── Earthquake shake ─────────────────────────────────────
  useEffect(() => {
    if (!isShaking || !meshRef.current) return
    const mesh = meshRef.current
    const baseX = mesh.position.x
    const baseY = mesh.position.y
    const baseZ = mesh.position.z
    const baseRotZ = mesh.rotation.z
    const seismicGrade = activeVariant?.seismic_grade ?? 1
    const hasBaseIso = (data.connections ?? []).some(c => c.type === 'base-isolation')
    const isoFactor = hasBaseIso ? 0.15 : 1
    const amplitude = (earthquakeMagnitude ?? 5) * 0.055 * (1 / seismicGrade) * isoFactor
    const cycles = Math.round((earthquakeMagnitude ?? 5) * 4)
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(mesh.position, { x: baseX, y: baseY, z: baseZ, duration: 0.4, ease: 'expo.out' })
        gsap.to(mesh.rotation, { z: baseRotZ, duration: 0.4, ease: 'expo.out' })
      },
    })
    for (let i = 0; i < cycles; i++) {
      const a = (i / cycles) * Math.PI * 4 + Math.random() * 0.5
      tl.to(mesh.position, {
        x: baseX + Math.cos(a) * amplitude * (1 - i / cycles * 0.5),
        y: baseY + Math.abs(Math.sin(a * 1.3)) * amplitude * 0.18,
        z: baseZ + Math.sin(a) * amplitude * (1 - i / cycles * 0.5),
        duration: 0.07, ease: 'none',
      }, '<')
      tl.to(mesh.rotation, {
        z: baseRotZ + Math.sin(a) * amplitude * 0.1,
        duration: 0.07, ease: 'none',
      }, '<')
    }
    tl.to(mesh.position, { x: baseX, y: baseY, z: baseZ, duration: 0.4, ease: 'expo.out' })
    tl.to(mesh.rotation, { z: baseRotZ, duration: 0.4, ease: 'expo.out' }, '<')
    return () => {
      tl.kill()
      gsap.to(mesh.position, { x: baseX, y: baseY, z: baseZ, duration: 0.2 })
      gsap.to(mesh.rotation, { z: baseRotZ, duration: 0.2 })
    }
  }, [isShaking])

  // ── Pointer cursor ───────────────────────────────────────
  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : 'auto'
    return () => { document.body.style.cursor = 'auto' }
  }, [hovered])

  function handleDoubleClick(e) {
    e.stopPropagation()
    onFrame?.({ pos: data.pos, size: data.size })
  }

  function handleClick(e) {
    e.stopPropagation()
    if (fireMode) {
      onIgnite?.(data.id)
      return
    }
    gsap.fromTo(
      meshRef.current.scale,
      { x: 1, y: 1, z: 1 },
      { x: 1.05, y: 1.05, z: 1.05, duration: 0.1, yoyo: true, repeat: 1 }
    )
    onSelect({ ...data, meta: activeVariant?.meta ?? data.variants[0].meta })
  }

  // ── Visibility ───────────────────────────────────────────
  const seqVisible = !sequenceMode || sequenceStep >= data.sequence
  const finalVisible = isVisible && seqVisible

  // ── Material properties ──────────────────────────────────
  const seismicGrade = activeVariant?.seismic_grade ?? 1
  const shakeAtRisk = isShaking && earthquakeMagnitude != null && earthquakeMagnitude > seismicGrade * 2.2
  const partWeek = data.week ?? Math.ceil((data.sequence ?? 1) / 2)
  const isWeekHighlighted = highlightedWeek != null && partWeek === highlightedWeek
  const isWeekDimmed = highlightedWeek != null && partWeek !== highlightedWeek
  const emissive = fireStatus === 'burning' ? '#ff6600'
    : fireStatus === 'failed' ? '#330000'
    : shakeAtRisk ? '#e74c3c'
    : isWeekHighlighted ? '#3498db'
    : showAcoustic ? acousticTint
    : color
  const emissiveIntensity = fireStatus === 'burning' ? 1.2
    : fireStatus === 'failed' ? 0.6
    : shakeAtRisk ? 0.8 : isWeekHighlighted ? 0.5 : showAcoustic ? 0.35 : (hovered ? 0.25 : 0)
  const opacity = fireStatus === 'failed' ? 0.6 : isWeekDimmed ? 0.25 : 1
  const transparent = isWeekDimmed || fireStatus === 'failed'
  const edgesColor = hovered ? '#ffffff' : 'black'

  // ── Label ────────────────────────────────────────────────
  const showNormalLabel = hovered || (isExploded && !compactLabels) || (sequenceMode && sequenceStep === data.sequence)
  const showAcousticLabel = showAcoustic && finalVisible
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
      {ifcGeometry
        ? <primitive object={ifcGeometry} attach="geometry" dispose={null} />
        : <boxGeometry args={data.size} />}
      <meshStandardMaterial
        color={color}
        transparent={transparent}
        opacity={opacity}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        clippingPlanes={clippingPlanes}
        clipShadows
        side={ifcGeometry ? THREE.DoubleSide : THREE.FrontSide}
      />
      <Edges threshold={ifcGeometry ? 30 : 15} color={edgesColor} />

      {showLabel && (
        <Html position={[0, labelY, 0]} center distanceFactor={9} style={{ pointerEvents: 'none' }}>
          <div className="part-label">{labelText}</div>
        </Html>
      )}
    </mesh>
  )
}

export default memo(Part)
