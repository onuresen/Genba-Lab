import { useState } from 'react'

const SIZE = 68
const HALF = SIZE / 2

const FACES = [
  { id: 'top',    label: 'TOP',   transform: `rotateX(90deg) translateZ(${HALF}px)`,          preset: 'top'   },
  { id: 'front',  label: 'FRONT', transform: `translateZ(${HALF}px)`,                          preset: 'front' },
  { id: 'right',  label: 'RIGHT', transform: `rotateY(90deg) translateZ(${HALF}px)`,           preset: 'right' },
  { id: 'back',   label: 'BACK',  transform: `rotateY(180deg) translateZ(${HALF}px)`,          preset: 'back'  },
  { id: 'left',   label: 'LEFT',  transform: `rotateY(-90deg) translateZ(${HALF}px)`,          preset: 'left'  },
  { id: 'bottom', label: 'BTM',   transform: `rotateX(-90deg) translateZ(${HALF}px)`,          preset: 'bottom'},
]

export default function ViewCube({ onPreset, darkMode }) {
  const [hovered, setHovered] = useState(null)

  const bg = darkMode ? 'rgba(45,55,72,0.92)' : 'rgba(220,228,238,0.92)'
  const bgHover = darkMode ? 'rgba(99,144,199,0.95)' : 'rgba(160,196,230,0.95)'
  const border = darkMode ? '1px solid rgba(100,120,150,0.6)' : '1px solid rgba(150,170,200,0.7)'
  const text = darkMode ? '#c8d6e8' : '#3a4a5c'
  const textHover = '#fff'

  return (
    <div style={{
      position: 'fixed',
      bottom: 28,
      right: 28,
      zIndex: 15,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      userSelect: 'none',
    }}>
      {/* Cube */}
      <div style={{ width: SIZE, height: SIZE, perspective: 280 }}>
        <div style={{
          width: SIZE,
          height: SIZE,
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: 'rotateX(-22deg) rotateY(38deg)',
        }}>
          {FACES.map(face => (
            <div
              key={face.id}
              onClick={() => onPreset(face.preset)}
              onMouseEnter={() => setHovered(face.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                position: 'absolute',
                width: SIZE,
                height: SIZE,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.05em',
                fontFamily: "'Segoe UI', system-ui, sans-serif",
                transform: face.transform,
                backfaceVisibility: 'hidden',
                background: hovered === face.id ? bgHover : bg,
                border,
                color: hovered === face.id ? textHover : text,
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
                boxSizing: 'border-box',
              }}
            >
              {face.label}
            </div>
          ))}
        </div>
      </div>

      {/* Home button */}
      <div
        onClick={() => onPreset('home')}
        onMouseEnter={() => setHovered('home')}
        onMouseLeave={() => setHovered(null)}
        title="Home view (0)"
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: hovered === 'home' ? bgHover : bg,
          border,
          color: hovered === 'home' ? textHover : text,
          cursor: 'pointer',
          fontSize: 14,
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        ⌂
      </div>
    </div>
  )
}
