import { describe, it, expect } from 'vitest'
import { defaultReportingYear, toggleChecklist } from './defaults'

describe('the reporting year offered on "Start a report" (review item C17)', () => {
  it('is the next report due: after May 31, next year', () => {
    expect(defaultReportingYear(new Date(2026, 8, 30))).toBe(2027)
    expect(defaultReportingYear(new Date(2026, 5, 1))).toBe(2027)
  })
  it('up to and including May 31, this year', () => {
    expect(defaultReportingYear(new Date(2026, 4, 31))).toBe(2026)
    expect(defaultReportingYear(new Date(2026, 0, 1))).toBe(2026)
  })
})

describe('other-jurisdiction checkboxes: several allowed, "None" clears the rest (review item E29)', () => {
  it('several can be ticked together', () => {
    expect(toggleChecklist(['UK Modern Slavery Act'], 'Australian Modern Slavery Act', true, 'None')).toEqual(['UK Modern Slavery Act', 'Australian Modern Slavery Act'])
  })
  it('ticking None clears the rest; ticking another clears None', () => {
    expect(toggleChecklist(['UK Modern Slavery Act', 'Australian Modern Slavery Act'], 'None', true, 'None')).toEqual(['None'])
    expect(toggleChecklist(['None'], 'UK Modern Slavery Act', true, 'None')).toEqual(['UK Modern Slavery Act'])
  })
  it('unticking removes only that option; with no exclusive option nothing else is cleared', () => {
    expect(toggleChecklist(['a', 'b'], 'a', false, 'None')).toEqual(['b'])
    expect(toggleChecklist(['None'], 'a', true)).toEqual(['None', 'a'])
  })
})
