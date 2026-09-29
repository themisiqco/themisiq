import { describe, it, expect } from 'vitest'
import { createLayout } from './layout'

// The page-size option added for the Deals report. The board report calls createLayout() with no
// argument and must keep getting A4; lib/materiality/boardReport.test.ts proves the document itself
// is unchanged, and this pins the default it relies on.
describe('createLayout page size', () => {
  it('defaults to A4 portrait, 595.28 x 841.89pt', () => {
    const l = createLayout()
    expect(l.pageWidth).toBeCloseTo(595.28, 1)
    expect(l.pageHeight).toBeCloseTo(841.89, 1)
  })

  it('gives US Letter portrait, 612 x 792pt, when asked', () => {
    const l = createLayout({ format: 'letter' })
    expect(l.pageWidth).toBe(612)
    expect(l.pageHeight).toBe(792)
  })

  it('moveTo re-reads the page after something else added pages', () => {
    const l = createLayout({ format: 'letter' })
    l.doc.addPage()
    l.doc.addPage()
    expect(l.moveTo(200)).toBe(200)
    expect(l.page()).toBe(3)
    expect(l.y()).toBe(200)
  })
})
