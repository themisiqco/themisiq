import { describe, it, expect } from 'vitest'
import {
  buildS211ReportModel, approvalStatement, financialYearOf, longDate, reportFileName, REPORT_LABEL, NOT_PRINTED_HERE,
  PART_REFERENCE, PREPARED_WITH, type S211ReportModel, type Block,
} from './reportModel'
import { SINGLE_REPORT, JOINT_REPORT, JOINT_EACH_REPORT, NOTHING_REPORT } from './reportModel.fixtures'
import { signatureBlocks, signerMismatches } from './reportModel'
import {
  SECTIONS, sectionDef, KEY_TERMS, EXAMPLES_LABEL, ATTESTATION_EXAMPLE_NOTE, BUILDER_NOTE_ON_SIGNING, OECD_STEPS_SOURCE_NOTE, PERSONAL_INFORMATION_WARNING,
} from './builderContent'
import { assembleSteps, summaryText } from './stepsSummary'
import { S211_ACT_SECTION_11_4 } from './requirements'

const stringsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(stringsOf) : v && typeof v === 'object' ? Object.values(v).flatMap(stringsOf) : []
const part = (m: S211ReportModel, key: string) => m.parts.find(p => p.key === key)
const texts = (blocks: Block[]) => stringsOf(blocks).join('\n')

