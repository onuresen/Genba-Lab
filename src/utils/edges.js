// Outline lines for part meshes.
// drei's <Edges> draws fat lines: 6 triangles per segment and a heavy shader.
// On a 350k-triangle Revit model that added ~950k triangles to every frame.
// Plain GL lines are far cheaper, and one EdgesGeometry per mesh is cached and
// built in idle time, so a model shows first and its outlines follow.
import { useEffect, useReducer } from 'react'
import * as THREE from 'three'

const cache = new WeakMap() // BufferGeometry → Map(threshold → EdgesGeometry)
const queue = []
let scheduled = false

function cached(geometry, threshold) {
  return cache.get(geometry)?.get(threshold) ?? null
}

export function edgesFor(geometry, threshold = 30) {
  let byThreshold = cache.get(geometry)
  if (!byThreshold) {
    byThreshold = new Map()
    cache.set(geometry, byThreshold)
    // Free the line buffers together with the mesh (new model, unmounted box).
    geometry.addEventListener('dispose', () => {
      for (const edges of byThreshold.values()) edges.dispose()
      cache.delete(geometry)
    })
  }
  let edges = byThreshold.get(threshold)
  if (!edges) {
    edges = new THREE.EdgesGeometry(geometry, threshold)
    byThreshold.set(threshold, edges)
  }
  return edges
}

const idle = typeof window !== 'undefined' && window.requestIdleCallback
  ? cb => window.requestIdleCallback(cb, { timeout: 120 })
  : cb => setTimeout(() => cb(null), 16)

function drain(deadline) {
  scheduled = false
  // At least one job per slice; more while the browser has idle time left.
  do {
    queue.shift()?.()
  } while (queue.length && deadline && deadline.timeRemaining() > 6)
  if (queue.length) schedule()
}

function schedule() {
  if (scheduled) return
  scheduled = true
  idle(drain)
}

// Edges for `geometry`, or null until they are built.
export function useEdges(geometry, threshold = 30) {
  const [, rerender] = useReducer(n => n + 1, 0)
  const ready = geometry ? cached(geometry, threshold) : null
  useEffect(() => {
    if (!geometry || ready) return
    let alive = true
    queue.push(() => {
      if (!alive) return
      edgesFor(geometry, threshold)
      rerender()
    })
    schedule()
    return () => { alive = false }
  }, [geometry, threshold, ready])
  return ready
}

// Lines must never steal clicks from the mesh they outline.
export function noRaycast() {}
