// lib/s211/autosave.ts
// Autosave for the S-211 builder, without React, so it can be tested with fake timers.
//
// Two triggers: a pause in typing (`schedule`, debounced) and leaving a field (`flush`, at once). Only
// one save runs at a time; a change made while a save is in flight is saved straight after it, so the
// last thing typed is always the last thing written. A failure leaves the change pending and says so;
// the next change or blur tries again.

export type AutosaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error' }

export const AUTOSAVE_DELAY_MS = 1500

/** The line under the form. */
export const autosaveLabel = (s: AutosaveState): string =>
  s.kind === 'saved' ? `Saved at ${String(s.at.getHours()).padStart(2, '0')}:${String(s.at.getMinutes()).padStart(2, '0')}`
    : s.kind === 'error' ? 'Not saved: check your connection'
    : s.kind === 'saving' ? 'Saving'
    : ''

export function createAutosaver<T>(opts: {
  save: (value: T) => Promise<boolean>
  onState: (s: AutosaveState) => void
  delayMs?: number
  now?: () => Date
}) {
  const delay = opts.delayMs ?? AUTOSAVE_DELAY_MS
  const now = opts.now ?? (() => new Date())
  let pending: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight: Promise<void> | null = null

  const run = async (): Promise<void> => {
    // A save is already running: wait for it, then write whatever arrived meanwhile.
    if (inFlight) { await inFlight; return run() }
    if (!pending) return
    const { value } = pending
    pending = null
    opts.onState({ kind: 'saving' })
    let ok = false
    inFlight = (async () => { try { ok = await opts.save(value) } catch { ok = false } })()
    try { await inFlight } finally { inFlight = null }
    if (ok) {
      opts.onState({ kind: 'saved', at: now() })
      // Something was typed during the save: write it straight away.
      if (pending) await run()
    } else {
      // Keep the unsaved value, unless something newer has arrived since. The next change or blur retries.
      if (!pending) pending = { value }
      opts.onState({ kind: 'error' })
    }
  }

  return {
    /** A change: save after the pause. */
    schedule(value: T) {
      pending = { value }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; void run() }, delay)
    },
    /** Leaving a field: save now, if anything is waiting. */
    async flush(value?: T) {
      if (value !== undefined) pending = { value }
      if (timer) { clearTimeout(timer); timer = null }
      await run()
    },
    hasPending: () => pending !== null,
    dispose() { if (timer) clearTimeout(timer); timer = null },
  }
}
