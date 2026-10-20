import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'

function hasFiles(e) {
  return [...(e.dataTransfer?.types ?? [])].includes('Files')
}

// Drop an .ifc file anywhere in the window to open it.
export default function DropOverlay({ onFile }) {
  const [active, setActive] = useState(false)
  const depth = useRef(0)

  useEffect(() => {
    function enter(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setActive(true)
    }
    function over(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    function leave(e) {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setActive(false)
    }
    function drop(e) {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setActive(false)
      const file = [...e.dataTransfer.files].find(f => /\.ifc$/i.test(f.name)) ?? e.dataTransfer.files[0]
      if (file) onFile(file)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [onFile])

  if (!active) return null
  return (
    <div className="drop-overlay">
      <div className="drop-overlay__card">
        <Upload size={28} />
        <strong>Drop to open the model</strong>
        <span>.ifc files only. Nothing is uploaded.</span>
      </div>
    </div>
  )
}
