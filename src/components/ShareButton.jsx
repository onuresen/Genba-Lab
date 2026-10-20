import { Camera } from 'lucide-react'

export default function ShareButton({ onShare, disabled, tooltip }) {
  const info = { label: 'Screenshot', hint: 'Save a PNG and copy a LinkedIn caption' }
  return (
    <button
      className="tb-btn"
      aria-label={info.label}
      onClick={onShare}
      disabled={disabled}
      onMouseEnter={e => tooltip?.show(e, info)}
      onMouseLeave={tooltip?.hide}
      onMouseDown={e => { e.preventDefault(); tooltip?.hide() }}
    >
      <Camera size={15} />
    </button>
  )
}
