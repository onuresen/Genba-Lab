const SHORTCUTS = [
  { key: 'E', desc: 'Explode / Assemble' },
  { key: 'D', desc: 'Toggle dimension lines' },
  { key: 'M', desc: 'Open / close Metrics panel' },
  { key: 'X', desc: 'Toggle section cut' },
  { key: 'F', desc: 'Toggle Factory layout' },
  { key: 'S', desc: 'Return to Select mode' },
  { key: 'Esc', desc: 'Clear selection / close panels' },
  { key: '?', desc: 'Show this shortcuts list' },
]

export default function ShortcutsModal({ onClose }) {
  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-header">
          <span className="shortcuts-title">Keyboard Shortcuts</span>
          <button className="shortcuts-close" onClick={onClose}>✕</button>
        </div>
        <table className="shortcuts-table">
          <tbody>
            {SHORTCUTS.map(({ key, desc }) => (
              <tr key={key}>
                <td><kbd className="shortcuts-kbd">{key}</kbd></td>
                <td className="shortcuts-desc">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="shortcuts-footer">Press <kbd className="shortcuts-kbd">?</kbd> to toggle</div>
      </div>
    </div>
  )
}
