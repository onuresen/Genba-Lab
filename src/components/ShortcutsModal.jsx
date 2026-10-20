const GROUPS = [
  {
    title: 'View',
    keys: [
      { key: 'S', desc: 'Select mode' },
      { key: 'X', desc: 'Section cut' },
      { key: 'D', desc: 'Dimensions' },
      { key: 'L', desc: 'Connection lines' },
      { key: 'P', desc: 'Floor plan' },
      { key: 'E', desc: 'Explode / assemble' },
      { key: '1 2 3 0', desc: 'Front, top, right, home view' },
    ],
  },
  {
    title: 'Build',
    keys: [
      { key: 'B', desc: 'Build sequence on / off' },
      { key: 'Space', desc: 'Play / pause the build' },
      { key: '← →', desc: 'One part back / forward' },
      { key: 'C', desc: 'Tower crane' },
      { key: 'F', desc: 'Factory layout' },
    ],
  },
  {
    title: 'Simulate',
    keys: [
      { key: 'Q', desc: 'Earthquake' },
      { key: 'W', desc: 'Wind' },
      { key: 'R', desc: 'Rain' },
      { key: 'I', desc: 'Fire (click parts to put them out)' },
      { key: 'T', desc: 'Thermal bridges' },
      { key: 'A', desc: 'Acoustics' },
      { key: 'M', desc: 'Metrics' },
    ],
  },
  {
    title: 'General',
    keys: [
      { key: 'Esc', desc: 'Close the top panel / clear selection' },
      { key: 'Ctrl Z / Y', desc: 'Undo / redo' },
      { key: '?', desc: 'This list' },
    ],
  },
]

export default function ShortcutsModal({ onClose }) {
  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal shortcuts-modal--wide" onClick={e => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className="shortcuts-header">
          <span className="shortcuts-title">Keyboard Shortcuts</span>
          <button className="shortcuts-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="shortcuts-grid">
          {GROUPS.map(group => (
            <div key={group.title}>
              <div className="shortcuts-group-title">{group.title}</div>
              <table className="shortcuts-table">
                <tbody>
                  {group.keys.map(({ key, desc }) => (
                    <tr key={key}>
                      <td><kbd className="shortcuts-kbd">{key}</kbd></td>
                      <td className="shortcuts-desc">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="shortcuts-footer">Mouse: drag to orbit · right-drag to pan · scroll to zoom · double-click a part to zoom to it</div>
      </div>
    </div>
  )
}
