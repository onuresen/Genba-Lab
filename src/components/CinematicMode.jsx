import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { gsap } from 'gsap'

// Drives the camera through a scripted demo sequence.
// Called from Scene when cinematicMode=true; calls onEnd when the tour finishes.
export default function CinematicMode({ active, controlsRef, onEnd, onSetExploded, onSetSequenceMode, onSetSequenceStep, onSetShowMetrics, maxStep }) {
  const { camera } = useThree()
  const tlRef = useRef(null)

  useEffect(() => {
    if (!active) {
      tlRef.current?.kill()
      return
    }

    // Disable orbit controls for the duration
    if (controlsRef.current) controlsRef.current.enabled = false

    function animCam(pos, target, duration = 1.5, ease = 'power2.inOut') {
      return [
        gsap.to(camera.position, { x: pos[0], y: pos[1], z: pos[2], duration, ease }),
        controlsRef.current && gsap.to(controlsRef.current.target, {
          x: target[0], y: target[1], z: target[2], duration, ease,
          onUpdate: () => controlsRef.current?.update(),
        }),
      ]
    }

    const tl = gsap.timeline({
      onComplete: () => {
        if (controlsRef.current) controlsRef.current.enabled = true
        onEnd?.()
      },
    })
    tlRef.current = tl

    // ── Phase 1: Hero orbit — assembled view ──────────────
    tl.call(() => {
      onSetExploded(false)
      onSetSequenceMode(false)
      onSetShowMetrics(false)
    })
    tl.to(camera.position, { x: 10, y: 6, z: 10, duration: 2, ease: 'power2.inOut' })
    if (controlsRef.current) {
      tl.to(controlsRef.current.target, { x: 0, y: 1, z: 0, duration: 2, ease: 'power2.inOut', onUpdate: () => controlsRef.current?.update() }, '<')
    }

    // ── Phase 2: Slow orbit while assembled ───────────────
    tl.to(camera.position, { x: -10, y: 6, z: 10, duration: 4, ease: 'none' })
    if (controlsRef.current) {
      tl.to(controlsRef.current.target, { x: 0, y: 1, z: 0, duration: 4, ease: 'none', onUpdate: () => controlsRef.current?.update() }, '<')
    }

    // ── Phase 3: Explode ──────────────────────────────────
    tl.call(() => onSetExploded(true))
    tl.to(camera.position, { x: 12, y: 9, z: 12, duration: 1.5, ease: 'power2.inOut' })

    // hold exploded view
    tl.to({}, { duration: 2.5 })

    // ── Phase 4: Reassemble ───────────────────────────────
    tl.call(() => onSetExploded(false))
    tl.to({}, { duration: 1.5 })

    // ── Phase 5: Sequence mode — step through assembly ────
    tl.call(() => {
      onSetExploded(false)
      onSetSequenceMode(true)
      onSetSequenceStep(0)
    })
    tl.to(camera.position, { x: 8, y: 8, z: 8, duration: 1.2, ease: 'expo.inOut' })
    if (controlsRef.current) {
      tl.to(controlsRef.current.target, { x: 0, y: 0, z: 0, duration: 1.2, ease: 'expo.inOut', onUpdate: () => controlsRef.current?.update() }, '<')
    }

    const steps = Math.min(maxStep ?? 5, 8)
    for (let i = 1; i <= steps; i++) {
      const step = i
      tl.call(() => onSetSequenceStep(step))
      tl.to({}, { duration: 1.0 })
    }

    // ── Phase 6: Metrics reveal ───────────────────────────
    tl.call(() => {
      onSetSequenceMode(false)
      onSetShowMetrics(true)
    })
    tl.to(camera.position, { x: 8, y: 8, z: 8, duration: 1, ease: 'expo.inOut' })

    // hold metrics
    tl.to({}, { duration: 3 })

    // ── Phase 7: Final hero orbit ─────────────────────────
    tl.call(() => onSetShowMetrics(false))
    tl.to(camera.position, { x: 10, y: 7, z: 10, duration: 1.5, ease: 'power2.inOut' })
    if (controlsRef.current) {
      tl.to(controlsRef.current.target, { x: 0, y: 1, z: 0, duration: 1.5, ease: 'power2.inOut', onUpdate: () => controlsRef.current?.update() }, '<')
    }
    tl.to(camera.position, { x: -10, y: 7, z: -4, duration: 5, ease: 'none' })

    return () => {
      tl.kill()
      if (controlsRef.current) controlsRef.current.enabled = true
    }
  }, [active])

  return null
}
