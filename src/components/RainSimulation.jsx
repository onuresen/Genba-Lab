import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const MAX_FALL = 150
const MAX_PUDDLES = 28
const MAX_SPLASHES = 36
const GRAVITY = 0.018
const dummy = new THREE.Object3D()

function makeParticle() {
  return { x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, active: false }
}

export default function RainSimulation({ parts, visible }) {
  const fallRef = useRef()
  const puddleRef = useRef()
  const splashRef = useRef()
  const particles = useRef(Array.from({ length: MAX_FALL }, makeParticle))
  const puddles = useRef([])
  const splashes = useRef([])
  const spawnTimer = useRef(0)

  useFrame((_, delta) => {
    if (!parts || !visible) return
    // Cap delta to avoid large physics jumps on tab restore / GPU stalls
    const dt = Math.min(delta, 1 / 30)
    spawnTimer.current += dt

    // Build emitters from roof face centres of visible parts
    const emitters = []
    for (const p of parts) {
      if (!visible[p.id]) continue
      const [px, py, pz] = p.pos
      const [W, H, D] = p.size
      emitters.push({ x: px, y: py + H / 2, z: pz, W, D })
    }
    if (emitters.length === 0) return

    // Spawn bursts every 35ms. Higher density gives rain a storm-front feel.
    if (spawnTimer.current > 0.035) {
      spawnTimer.current = 0
      let spawned = 0
      for (let i = 0; i < MAX_FALL && spawned < 7; i++) {
        const p = particles.current[i]
        if (!p.active) {
          const em = emitters[Math.floor(Math.random() * emitters.length)]
          p.x = em.x + (Math.random() - 0.5) * em.W * 0.85
          p.y = em.y + 1.8 + Math.random() * 1.6
          p.z = em.z + (Math.random() - 0.5) * em.D * 1.15
          p.vx = -0.04 + (Math.random() - 0.5) * 0.04
          p.vy = -0.12 - Math.random() * 0.06
          p.vz = (Math.random() - 0.5) * 0.05
          p.active = true
          spawned++
        }
      }
    }

    // Integrate gravity and check landing
    for (const p of particles.current) {
      if (!p.active) continue
      p.vy -= GRAVITY * dt * 60
      p.x  += p.vx * dt * 60
      p.y  += p.vy * dt * 60
      p.z  += p.vz * dt * 60

      // Find highest surface below this particle (ground or part top)
      let landY = 0
      for (const part of parts) {
        if (!visible[part.id]) continue
        const [bx, by, bz] = part.pos
        const [W, H, D] = part.size
        const topY = by + H / 2
        if (
          topY > landY &&
          p.x > bx - W / 2 && p.x < bx + W / 2 &&
          p.z > bz - D / 2 && p.z < bz + D / 2
        ) {
          landY = topY
        }
      }

      if (p.y <= landY) {
        // Accumulate into nearest puddle zone or start a new one
        const existing = puddles.current.find(
          pu => Math.abs(pu.x - p.x) < 0.6 && Math.abs(pu.z - p.z) < 0.6
        )
        if (existing) {
          existing.count = Math.min(existing.count + 1, 30)
        } else if (puddles.current.length < MAX_PUDDLES) {
          puddles.current.push({ x: p.x, z: p.z, y: landY + 0.01, count: 1 })
        }
        splashes.current.push({ x: p.x, z: p.z, y: landY + 0.025, age: 0, maxAge: 0.42 })
        if (splashes.current.length > MAX_SPLASHES) splashes.current.shift()
        // Recycle slot immediately so it can be respawned
        p.active = false
      }

      if (p.y < -3) p.active = false
    }

    // Age splash rings
    splashes.current = splashes.current
      .map(s => ({ ...s, age: s.age + dt }))
      .filter(s => s.age < s.maxAge)

    // Update falling drop instances
    if (fallRef.current) {
      let idx = 0
      for (const p of particles.current) {
        if (p.active) {
          dummy.position.set(p.x, p.y, p.z)
          dummy.rotation.set(0.28, 0, 0.1)
          dummy.scale.set(0.65, 1.9, 0.65)
          dummy.updateMatrix()
          fallRef.current.setMatrixAt(idx++, dummy.matrix)
        }
      }
      dummy.scale.setScalar(0)
      dummy.updateMatrix()
      for (let i = idx; i < MAX_FALL; i++) fallRef.current.setMatrixAt(i, dummy.matrix)
      fallRef.current.instanceMatrix.needsUpdate = true
    }

    if (splashRef.current) {
      for (let i = 0; i < MAX_SPLASHES; i++) {
        if (i < splashes.current.length) {
          const s = splashes.current[i]
          const life = s.age / s.maxAge
          dummy.position.set(s.x, s.y, s.z)
          dummy.rotation.set(-Math.PI / 2, 0, 0)
          dummy.scale.setScalar(0.16 + life * 0.72)
          dummy.updateMatrix()
          splashRef.current.setMatrixAt(i, dummy.matrix)
        } else {
          dummy.scale.setScalar(0)
          dummy.updateMatrix()
          splashRef.current.setMatrixAt(i, dummy.matrix)
        }
      }
      splashRef.current.instanceMatrix.needsUpdate = true
    }

    // Update puddle disc instances
    if (puddleRef.current) {
      const list = puddles.current
      for (let i = 0; i < MAX_PUDDLES; i++) {
        if (i < list.length) {
          const pu = list[i]
          const s = Math.min(pu.count * 0.08, 1.4)
          dummy.position.set(pu.x, pu.y, pu.z)
          dummy.rotation.set(-Math.PI / 2, 0, 0)
          dummy.scale.setScalar(s)
          dummy.updateMatrix()
          puddleRef.current.setMatrixAt(i, dummy.matrix)
        } else {
          dummy.scale.setScalar(0)
          dummy.updateMatrix()
          puddleRef.current.setMatrixAt(i, dummy.matrix)
        }
      }
      puddleRef.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      <instancedMesh ref={fallRef} args={[null, null, MAX_FALL]} frustumCulled={false}>
        <cylinderGeometry args={[0.018, 0.018, 0.24, 5]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.78} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={puddleRef} args={[null, null, MAX_PUDDLES]} frustumCulled={false}>
        <circleGeometry args={[0.5, 16]} />
        <meshBasicMaterial color="#06b6d4" transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={splashRef} args={[null, null, MAX_SPLASHES]} frustumCulled={false}>
        <torusGeometry args={[0.28, 0.012, 6, 24]} />
        <meshBasicMaterial color="#bae6fd" transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  )
}