describe('the report model: a full single report', () => {
  const m = buildS211ReportModel(SINGLE_REPORT)

  it('one part per section, in the Act\'s order, each with its plain title and reference line', () => {
    expect(m.parts.map(p => p.key)).toEqual(SECTIONS.map(d => d.key))
    expect(m.parts.map(p => p.title)).toEqual(SECTIONS.map(d => d.title))
    expect(m.parts.map(p => p.reference)).toEqual(SECTIONS.map(d => PART_REFERENCE[d.key]))
    expect(part(m, 'structure_activities_supply_chains')!.reference).toBe('Act s.11(3)(a)')
    expect(part(m, 'other_information')!.reference).toBeNull()
  })

  it('the cover: legal name, report type, financial year, reporting year, and other laws given', () => {
    expect(m.cover.legalName).toBe('Harrowgate Outdoor Equipment Inc.')
    expect(m.cover.rows).toEqual([
      ['Report type', 'Single report'],
      ['Financial year', 'January 1, 2025 to December 31, 2025'],
      ['Reporting year', '2026'],
      ['Also reports under', 'UK Modern Slavery Act 2015'],
    ])
    expect(m.cover.revised).toBe(false)
    expect(m.runningHeader).toBe('Harrowgate Outdoor Equipment Inc.  ·  Financial year January 1, 2025 to December 31, 2025')
  })

  it('the user\'s own answers print under report headings; builder guidance, prompts, key terms and notes never do', () => {
    const all = stringsOf(m.parts).join('\n')
    expect(all).toContain(SINGLE_REPORT.sections.policies_due_diligence!.due_diligence_description as string)
    const banned = [
      ...SECTIONS.flatMap(d => [d.plainTerms, d.readersLookFor, d.weakExample, d.weakWhy, d.nothingToReportNote ?? '', d.characterGuidance, d.mapsTo]),
      ...SECTIONS.flatMap(d => d.fields.map(f => f.hint)).filter(h => h.length > 12),
      ...KEY_TERMS.map(t => t.explanation), EXAMPLES_LABEL, ATTESTATION_EXAMPLE_NOTE, BUILDER_NOTE_ON_SIGNING, OECD_STEPS_SOURCE_NOTE,
      PERSONAL_INFORMATION_WARNING.ours, 'ThemisIQ', 'Template, optional', '[Guidance]',
    ].filter(Boolean)
    for (const b of banned) expect(all, b.slice(0, 60)).not.toContain(b)
    expect(stringsOf(m).join('\n')).not.toContain('ThemisIQ')
  })

  it('every field is either printed under a report heading or named, with its reason, as not printed field by field', () => {
    for (const d of SECTIONS) for (const f of d.fields) {
      const printed = f.key in (REPORT_LABEL[d.key] ?? {})
      const excused = `${d.key}.${f.key}` in NOT_PRINTED_HERE || `${d.key}.*` in NOT_PRINTED_HERE
      expect(printed || excused, `${d.key}.${f.key} is neither printed nor excused`).toBe(true)
    }
  })

  it('section 9 prints the summary as saved, never a rebuilt one', () => {
    const saved = 'Our own words, edited after the draft was built.'
    const mm = buildS211ReportModel({ ...SINGLE_REPORT, sections: { ...SINGLE_REPORT.sections, steps_taken: { steps_summary: saved } } })
    const s9 = texts(part(mm, 'steps_taken')!.blocks)
    expect(s9).toContain(saved)
    expect(s9).not.toContain(summaryText(assembleSteps(SINGLE_REPORT.sections)))
  })

  it('section 11: the approval statement, the attestation as saved, and the four signature lines with the date and signature blank', () => {
    const s11 = part(m, 'approval_attestation')!.blocks
    expect(s11[0]).toEqual({ kind: 'para', text: 'On April 14, 2026, this report was approved by the Board of Directors of Harrowgate Outdoor Equipment Inc., as the governing body of the entity, under paragraph 11(4)(a) of the Act.' })
    const sig = s11.find(b => b.kind === 'signature') as Extract<Block, { kind: 'signature' }>
    expect(sig.attestation).toEqual([SINGLE_REPORT.sections.approval_attestation!.attestation_text])
    expect(sig.signers).toHaveLength(1)
    expect(sig.signers[0].rows).toEqual([
      { label: 'Full name', value: 'Jordan Avery' }, { label: 'Title', value: 'Chair of the Board' },
      { label: 'Date', value: '' }, { label: 'Signature', value: '' },
    ])
    expect(sig.signers[0].statement).toBe('I have the authority to bind Harrowgate Outdoor Equipment Inc.')
  })

  it('tables print only the columns some row fills, under report column names', () => {
    const t = part(m, 'policies_due_diligence')!.blocks.find(b => b.kind === 'table' && b.title === 'Policies') as Extract<Block, { kind: 'table' }>
    expect(t.columns).toEqual(['Policy', 'Adopted or last updated', 'Approved by'])
    const noApprover = buildS211ReportModel({ ...SINGLE_REPORT, sections: { ...SINGLE_REPORT.sections, policies_due_diligence: { ...SINGLE_REPORT.sections.policies_due_diligence, policy_list: [{ name: 'Code', year: '2024', approved_by: '' }] } } })
    const t2 = part(noApprover, 'policies_due_diligence')!.blocks.find(b => b.kind === 'table' && b.title === 'Policies') as Extract<Block, { kind: 'table' }>
    expect(t2.columns).toEqual(['Policy', 'Adopted or last updated'])
  })

  it('"the policy" is printed only when a written policy is ticked', () => {
    const noPolicy = buildS211ReportModel({ ...SINGLE_REPORT, sections: { ...SINGLE_REPORT.sections, policies_due_diligence: { has_policy: 'No', supplier_terms: 'Yes', due_diligence_description: 'x' } } })
    const s3 = texts(part(noPolicy, 'policies_due_diligence')!.blocks)
    expect(s3).not.toMatch(/the policy/)
    expect(s3).toContain('follow a code of conduct or sourcing standard')
  })

  it('the footer credit is off unless asked for', () => {
    expect(m.footerCredit).toBeNull()
    expect(buildS211ReportModel(SINGLE_REPORT, { preparedWithThemisIq: true }).footerCredit).toBe(PREPARED_WITH)
  })

  it('metadata: title, subject and language', () => {
    expect(m.metadata).toEqual({
      title: 'Harrowgate Outdoor Equipment Inc.: Report under the Fighting Against Forced Labour and Child Labour in Supply Chains Act, financial year January 1, 2025 to December 31, 2025',
      subject: 'Annual report under section 11 of the Fighting Against Forced Labour and Child Labour in Supply Chains Act (Canada)',
      author: 'Harrowgate Outdoor Equipment Inc.',
      language: 'en-CA',
    })
    expect(reportFileName(m, 2026)).toBe('Harrowgate-Outdoor-Equipment-Inc-S-211-report-2026.pdf')
  })
})

