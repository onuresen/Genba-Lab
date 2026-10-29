import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { gsap } from 'gsap'
import { prefersReducedMotion } from '../utils/motion'

// Drives the camera through a scripted demo sequence.
// Called from Scene when cinematicMode=true; calls onEnd when the tour finishes.
// Positions were written for the ≈5 m Kit-of-Parts kit. They are scaled by the
// model's radius and moved to its centre (`frame` from utils/modelMetrics.js).
export default function CinematicMode({ active, controlsRef, onEnd, onSetExploded, onSetSequenceMode, onSetSequenceStep, onSetShowMetrics, maxStep, frame }) {
  const { camera } = useThree()
  const tlRef = useRef(null)

  useEffect(() => {
    if (!active) {
      tlRef.current?.kill()
      return
    }

    const k = Math.max(1, (frame?.radius ?? 4) / 4.5)
    const [fx, fy, fz] = frame?.center ?? [0, 1, 0]
    // P: camera position in kit units → world. T: look-at target (model centre, nudged up).
    const P = (x, y, z) => ({ x: fx + x * k, y: fy + y * k, z: fz + z * k })
    const T = (dy = 0) => ({ x: fx, y: fy + dy * k, z: fz })

    // Disable orbit controls for the duration
    if (controlsRef.current) controlsRef.current.enabled = false

    // Reduced motion: each camera move becomes a cut, then holds for the same time.
    const reduced = prefersReducedMotion()
    const update = () => controlsRef.current?.update()
    const camTo = (to, duration, ease) => reduced
      ? tl.set(camera.position, to).to({}, { duration })
      : tl.to(camera.position, { ...to, duration, ease })
    const lookAt = (to, duration, ease) => reduced
      ? tl.set(controlsRef.current.target, { ...to, onComplete: update }, '<')
      : tl.to(controlsRef.current.target, { ...to, duration, ease, onUpdate: update }, '<')
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
    camTo(P(10, 6, 10), 2, 'power2.inOut')
    if (controlsRef.current) {
      lookAt(T(0.2), 2, 'power2.inOut')
    }

    // ── Phase 2: Slow orbit while assembled ───────────────
    camTo(P(-10, 6, 10), 4, 'none')
    if (controlsRef.current) {
      lookAt(T(0.2), 4, 'none')
    }

    // ── Phase 3: Explode ──────────────────────────────────
    tl.call(() => onSetExploded(true))
    camTo(P(12, 9, 12), 1.5, 'power2.inOut')

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
    camTo(P(8, 8, 8), 1.2, 'expo.inOut')
    if (controlsRef.current) {
      lookAt(T(0), 1.2, 'expo.inOut')
    }

    // Eight beats spread over the whole build, so big models show progress too.
    const total = Math.max(1, maxStep ?? 5)
    const steps = Math.min(total, 8)
    for (let i = 1; i <= steps; i++) {
      const step = Math.round((i / steps) * total)
      tl.call(() => onSetSequenceStep(step))
      tl.to({}, { duration: 1.0 })
    }

    // ── Phase 6: Metrics reveal ───────────────────────────
    tl.call(() => {
      onSetSequenceMode(false)
      onSetShowMetrics(true)
    })
    camTo(P(8, 8, 8), 1, 'expo.inOut')

    // hold metrics
    tl.to({}, { duration: 3 })

    // ── Phase 7: Final hero orbit ─────────────────────────
    tl.call(() => onSetShowMetrics(false))
    camTo(P(10, 7, 10), 1.5, 'power2.inOut')
    if (controlsRef.current) {
      lookAt(T(0.2), 1.5, 'power2.inOut')
    }
    camTo(P(-10, 7, -4), 5, 'none')

    return () => {
      tl.kill()
      if (controlsRef.current) controlsRef.current.enabled = true
    }
  }, [active])

  return null
}
