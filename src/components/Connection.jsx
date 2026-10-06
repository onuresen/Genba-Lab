import { useState, useEffect, useRef, useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export const TYPE_COLOR = {
  'dry-fit':       '#27ae60',
  'bolted':        '#e67e22',
  'welded':        '#e74c3c',
  'adhesive':      '#3498db',
  'damper':        '#9b59b6',
  'base-isolation':'#1abc9c',
}

const TENSION_COLOR = '#e74c3c'
const ANIM_MS = 1000

function easeExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t) }
function lerp(a, b, t) { return a + (b - a) * t }
function lerp3(a, b, t) { return [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)] }

function lerpHex(h1, h2, t) {
  const p = s => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)]
  const [r1,g1,b1] = p(h1); const [r2,g2,b2] = p(h2)
  const r = Math.round(lerp(r1,r2,t)), g = Math.round(lerp(g1,g2,t)), b = Math.round(lerp(b1,b2,t))
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

const TOOLTIP_BASE = {
  background: 'rgba(20,30,40,0.92)',
  color: '#fff',
  fontFamily: "'Segoe UI', sans-serif",
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
  lineHeight: 1.6,
  pointerEvents: 'none',
}

export default function Connection({ partA, partB, connection, isExploded, compactLabels }) {
  const [hovered, setHovered] = useState(false)
  const progress   = useRef(isExploded ? 1 : 0)
  const lastP      = useRef(NaN)
  const dotMeshRef = useRef()
  const ringMeshRef = useRef()
  const lineRef    = useRef()
  const col3       = useRef(new THREE.Color(TYPE_COLOR[connection.type] ?? '#95a5a6'))

  const typeColor = TYPE_COLOR[connection.type] ?? '#95a5a6'

  const aA = useMemo(() => partA.pos, [])
  const aB = useMemo(() => partB.pos, [])
  const eA = useMemo(() => partA.exp, [])
  const eB = useMemo(() => partB.exp, [])

  const lower  = aA[1] <= aB[1] ? partA : partB
  const lowerE = eA[1] <= eB[1] ? partA : partB
  const dotYa  = lower.pos[1]  + lower.size[1]  / 2
  const dotYe  = lowerE.exp[1] + lowerE.size[1] / 2
  const dotXa  = (aA[0] + aB[0]) / 2,  dotZa = (aA[2] + aB[2]) / 2
  const dotXe  = (eA[0] + eB[0]) / 2,  dotZe = (eA[2] + eB[2]) / 2

  const midA = useMemo(() => lerp3(aA, aB, 0.5), [])
  const midE = useMemo(() => lerp3(eA, eB, 0.5), [])

  // Animate progress ref on isExploded change
  useEffect(() => {
    const target = isExploded ? 1 : 0
    const startVal = progress.current
    const t0 = performance.now()
    let raf
    const tick = () => {
      const t = Math.min((performance.now() - t0) / ANIM_MS, 1)
      progress.current = startVal + (target - startVal) * easeExpo(t)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isExploded])

  // Drive Three.js objects directly every frame (no React re-render needed).
  // Skip all work once the explode/assemble tween has settled — otherwise this
  // runs the hex lerp + geometry rewrite + computeBoundingSphere every frame forever.
  useFrame(() => {
    const p = progress.current
    if (p === lastP.current) return
    lastP.current = p

    // Move dot + ring
    const dx = lerp(dotXa, dotXe, p), dy = lerp(dotYa, dotYe, p), dz = lerp(dotZa, dotZe, p)
    dotMeshRef.current?.position.set(dx, dy, dz)
    ringMeshRef.current?.position.set(dx, dy, dz)

    // Tension colour
    const hex = lerpHex(typeColor, TENSION_COLOR, p * 0.7)
    col3.current.set(hex)
    if (dotMeshRef.current?.material) {
      dotMeshRef.current.material.color.copy(col3.current)
      dotMeshRef.current.material.emissive.copy(col3.current)
    }
    if (ringMeshRef.current?.material) ringMeshRef.current.material.color.copy(col3.current)

    // Move line endpoints via geometry attribute
    if (lineRef.current) {
      const pA = lerp3(aA, eA, p)
      const pB = lerp3(aB, eB, p)
      const attr = lineRef.current.geometry?.attributes?.instanceStart
      if (attr) {
        attr.setXYZ(0, pA[0], pA[1], pA[2])
        attr.setXYZ(1, pB[0], pB[1], pB[2])
        attr.needsUpdate = true
        lineRef.current.geometry.computeBoundingSphere?.()
      }
    }
  })

  return (
    <group>

      {/* ── Rope line ── */}
      <Line
        ref={lineRef}
        points={[aA, aB]}
        color={typeColor}
        lineWidth={1.8}
        dashed={!isExploded}
        dashSize={0.12}
        gapSize={0.08}
        transparent
        opacity={0.7}
      />

      {/* ── Midpoint type label (only when exploded or hovered — each <Html>
          reprojects against the camera every frame, so we don't want one
          permanently mounted per connection in the assembled view) ── */}
      {((isExploded && !compactLabels) || hovered) && (
        <Html position={isExploded ? midE : midA} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <div style={{ ...TOOLTIP_BASE, fontSize: '9px', letterSpacing: '0.06em',
            borderLeft: `2px solid ${isExploded ? TENSION_COLOR : typeColor}`,
            color: isExploded ? '#ffaaaa' : '#ccc',
            paddingLeft: 5,
          }}>
            {isExploded ? `${connection.type} ⟵ tension` : connection.type}
          </div>
        </Html>
      )}

      {/* ── Interface dot ── */}
      <mesh
        ref={dotMeshRef}
        position={[dotXa, dotYa, dotZa]}
        onPointerEnter={e => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'help' }}
        onPointerLeave={() => { setHovered(false); document.body.style.cursor = 'auto' }}
      >
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color={typeColor} emissive={typeColor} emissiveIntensity={hovered ? 1 : 0.4} />
      </mesh>

      {/* ── Flat ring ── */}
      <mesh ref={ringMeshRef} position={[dotXa, dotYa, dotZa]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.14, 0.012, 8, 32]} />
        <meshStandardMaterial color={typeColor} transparent opacity={0.5} />
      </mesh>

      {/* ── Hover tooltip ── */}
      {hovered && (
        <Html position={[dotXa, dotYa + 0.3, dotZa]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div style={{ ...TOOLTIP_BASE, fontSize: '11px', borderLeft: `3px solid ${typeColor}`, padding: '6px 10px' }}>
            <div style={{ textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.08em', color: typeColor, marginBottom: 3 }}>
              {connection.type}
            </div>
            <div>{partA.id} ↔ {partB.id}</div>
            {connection.hardware && (
              <div style={{ color: '#95a5a6', fontSize: '10px', marginTop: 2 }}>{connection.hardware}</div>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}
