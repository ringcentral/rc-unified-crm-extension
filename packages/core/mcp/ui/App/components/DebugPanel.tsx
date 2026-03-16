import { useState, useEffect } from 'react'
import { getEntries, subscribe, type DebugEntry } from '../lib/debugLog'

const LEVEL_STYLE: Record<DebugEntry['level'], string> = {
  info: 'text-blue-700',
  warn: 'text-yellow-700',
  error: 'text-red-700 font-semibold',
}

export function DebugPanel() {
  const [entries, setEntries] = useState(getEntries)
  const [open, setOpen] = useState(false)

  useEffect(() => subscribe(() => setEntries(getEntries())), [])

  return (
    <div className="mt-4 border border-default rounded-lg overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface hover:bg-surface-hover cursor-pointer text-secondary"
      >
        <span>Debug log ({entries.length} entries)</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="max-h-60 overflow-y-auto bg-black/5 p-2 space-y-0.5 font-mono">
          {entries.length === 0 && (
            <p className="text-secondary italic">No entries yet.</p>
          )}
          {entries.map((e, i) => (
            <div key={i} className={`${LEVEL_STYLE[e.level]} leading-tight`}>
              <span className="opacity-50 mr-1">{e.time}</span>
              <span>[{e.level}]</span>{' '}
              <span className="break-all">{e.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
