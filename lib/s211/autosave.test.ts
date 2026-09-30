import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createAutosaver, autosaveLabel, AUTOSAVE_DELAY_MS, type AutosaveState } from './autosave'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const setup = (save: (v: string) => Promise<boolean>) => {
  const states: AutosaveState[] = []
  const a = createAutosaver<string>({ save, onState: s => states.push(s), now: () => new Date(2026, 8, 30, 14, 32) })
  return { a, states }
}

describe('autosave', () => {
  it('typing: one save after the pause, with the latest text', async () => {
    const save = vi.fn(async () => true)
    const { a, states } = setup(save)
    a.schedule('W'); a.schedule('We'); a.schedule('We took')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('We took')
    expect(autosaveLabel(states.at(-1)!)).toBe('Saved at 14:32')
  })

  it('leaving a field saves at once, without waiting for the pause', async () => {
    const save = vi.fn(async () => true)
    const { a } = setup(save)
    a.schedule('draft')
    await a.flush('draft final')
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('draft final')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('a failure says so, keeps the change, and the next blur writes it', async () => {
    let ok = false
    const save = vi.fn(async () => ok)
    const { a, states } = setup(save)
    await a.flush('text')
    expect(autosaveLabel(states.at(-1)!)).toBe('Not saved: check your connection')
    expect(a.hasPending()).toBe(true)
    ok = true
    await a.flush()
    expect(save).toHaveBeenLastCalledWith('text')
    expect(autosaveLabel(states.at(-1)!)).toBe('Saved at 14:32')
    expect(a.hasPending()).toBe(false)
  })

  it('a thrown error is a failure, not a crash', async () => {
    const { a, states } = setup(async () => { throw new Error('offline') })
    await a.flush('x')
    expect(states.at(-1)).toEqual({ kind: 'error' })
  })

  it('a change made during a save is written straight after it, last value last', async () => {
    let release!: () => void
    const saved: string[] = []
    const save = vi.fn((v: string) => new Promise<boolean>(r => { saved.push(v); release = () => r(true) }))
    const { a } = setup(save)
    const first = a.flush('one')
    await Promise.resolve()
    const second = a.flush('two')
    release(); await Promise.resolve(); await Promise.resolve()
    release(); await first; await second
    expect(saved).toEqual(['one', 'two'])
  })
})
