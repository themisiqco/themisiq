import { describe, it, expect } from 'vitest'
import { exportGate, findPersonalInfo, scanPersonalInformation, scanUndrawable, describeChars } from './exportCheck'
import { SINGLE_REPORT, JOINT_REPORT, JOINT_EACH_REPORT, allComplete } from './reportModel.fixtures'
import { fillAttestation, buildAttestation } from './attestation'
import { ATTESTATION_DEFAULT } from './builderContent'

describe('the export gate', () => {
  it('a complete report with a filled attestation is ready', () => {
    expect(exportGate(allComplete(SINGLE_REPORT))).toEqual({ ready: true, blockers: [] })
    expect(exportGate(allComplete(JOINT_REPORT)).ready).toBe(true)
  })

  it('an incomplete section is refused, naming the section and what it still needs', () => {
    const s = allComplete(SINGLE_REPORT)
    s.training = { status: 'in_progress', content: { training_provided: 'Yes' } }
    const g = exportGate(s)
    expect(g.ready).toBe(false)
    expect(g.blockers).toEqual([{ section: 'training', message: '7. Training provided to employees is not marked complete.', missing: ['What the training covers, and how it is reviewed'] }])
  })

  it('a section marked complete whose answers no longer pass is refused too', () => {
    const s = allComplete(SINGLE_REPORT)
    s.risks = { status: 'complete', content: { risk_assessment_done: 'Yes' } }
    const g = exportGate(s)
    expect(g.blockers.map(b => b.section)).toEqual(['risks'])
    expect(g.blockers[0].message).toContain('is marked complete, but an answer it needs is missing')
  })

  it('a square-bracket placeholder left in the attestation is refused', () => {
    const s = allComplete(SINGLE_REPORT)
    s.approval_attestation = { status: 'complete', content: { ...s.approval_attestation!.content, attestation_text: fillAttestation({ reportType: 'single' }) } }
    const g = exportGate(s)
    expect(g.ready).toBe(false)
    expect(g.blockers).toEqual([{ section: 'approval_attestation', message: 'The attestation still contains a placeholder in square brackets: [title]. Replace it before the report is signed.', missing: [] }])
    s.approval_attestation.content.attestation_text = ATTESTATION_DEFAULT
    expect(exportGate(s).blockers[0].message).toContain('[title], [or entities]')
  })

  it('section 10 never blocks: absent, unused, or used and unfinished', () => {
    const s = allComplete(SINGLE_REPORT)
    delete s.other_information
    expect(exportGate(s).ready).toBe(true)
    s.other_information = { status: 'in_progress', content: { has_other_information: 'Yes' } }
    expect(exportGate(s).ready).toBe(true)
  })

  it('a missing required section blocks, listed in report order', () => {
    const s = allComplete(SINGLE_REPORT)
    delete s.effectiveness
    delete s.structure_activities_supply_chains
    expect(exportGate(s).blockers.map(b => b.section)).toEqual(['structure_activities_supply_chains', 'effectiveness'])
  })
})

describe('personal information in the report text', () => {
  it('finds e-mail addresses, telephone numbers, street addresses and SIN patterns', () => {
    const kinds = (s: string) => findPersonalInfo(s).map(h => `${h.kind}:${h.match}`)
    expect(kinds('Write to j.avery@harrowgate.example for details.')).toEqual(['email:j.avery@harrowgate.example'])
    expect(kinds('Call (416) 555-0100 or 1-800-555-0199.')).toEqual(['phone:(416) 555-0100', 'phone:1-800-555-0199'])
    expect(kinds('The line is +44 20 7946 0958.')).toEqual(['phone:+44 20 7946 0958'])
    expect(kinds('Our office at 221 King Street West handles it.')).toEqual(['address:221 King Street'])
    expect(kinds('Send mail to 1200, rue Sainte-Catherine.')).toEqual(['address:1200, rue Sainte-Catherine'])
    expect(kinds('Postal code M5H 2N2.')).toEqual(['address:M5H 2N2'])
    expect(kinds('P.O. Box 4410, Calgary')).toEqual(['address:P.O. Box 4410'])
    expect(kinds('SIN 046 454 286 was on file.')).toEqual(['sin:046 454 286'])
    expect(kinds('Worker 046454286 complained.')).toEqual(['sin:046454286'])
  })

  it('does not flag the numbers a report ordinarily carries', () => {
    for (const s of [
      'On April 14, 2026, this report was approved under subparagraph 11(4)(b)(ii) of the Act.',
      'In 2025 we bought from 46 direct suppliers; 44 of 46 signed the code.',
      'Tents made in Vietnam were about 60% of purchases, 420,000 units a year.',
      'Direct suppliers that signed the code: 96% in 2025, 81% in 2024.',
      'The Vice-President, Operations reports to the audit committee twice a year.',
      'ISO 45001 and ILO Convention 138 apply. Financial year 2025-01-01 to 2025-12-31.',
      'Worker 123456789 is not a valid SIN, so it is not flagged.',
      'https://www.harrowgate.example/supplier-code',
    ]) expect(findPersonalInfo(s), s).toEqual([])
  })

  it('scans every printed answer with its section, and exempts the signer\'s name and title', () => {
    const r = structuredClone(SINGLE_REPORT.sections)
    r.remediation!.grievance_description = 'Workers call 416-555-0100 or write to hotline@harrowgate.example.'
    r.risks!.risk_areas = [{ area: 'Warehouse at 12 Mill Road', why: 'Agency labour', worker_groups: '', action: '' }]
    r.approval_attestation!.signatory_name = 'Jordan Avery, 416-555-0199'
    const hits = scanPersonalInformation(r)
    expect(hits.map(h => [h.number, h.field, h.kind, h.match])).toEqual([
      [4, 'Risk areas', 'address', '12 Mill Road'],
      [5, 'How the channel works', 'phone', '416-555-0100'],
      [5, 'How the channel works', 'email', 'hotline@harrowgate.example'],
    ])
  })

  it('an unused section 10 is not scanned, because it is not printed', () => {
    const r = structuredClone(SINGLE_REPORT.sections)
    r.other_information = { has_other_information: 'No', other_description: 'Call 416-555-0100.' }
    expect(scanPersonalInformation(r)).toEqual([])
    r.other_information.has_other_information = 'Yes'
    expect(scanPersonalInformation(r).map(h => h.number)).toEqual([10])
  })

  it('the fixture reports carry none', () => {
    expect(scanPersonalInformation(SINGLE_REPORT.sections)).toEqual([])
    expect(scanPersonalInformation(JOINT_REPORT.sections)).toEqual([])
  })
})

