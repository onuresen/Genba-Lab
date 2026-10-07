import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { quakeUniforms } from '../utils/quakeDeform'
import { swayScale } from '../utils/seismic'

/** Plays the computed earthquake response: writes floor displacements into the sway shader. */
export default function QuakePlayback({ active, model, result, dir }) {
  const start = useRef(null)

  useEffect(() => {
    if (!active) { quakeUniforms.uQuakeOn.value = 0; start.current = null }
  }, [active])
  useEffect(() => () => { quakeUniforms.uQuakeOn.value = 0 }, [])

  useFrame(({ clock, invalidate }) => {
    if (!active || !model || !result) return
    const { frames } = result
    const L = frames.levels
    if (start.current == null) {
      start.current = clock.elapsedTime
      quakeUniforms.uQuakeCount.value = L
      model.levels.forEach((z, i) => { quakeUniforms.uQuakeLevels.value[i] = z })
      quakeUniforms.uQuakeDir.value.set(dir === 'z' ? 0 : 1, dir === 'z' ? 1 : 0)
    }
    const scale = swayScale(model, result)
    const f = Math.min(frames.n - 1, Math.floor((clock.elapsedTime - start.current) / frames.dt))
    for (let i = 0; i < L; i++) quakeUniforms.uQuakeDisp.value[i] = frames.disp[f * L + i] * scale
    quakeUniforms.uQuakeOn.value = 1
    invalidate()
  })
  return null
}