describe('the report model: a joint, revised report', () => {
  const m = buildS211ReportModel(JOINT_REPORT)

  it('the cover lists each entity, the revision, and no other laws when the answer was None', () => {
    expect(m.cover.revised).toBe(true)
    expect(m.cover.rows).toEqual([
      ['Report type', 'Joint report'],
      ['Entities covered', 'Harrowgate Outdoor Equipment Inc.\nHarrowgate Retail Ltd.\nSociété Harrowgate Québec Inc.'],
      ['Financial year', 'April 1, 2025 to March 31, 2026'],
      ['Reporting year', '2026'],
      ['Revised report', 'Revised on May 20, 2026'],
    ])
    expect(reportFileName(m, 2026)).toBe('Harrowgate-Outdoor-Equipment-Inc-S-211-report-2026-revised.pdf')
  })

  it('section 1 carries what changed; the approval names subparagraph 11(4)(b)(ii) in the Act\'s words', () => {
    expect(texts(part(m, 'report_details')!.blocks)).toContain('Section 4 now lists the cotton fabric risk area')
    const s11 = part(m, 'approval_attestation')!.blocks
    expect((s11[0] as { text: string }).text).toBe('On May 22, 2026, this joint report was approved by the Board of Directors of Harrowgate Outdoor Equipment Inc., as the governing body of the entity that controls each entity included in the report, under subparagraph 11(4)(b)(ii) of the Act.')
    // 11(4)(b)(ii): one approving body, so one block, binding the controlling entity only.
    const sig = s11.find(b => b.kind === 'signature') as Extract<Block, { kind: 'signature' }>
    expect(sig.signers.map(b => b.statement)).toEqual(['I have the authority to bind Harrowgate Outdoor Equipment Inc.'])
  })

  it('the phrases the approval statements quote are the Act\'s, from the verified constant', () => {
    const act = JSON.stringify(S211_ACT_SECTION_11_4)
    expect(act).toContain('the governing body of each entity included in the report')
    expect(act).toContain('that controls each entity included in the report')
    expect(approvalStatement({ governing_body: 'Board of Directors', approval_basis: 'joint_each', approval_date: '2026-05-22' }, 'X Inc.'))
      .toBe('On May 22, 2026, this joint report was approved by the governing body of each entity included in the report (Board of Directors), under subparagraph 11(4)(b)(i) of the Act.')
  })

  it('section 10 answered No is left out entirely', () => {
    expect(part(m, 'other_information')).toBeUndefined()
    expect(m.parts).toHaveLength(10)
  })
})

describe('the report model: sections with nothing to report', () => {
  const m = buildS211ReportModel(NOTHING_REPORT)
  it('print their plain sentence first, then any other answer given', () => {
    for (const k of ['policies_due_diligence', 'training', 'effectiveness'] as const) {
      const blocks = part(m, k)!.blocks
      expect(blocks[0], k).toEqual({ kind: 'para', text: sectionDef(k).nothingToReport })
    }
    expect(texts(part(m, 'training')!.blocks)).toContain('Training during the financial year')
  })
})