describe('the export gate: signers under 11(4)(b)(i)', () => {
  it('a (b)(i) report with a signer for every entity is ready', () => {
    expect(exportGate(allComplete(JOINT_EACH_REPORT))).toEqual({ ready: true, blockers: [] })
  })

  it('an entity with no signer blocks, and so does a row naming an entity section 1 does not list', () => {
    const s = allComplete(JOINT_EACH_REPORT)
    const c = s.approval_attestation!.content
    c.entity_signatories = [
      { entity: 'Harrowgate Outdoor Equipment Inc.', name: 'Jordan Avery', title: 'Chair of the Board' },
      { entity: 'Harrowgate Retail Limited', name: 'Sam Okafor', title: 'Director' },
    ]
    expect(exportGate(s).blockers.map(b => b.message)).toEqual([
      'No signer is named for Harrowgate Retail Ltd.; Société Harrowgate Québec Inc. Each entity\'s governing body approved the report, so a member of each signs it.',
      'A signer row names an entity section 1 does not list: Harrowgate Retail Limited. Use the legal name exactly as section 1 gives it.',
    ])
  })

  it('under (b)(i) the pre-filled attestation has nothing left to word, so it does not block', () => {
    const s = allComplete(JOINT_EACH_REPORT)
    s.approval_attestation!.content.attestation_text = buildAttestation({ basis: 'joint_each' })
    expect(exportGate(s)).toEqual({ ready: true, blockers: [] })
  })

  it('under (b)(ii) a controlling entity not yet named leaves its placeholder, which blocks like any other', () => {
    const s = allComplete(JOINT_REPORT)
    s.approval_attestation!.content.attestation_text = buildAttestation({ basis: 'joint_controlling', title: 'Chair of the Board' })
    expect(exportGate(s).blockers.map(b => b.message)).toEqual(['The attestation still contains a placeholder in square brackets: [controlling entity]. Replace it before the report is signed.'])
  })

  it('the signers\' names and titles are exempt from the personal-information scan, like the single signer\'s', () => {
    const r = structuredClone(JOINT_EACH_REPORT.sections)
    r.approval_attestation!.entity_signatories = [{ entity: 'Harrowgate Retail Ltd.', name: 'Sam Okafor, 416-555-0100', title: 'Director' }]
    expect(scanPersonalInformation(r)).toEqual([])
  })
})

describe('characters the PDF cannot print', () => {
  it('names the section, the field and each character, and shows what the PDF prints instead', () => {
    const r = structuredClone(SINGLE_REPORT.sections)
    r.report_details!.legal_name = 'Łódź Trading Sp. z o.o.'
    r.approval_attestation!.signatory_name = 'Ayşe Yılmaz'
    r.risks!.risk_areas = [{ area: 'Cotton, Türkiye', why: 'Seasonal migrant labour in Şanlıurfa', worker_groups: '', action: '' }]
    const hits = scanUndrawable(r)
    expect(hits.map(h => [h.number, h.field, h.chars.join(''), h.printedAs])).toEqual([
      [1, 'Legal name of the reporting entity', 'Łź', '?ódz Trading Sp. z o.o.'],
      [4, 'Risk areas', 'Şı', 'Seasonal migrant labour in Sanl?urfa'],
      [11, 'Full name of the member who signs', 'şı', 'Ayse Y?lmaz'],
    ])
    expect(describeChars(['Ł', '\t'])).toBe('Ł (U+0141), tab (U+0009)')
  })

  it('accented French and Latin-1 names print as typed and are not flagged', () => {
    expect(scanUndrawable(JOINT_EACH_REPORT.sections)).toEqual([])
    expect(scanUndrawable(SINGLE_REPORT.sections)).toEqual([])
  })

  it('an unused section 10 is not checked, because it is not printed', () => {
    const r = structuredClone(SINGLE_REPORT.sections)
    r.other_information = { has_other_information: 'No', other_description: 'Łódź' }
    expect(scanUndrawable(r)).toEqual([])
  })
})
