import { describe, it, expect } from 'vitest'
import { checkReport, type SectionState } from './checkReport'
import { SECTIONS, type SectionKey } from './builderContent'
import { fillAttestation } from './attestation'

const allComplete = (): Partial<Record<SectionKey, SectionState>> =>
  Object.fromEntries(SECTIONS.map(d => [d.key, { status: 'complete', content: {} }]))

describe('the check page (review items A3, B8, B9, A5)', () => {
  it('every required section not complete is listed, section 3 and section 11 included, whatever their fields say', () => {
    const s = allComplete()
    s.policies_due_diligence = { status: 'in_progress', content: { has_policy: 'No' } }
    s.approval_attestation = { status: 'not_started', content: {} }
    s.steps_taken = { status: 'in_progress', content: { steps_summary: 'We did things.' } }
    const r = checkReport(s)
    expect(r.incomplete.map(x => x.number)).toEqual([3, 9, 11])
    expect(r.exportBlocked).toBe(true)
  })

  it('section 9 in progress carries its missing fields like any other section', () => {
    const s = allComplete()
    s.steps_taken = { status: 'in_progress', content: {} }
    expect(checkReport(s).incomplete[0].missing.length).toBeGreaterThan(0)
  })

  it('section 10 unused is listed apart and never blocks export', () => {
    const s = allComplete()
    s.other_information = { status: 'not_started', content: {} }
    const r = checkReport(s)
    expect(r.incomplete).toEqual([])
    expect(r.optionalNotUsed.map(x => x.number)).toEqual([10])
    expect(r.exportBlocked).toBe(false)
  })

  it('section 10 answered Yes but not complete is shown as incomplete, and still does not block export', () => {
    const s = allComplete()
    s.other_information = { status: 'in_progress', content: { has_other_information: 'Yes' } }
    const r = checkReport(s)
    expect(r.optionalUsedIncomplete.map(x => x.number)).toEqual([10])
    expect(r.optionalNotUsed).toEqual([])
    expect(r.exportBlocked).toBe(false)
  })

  it('a placeholder left in the attestation is a warning', () => {
    const s = allComplete()
    s.approval_attestation = { status: 'complete', content: { attestation_text: fillAttestation({ reportType: 'single' }) } }
    expect(checkReport(s).warnings).toEqual(['The attestation still contains a placeholder in square brackets: [title]. Replace it before the report is signed.'])
    s.approval_attestation = { status: 'complete', content: { attestation_text: fillAttestation({ title: 'CEO', reportType: 'single' }) } }
    expect(checkReport(s).warnings).toEqual([])
  })
})
