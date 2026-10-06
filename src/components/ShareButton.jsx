import { Camera } from 'lucide-react'

export default function ShareButton({ onShare, disabled }) {
  return (
    <button
      className="tb-btn"
      title="Screenshot + copy LinkedIn caption"
      onClick={onShare}
      disabled={disabled}
    >
      <Camera size={15} />
    </button>
  )
}
