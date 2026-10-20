import { useMemo } from 'react'
import { Play, Pause, SkipBack, ChevronLeft, ChevronRight, X, Video, Square } from 'lucide-react'

const PLAYER_SPEEDS = [1, 2, 4]

// Bottom bar for the build sequence: play / pause, step, scrub, speed.
// Storeys are marked on the timeline so you can jump to "3F".
export default function SequencePlayer({
  parts, step, maxStep, playing, speed,
  onTogglePlay, onStep, onSeek, onSpeed, onExit,
  recording, onToggleRecord,
}) {
  const sorted = useMemo(
    () => [...(parts ?? [])].sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99)),
    [parts]
  )
  // Contiguous runs of the same storey along the sequence.
  const storeys = useMemo(() => {
    const runs = []
    sorted.forEach((p, i) => {
      const name = p.fire_compartment ?? ''
      const last = runs[runs.length - 1]
      if (last && last.name === name) last.end = i + 1
      else runs.push({ name, start: i + 1, end: i + 1 })
    })
    return runs.length > 1 ? runs : []
  }, [sorted])

  const current = step > 0 ? sorted[step - 1] : null
  const done = step >= maxStep && maxStep > 0
  const pct = maxStep > 0 ? (step / maxStep) * 100 : 0

  return (
    // Clicks keep focus off the buttons, so Space keeps meaning play / pause.
    <div className="seq-player" role="region" aria-label="Build sequence player" onMouseDown={e => { if (e.target.tagName !== 'INPUT') e.preventDefault() }}>
      <div className="seq-player__controls">
        <button className="seq-player__btn" onClick={() => onSeek(0)} aria-label="Back to start" title="Back to start">
          <SkipBack size={14} />
        </button>
        <button className="seq-player__btn" onClick={() => onStep(-1)} disabled={step === 0} aria-label="Previous part (←)" title="Previous part (←)">
          <ChevronLeft size={16} />
        </button>
        <button className="seq-player__play" onClick={onTogglePlay} aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="seq-player__btn" onClick={() => onStep(1)} disabled={done} aria-label="Next part (→)" title="Next part (→)">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="seq-player__body">
        <div className="seq-player__label">
          <strong>{done ? 'Topped out' : current ? current.id : 'Ready to build'}</strong>
          <span>{step} / {maxStep}</span>
          {storeys.length > 0 && (
            <div className="seq-player__storeys" role="group" aria-label="Jump to a storey">
              {storeys.map(s => (
                <button
                  key={`${s.name}-${s.start}`}
                  className={current?.fire_compartment === s.name ? 'is-current' : step >= s.end ? 'is-done' : ''}
                  onClick={() => onSeek(s.end)}
                  title={`Build up to ${s.name}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="seq-player__track">
          <div className="seq-player__fill" style={{ width: `${pct}%` }} />
          {storeys.slice(1).map(s => (
            <span key={`t-${s.name}-${s.start}`} className="seq-player__tick" style={{ left: `${((s.start - 1) / maxStep) * 100}%` }} />
          ))}
          <input
            type="range"
            min={0}
            max={maxStep}
            step={1}
            value={step}
            onChange={e => onSeek(Number(e.target.value))}
            aria-label="Build progress"
          />
        </div>
      </div>

      <button
        className={`seq-player__rec${recording ? ' is-recording' : ''}`}
        onClick={onToggleRecord}
        title={recording ? 'Stop and save the video' : 'Record the build as a video (orbiting camera, no UI)'}
        aria-label={recording ? 'Stop recording' : 'Record video'}
      >
        {recording ? <Square size={11} /> : <Video size={14} />}
        <span>{recording ? 'REC' : 'Video'}</span>
      </button>
      <div className="seq-player__speed" role="group" aria-label="Speed">
        {PLAYER_SPEEDS.map(s => (
          <button key={s} className={speed === s ? 'is-active' : ''} onClick={() => onSpeed(s)}>{s}×</button>
        ))}
      </div>
      <button className="seq-player__btn seq-player__close" onClick={onExit} aria-label="Leave build mode (B)" title="Leave build mode (B)">
        <X size={14} />
      </button>
    </div>
  )
}
