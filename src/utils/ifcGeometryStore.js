// Mesh store for IFC-imported parts.
// Kit JSON only holds a key (part.ifcGeometry). Meshes live here:
// in memory as THREE.BufferGeometry, and in IndexedDB so they survive reload.
// If IndexedDB is unavailable, meshes last for the session and parts fall back to boxes after reload.
import { useSyncExternalStore } from 'react'
import * as THREE from 'three'

const DB_NAME = 'genba-lab-meshes'
const STORE = 'meshes'

const cache = new Map()      // key → BufferGeometry | null (null = known missing)
const pending = new Set()
const listeners = new Set()

function notify() { listeners.forEach(fn => fn()) }

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => { db.close(); dbPromise = null }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

// One connection for the session (was one open per part on reload).
let dbPromise = null
function getDb() {
  if (!dbPromise) dbPromise = openDb().catch(err => { dbPromise = null; throw err })
  return dbPromise
}

function toGeometry({ positions, normals, indices }) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  g.setIndex(new THREE.BufferAttribute(indices, 1))
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

function dropCache() {
  for (const g of cache.values()) g?.dispose()
  cache.clear()
}

// Replace all stored meshes with a new model's meshes.
export async function saveIfcGeometries(geometries) {
  dropCache()
  for (const [key, mesh] of geometries) cache.set(key, toGeometry(mesh))
  notify()
  try {
    const db = await getDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      store.clear()
      for (const [key, mesh] of geometries) store.put(mesh, key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('IFC meshes not persisted:', err)
  }
}

// Keys asked for during one render pass are read in one transaction and
// published with one notify, instead of one connection + re-render per part.
const batch = new Set()
let flushQueued = false

function loadFromDb(key) {
  pending.add(key)
  batch.add(key)
  if (flushQueued) return
  flushQueued = true
  queueMicrotask(flushBatch)
}

async function flushBatch() {
  flushQueued = false
  const keys = [...batch]
  batch.clear()
  let found = new Map()
  try {
    const db = await getDb()
    found = await new Promise((resolve, reject) => {
      const out = new Map()
      const tx = db.transaction(STORE)
      const store = tx.objectStore(STORE)
      for (const key of keys) {
        const req = store.get(key)
        req.onsuccess = () => { if (req.result) out.set(key, req.result) }
      }
      tx.oncomplete = () => resolve(out)
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Missing store or no IndexedDB: parts fall back to boxes.
  }
  for (const key of keys) {
    const mesh = found.get(key)
    cache.set(key, mesh ? toGeometry(mesh) : null)
    pending.delete(key)
  }
  notify()
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// BufferGeometry for a key, or null while loading / when missing.
export function useIfcGeometry(key) {
  return useSyncExternalStore(subscribe, () => {
    if (!key) return null
    if (!cache.has(key) && !pending.has(key)) loadFromDb(key)
    return cache.get(key) ?? null
  })
}
