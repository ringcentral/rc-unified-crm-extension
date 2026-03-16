export interface DebugEntry {
  time: string
  level: 'info' | 'warn' | 'error'
  msg: string
}

const MAX_ENTRIES = 50;
const entries: DebugEntry[] = [];
const listeners = new Set<() => void>();

function ts() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function push(level: DebugEntry['level'], parts: unknown[]) {
  const msg = parts
    .map((p) => (typeof p === 'object' ? JSON.stringify(p) : String(p)))
    .join(' ');
  entries.push({ time: ts(), level, msg });
  if (entries.length > MAX_ENTRIES) entries.shift();
  // Mirror to real console
  if (level === 'error') console.error('[debug]', msg);
  else if (level === 'warn') console.warn('[debug]', msg);
  else console.log('[debug]', msg);
  listeners.forEach((fn) => fn());
}

export const dbg = {
  info: (...args: unknown[]) => push('info', args),
  warn: (...args: unknown[]) => push('warn', args),
  error: (...args: unknown[]) => push('error', args),
};

export function getEntries(): DebugEntry[] {
  return [...entries];
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
