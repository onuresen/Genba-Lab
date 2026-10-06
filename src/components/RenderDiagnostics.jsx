import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

// Enabled with ?perf=1. It does not schedule frames or poll while the scene is
// idle; it only counts frames that R3F was already going to render.
export default function RenderDiagnostics({ continuousReasons }) {
  const gl = useThree(state => state.gl)
  const get = useThree(state => state.get)
  const counters = useRef({
    startedAt: 0,
    resetAt: 0,
    totalFrames: 0,
    framesSinceReset: 0,
    lastFrameAt: null,
  })
  const reasonsRef = useRef(continuousReasons)
  const canvasRef = useRef(null)

  useEffect(() => {
    reasonsRef.current = continuousReasons
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    canvas.dataset.kopPerfReasons = JSON.stringify(continuousReasons)
    canvas.dataset.kopPerfFrameloop = get().frameloop
  }, [continuousReasons, get])

  useFrame(() => {
    const now = performance.now()
    counters.current.totalFrames += 1
    counters.current.framesSinceReset += 1
    counters.current.lastFrameAt = now
    const canvas = canvasRef.current
    if (canvas) {
      canvas.dataset.kopPerfFrames = String(counters.current.totalFrames)
      canvas.dataset.kopPerfLastFrame = String(now)
      canvas.dataset.kopPerfCalls = String(gl.info.render.calls)
      canvas.dataset.kopPerfTriangles = String(gl.info.render.triangles)
      canvas.dataset.kopPerfGeometries = String(gl.info.memory.geometries)
      canvas.dataset.kopPerfTextures = String(gl.info.memory.textures)
      canvas.dataset.kopPerfPrograms = String(gl.info.programs?.length ?? 0)
    }
  })

  useEffect(() => {
    const mountedAt = performance.now()
    counters.current.startedAt = mountedAt
    counters.current.resetAt = mountedAt

    const canvas = document.querySelector('canvas')
    canvasRef.current = canvas
    if (canvas) {
      canvas.dataset.kopPerfReady = 'true'
      canvas.dataset.kopPerfFrames = '0'
    }

    const diagnostics = {
      version: 1,
      reset() {
        counters.current.resetAt = performance.now()
        counters.current.framesSinceReset = 0
        return diagnostics.read()
      },
      read() {
        const now = performance.now()
        const elapsedMs = now - counters.current.resetAt
        const info = gl.info
        return {
          timestamp: now,
          frameloop: get().frameloop,
          continuousReasons: [...reasonsRef.current],
          totalFrames: counters.current.totalFrames,
          framesSinceReset: counters.current.framesSinceReset,
          elapsedMs,
          averageFpsSinceReset: elapsedMs > 0
            ? counters.current.framesSinceReset * 1000 / elapsedMs
            : 0,
          idleForMs: counters.current.lastFrameAt == null
            ? now - counters.current.startedAt
            : now - counters.current.lastFrameAt,
          renderer: {
            calls: info.render.calls,
            triangles: info.render.triangles,
            lines: info.render.lines,
            points: info.render.points,
            geometries: info.memory.geometries,
            textures: info.memory.textures,
            programs: info.programs?.length ?? 0,
          },
        }
      },
    }

    window.__KOP_PERF__ = diagnostics
    return () => {
      if (window.__KOP_PERF__ === diagnostics) delete window.__KOP_PERF__
      if (canvas) {
        delete canvas.dataset.kopPerfReady
        delete canvas.dataset.kopPerfFrames
        delete canvas.dataset.kopPerfLastFrame
        delete canvas.dataset.kopPerfReasons
        delete canvas.dataset.kopPerfFrameloop
        delete canvas.dataset.kopPerfCalls
        delete canvas.dataset.kopPerfTriangles
        delete canvas.dataset.kopPerfGeometries
        delete canvas.dataset.kopPerfTextures
        delete canvas.dataset.kopPerfPrograms
      }
      canvasRef.current = null
    }
  }, [get, gl])

  return null
}