describe('dates and the financial year', () => {
  it('long dates, and anything else as typed', () => {
    expect(longDate('2026-04-14')).toBe('April 14, 2026')
    expect(longDate('sometime')).toBe('sometime')
  })
  it('the corrected dates win over the derived year when both are given', () => {
    expect(financialYearOf({ year_end_month: 12, year_end_day: 31, financial_year_start: '2025-01-05', financial_year_end: '2026-01-03' }, 2026))
      .toEqual({ start: '2025-01-05', end: '2026-01-03' })
    expect(financialYearOf({ year_end_month: 12, year_end_day: 31 }, 2026)).toEqual({ start: '2025-01-01', end: '2025-12-31' })
    expect(financialYearOf({}, 2026)).toBeNull()
  })
})

describe('signature blocks follow the approval basis (s.11(5)(b))', () => {
  it('11(4)(b)(i): one block for each entity covered, each binding that entity, signer from its row', () => {
    const m = buildS211ReportModel(JOINT_EACH_REPORT)
    const sig = part(m, 'approval_attestation')!.blocks.find(b => b.kind === 'signature') as Extract<Block, { kind: 'signature' }>
    expect(sig.signers.map(b => [b.entity, b.rows[0].value, b.rows[1].value, b.statement])).toEqual([
      ['Harrowgate Outdoor Equipment Inc.', 'Jordan Avery', 'Chair of the Board', 'I have the authority to bind Harrowgate Outdoor Equipment Inc.'],
      ['Harrowgate Retail Ltd.', 'Sam Okafor', 'Director', 'I have the authority to bind Harrowgate Retail Ltd.'],
      ['Société Harrowgate Québec Inc.', 'Marie-Ève Tremblay', 'Présidente du conseil', 'I have the authority to bind Société Harrowgate Québec Inc.'],
    ])
    for (const b of sig.signers) expect(b.rows.slice(2)).toEqual([{ label: 'Date', value: '' }, { label: 'Signature', value: '' }])
  })

  it('11(4)(b)(i): a signer row is matched by name regardless of case and spacing; an entity with no row prints a blank block', () => {
    const s1 = JOINT_EACH_REPORT.sections.report_details!
    const blocks = signatureBlocks({ approval_basis: 'joint_each', entity_signatories: [{ entity: '  harrowgate retail ltd. ', name: 'Sam Okafor', title: 'Director' }] }, s1)
    expect(blocks.map(b => [b.entity, b.rows[0].value])).toEqual([
      ['Harrowgate Outdoor Equipment Inc.', ''], ['Harrowgate Retail Ltd.', 'Sam Okafor'], ['Société Harrowgate Québec Inc.', ''],
    ])
    expect(signerMismatches({ approval_basis: 'joint_each', entity_signatories: [{ entity: 'Harrowgate Retail Ltd.', name: 'Sam Okafor', title: 'Director' }, { entity: 'Harrowgate Holdings', name: 'A', title: 'B' }] }, s1))
      .toEqual({ unsigned: ['Harrowgate Outdoor Equipment Inc.', 'Société Harrowgate Québec Inc.'], unknown: ['Harrowgate Holdings'] })
  })

  it('11(4)(b)(ii): the controlling entity is the one named in section 11, which the report need not cover', () => {
    const s1 = JOINT_REPORT.sections.report_details!
    const s11 = { ...JOINT_REPORT.sections.approval_attestation!, controlling_entity: 'Harrowgate Holdings Ltd.' }
    expect(signatureBlocks(s11, s1).map(b => b.statement)).toEqual(['I have the authority to bind Harrowgate Holdings Ltd.'])
    expect(approvalStatement(s11, 'Harrowgate Outdoor Equipment Inc.')).toContain('by the Board of Directors of Harrowgate Holdings Ltd., as the governing body of the entity that controls each entity')
    expect(signerMismatches(s11, s1)).toEqual({ unsigned: [], unknown: [] })
  })

  it('11(4)(a): one block binding the entity', () => {
    expect(signatureBlocks(SINGLE_REPORT.sections.approval_attestation!, SINGLE_REPORT.sections.report_details!).map(b => b.statement))
      .toEqual(['I have the authority to bind Harrowgate Outdoor Equipment Inc.'])
  })
})
