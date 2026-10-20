import { useEffect, useMemo } from 'react'

const COLORS = ['#f39c12', '#e74c3c', '#3498db', '#27ae60', '#f1c40f', '#9b59b6', '#ecf0f1']

// Short result moment: a card in the middle of the screen, optional confetti.
// tone: 'win' (confetti) | 'warn' | 'fail'. Disappears by itself.
export default function Celebration({ event, onDone }) {
  const { title, subtitle, tone = 'win', ts } = event
  useEffect(() => {
    const id = setTimeout(onDone, tone === 'win' ? 4200 : 3600)
    return () => clearTimeout(id)
  }, [ts, tone, onDone])

  // Stable per event; positions are decorative only.
  const confetti = useMemo(() => {
    if (tone !== 'win') return []
    let s = Math.floor(ts % 100000)
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647
    return Array.from({ length: 48 }, (_, i) => ({
      left: rand() * 100,
      delay: rand() * 0.6,
      duration: 1.8 + rand() * 1.4,
      rotate: rand() * 360,
      drift: (rand() - 0.5) * 160,
      color: COLORS[i % COLORS.length],
      wide: rand() > 0.5,
    }))
  }, [ts, tone])

  return (
    <div className={`celebration celebration--${tone}`} onClick={onDone} role="status" aria-live="polite">
      {confetti.map((c, i) => (
        <span
          key={i}
          className={`confetti${c.wide ? ' confetti--wide' : ''}`}
          style={{
            left: `${c.left}%`,
            background: c.color,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            '--drift': `${c.drift}px`,
            '--spin': `${c.rotate + 540}deg`,
          }}
        />
      ))}
      <div className="celebration__card">
        <div className="celebration__title">{title}</div>
        {subtitle && <div className="celebration__subtitle">{subtitle}</div>}
      </div>
    </div>
  )
}
