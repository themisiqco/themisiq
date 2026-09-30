import { describe, it, expect } from 'vitest'
import { isFirstVisit, recordVisit, type VisitStore } from './visits'

const memory = (): VisitStore => { const m = new Map<string, string>(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) } }

describe('first visit to a section (review item A1)', () => {
  it('is first until recorded, then not, per report and per section', () => {
    const s = memory()
    expect(isFirstVisit(s, 'r1', 'risks')).toBe(true)
    recordVisit(s, 'r1', 'risks')
    expect(isFirstVisit(s, 'r1', 'risks')).toBe(false)
    expect(isFirstVisit(s, 'r1', 'training')).toBe(true)
    expect(isFirstVisit(s, 'r2', 'risks')).toBe(true)
  })

  it('reading it twice before the visit is recorded gives the same answer both times (the strict-mode double run)', () => {
    const s = memory()
    const first = isFirstVisit(s, 'r1', 'risks'), again = isFirstVisit(s, 'r1', 'risks')
    expect([first, again]).toEqual([true, true])
  })

  it('no storage, or storage that throws: the panels open every time rather than never', () => {
    expect(isFirstVisit(null, 'r1', 'risks')).toBe(true)
    const broken: VisitStore = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(() => recordVisit(broken, 'r1', 'risks')).not.toThrow()
    expect(isFirstVisit(broken, 'r1', 'risks')).toBe(true)
  })
})
