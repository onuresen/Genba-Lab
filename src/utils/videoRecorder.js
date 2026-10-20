// Records the 3D canvas (the view only, no UI) to a video file.
const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']

export function canRecord(canvas) {
  return !!canvas?.captureStream && typeof MediaRecorder !== 'undefined'
}

// Starts recording; `stop()` resolves after the file has been downloaded.
export function startCanvasRecording(canvas, { fps = 30, fileName = 'genba-lab-build' } = {}) {
  const mimeType = TYPES.find(t => MediaRecorder.isTypeSupported(t))
  const stream = canvas.captureStream(fps)
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 8_000_000 })
  const chunks = []
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
  const done = new Promise(resolve => {
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const type = recorder.mimeType || mimeType || 'video/webm'
      const blob = new Blob(chunks, { type })
      const name = `${fileName}.${type.includes('mp4') ? 'mp4' : 'webm'}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      resolve({ fileName: name, size: blob.size })
    }
  })
  recorder.start(500)
  return {
    stop() {
      if (recorder.state !== 'inactive') recorder.stop()
      return done
    },
  }
}
