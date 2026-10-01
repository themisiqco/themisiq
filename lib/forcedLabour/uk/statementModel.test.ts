import { describe, it, expect } from 'vitest'
import { buildUkStatement, buildUkStatementModel, ukStatementFileName, ukDateText, UK_STATEMENT_TITLE, UK_STATEMENT_SUBTITLE, UK_PDF_OPTIONS, type UkStatementInput } from './statementModel'
import { UK_SINGLE_COMPANY, UK_LLP, UK_GROUP } from './statementModel.fixtures'
import { ukExportGate } from './exportCheck'
import { UK_SECTIONS, type UkSectionKey, type UkOrgType } from './builderContent'
import { SECTIONS } from '../../s211/builderContent'
import { DRAFT_KEY, OFFERED_KEY, withoutOffered } from '../drafts'
import { generateS211ReportPDF, type PdfDocumentModel } from '../../s211/reportPdf'
import { isFilled } from '../../s211/sectionStatus'
import type { SectionContent } from '../../s211/builderContent'
import type { Block } from '../../s211/reportModel'

const FIXTURES = [UK_SINGLE_COMPANY, UK_LLP, UK_GROUP]
const paras = (blocks: Block[]) => blocks.filter(b => b.kind === 'para').map(b => (b as { text: string }).text)
/** Every string the PDF prints, from the model. The renderer adds page numbers only. */
function printed(m: PdfDocumentModel): string[] {
  const out: string[] = [m.cover.title, m.cover.subtitle ?? '', m.cover.legalName, ...m.cover.rows.flat(), m.runningHeader, m.metadata.title, m.metadata.subject]
  for (const p of m.parts) {
    out.push(p.title, p.reference ?? "")
    for (const b of p.blocks) {
      if (b.kind === 'para' || b.kind === 'subheading') out.push(b.text)
      else if (b.kind === 'facts') out.push(...b.rows.flat())
      else if (b.kind === 'table') out.push(b.title ?? '', ...b.columns, ...b.rows.flat())
      else if (b.kind === 'signature') out.push(b.heading, ...b.attestation, ...b.signers.flatMap(sg => [sg.entity, sg.statement, ...sg.rows.flatMap(r => [r.label, r.value])]))
      else out.push(JSON.stringify(b))
    }
  }
  return out.filter(Boolean)
}
/** Strings the model chose (headings, column names, fact labels), as opposed to the user's answers. */
function labels(m: PdfDocumentModel): string[] {
  const out: string[] = [...m.cover.rows.map(r => r[0])]
  for (const p of m.parts) for (const b of p.blocks) {
    if (b.kind === 'subheading') out.push(b.text)
    if (b.kind === 'facts') out.push(...b.rows.map(r => r[0]))
    if (b.kind === 'table') out.push(b.title ?? '', ...b.columns)
    if (b.kind === 'signature') out.push(b.heading, ...b.signers.flatMap(sg => sg.rows.map(r => r.label)))
  }
  return out
}
/** Every answer string in the input. */
const answers = (input: UkStatementInput) => Object.values(input.sections).flatMap(c => Object.values(c ?? {})).flatMap(function t(v: unknown): string[] {
  return typeof v === 'string' ? [v.trim()] : Array.isArray(v) ? v.flatMap(t) : v && typeof v === 'object' ? Object.values(v).flatMap(t) : []
})
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const at = (input: UkStatementInput, path: string) => { const [s, f] = path.split('.'); return (input.sections[s as UkSectionKey] as Record<string, unknown> | undefined)?.[f] }
const withApproval = (o: Record<string, unknown>): UkStatementInput =>
  ({ ...UK_LLP, sections: { ...UK_LLP.sections, approval: { signer_name: 'A B', signer_title: 'T', signer_capacity: true, ...o } as SectionContent } })
const signing = (input: UkStatementInput) => (buildUkStatementModel(input).parts.at(-1)!.blocks.find(b => b.kind === 'signature') as Extract<Block, { kind: 'signature' }>)
const approvalParas = (input: UkStatementInput) => paras(buildUkStatementModel(input).parts.at(-1)!.blocks)

describe('the UK statement model', () => {
  it('is titled "Modern Slavery Statement", made under section 54, with the running header and file name to match, on A4', () => {
    const m = buildUkStatementModel(UK_SINGLE_COMPANY)
    expect(m.cover).toMatchObject({ title: 'Modern Slavery Statement', subtitle: 'Made under section 54 of the Modern Slavery Act 2015', legalName: 'Fellside Outdoor Clothing Ltd' })
    expect(m.cover.rows).toEqual([['Financial year', '1 January 2025 to 31 December 2025']])
    expect(m.runningHeader).toBe('Fellside Outdoor Clothing Ltd: Modern Slavery Statement, financial year 1 January 2025 to 31 December 2025')
    expect(ukStatementFileName(m, '2025-12-31')).toBe('Fellside-Outdoor-Clothing-Ltd-modern-slavery-statement-2025.pdf')
    expect(m.metadata.language).toBe('en-GB')
    const { doc } = generateS211ReportPDF(m, UK_PDF_OPTIONS)
    expect(UK_PDF_OPTIONS).toEqual({ format: 'a4', cover: 'title-first', keepWithNext: true })
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(595)
  })

  it('the Act’s term "slavery and human trafficking statement" is in no title or heading', () => {
    for (const f of FIXTURES) {
      const m = buildUkStatementModel(f)
      const titles = [UK_STATEMENT_TITLE, UK_STATEMENT_SUBTITLE, m.runningHeader, m.metadata.title, m.metadata.subject, ...m.parts.map(p => p.title), ...labels(m)]
      expect(titles.filter(t => /slavery and human trafficking statement/i.test(t)), f.giving).toEqual([])
    }
  })

  it('prints the steps taken, then only the topics answered, in the Act’s order, then approval', () => {
    expect(buildUkStatementModel(UK_SINGLE_COMPANY).parts.map(p => p.reference)).toEqual([
      'Modern Slavery Act 2015, s.54(4)', 'Modern Slavery Act 2015, s.54(5)(a)', 'Modern Slavery Act 2015, s.54(5)(b)', 'Modern Slavery Act 2015, s.54(5)(c)',
      'Modern Slavery Act 2015, s.54(5)(d)', 'Modern Slavery Act 2015, s.54(5)(e)', 'Modern Slavery Act 2015, s.54(5)(f)', 'Modern Slavery Act 2015, s.54(6)'])
    expect(buildUkStatementModel(UK_LLP).parts.map(p => p.reference)).toEqual(['Modern Slavery Act 2015, s.54(4)', 'Modern Slavery Act 2015, s.54(6)'])
  })

  it('the Act’s alternative, plainly, when no steps were taken', () => {
    expect(paras(buildUkStatementModel(UK_LLP).parts[0].blocks)).toEqual([
      'We have taken no steps during the financial year ending 31 March 2026 to ensure that slavery and human trafficking is not taking place in any of our supply chains or in any part of our own business.'])
  })

  it('"Responsibility and oversight", and no legal form', () => {
    const m = buildUkStatementModel(UK_SINGLE_COMPANY)
    expect(labels(m)).toContain('Responsibility and oversight')
    expect(printed(m).join('\n')).not.toMatch(/Who is responsible|Legal form|Company or other body corporate/)
  })
})

describe('no builder wording reaches the PDF', () => {
  const ukFields = UK_SECTIONS.flatMap(s => s.fields)
  const caFields = SECTIONS.flatMap(s => s.fields)
  const hints = [...ukFields, ...caFields].flatMap(f => [f.hint, (f as { sharedNote?: string }).sharedNote]).filter((h): h is string => !!h && h.length > 12)
  const builderLabels = [...ukFields, ...caFields].flatMap(f => [f.label, ...(f.columns ?? []).map(c => c.label)])
  it('no hint, no label suffix, no "[Template, optional]", and no question as a label', () => {
    expect(hints.length).toBeGreaterThan(20)
    for (const f of FIXTURES) {
      const all = printed(buildUkStatementModel(f))
      const joined = all.join('\n')
      expect(hints.filter(h => joined.includes(h)), f.giving).toEqual([])
      expect(joined, f.giving).not.toMatch(/\[Template|template, optional|\(a body or role\)|\(a sector, country or region|\(optional\)|\(required\)/i)
      expect(builderLabels.filter(l => /[?(]/.test(l) && all.includes(l)), f.giving).toEqual([])
    }
  })
  it('headings, column names and fact labels carry no parenthetical and no question', () => {
    for (const f of FIXTURES) expect(labels(buildUkStatementModel(f)).filter(l => /[()?[\]]/.test(l)), f.giving).toEqual([])
  })
})

describe('every sentence traces to an answer', () => {
  it('each paragraph is an answer as given, or a traced sentence whose answers are all filled', () => {
    for (const f of FIXTURES) {
      const { model, trace } = buildUkStatement(f)
      const given = new Set(answers(f))
      const traced = new Map(trace.map(t => [t.text, t.from]))
      const sentences = model.parts.flatMap(p => p.blocks.flatMap(b => (b.kind === 'para' ? [b.text] : b.kind === 'signature' ? b.attestation : [])))
      for (const s of sentences) {
        if (given.has(s)) continue
        const from = traced.get(s)
        expect(from, `${f.giving}: untraced "${s}"`).toBeDefined()
        expect(from!.length).toBeGreaterThan(0)
        for (const path of from!) expect(isFilled(at(f, path)), `${f.giving}: "${s}" cites ${path}, which is empty`).toBe(true)
      }
    }
  })
  it('an unanswered question prints nothing; a "No" or "Not applicable" prints an honest sentence', () => {
    const base = { ...UK_SINGLE_COMPANY, sections: { ...UK_SINGLE_COMPANY.sections } }
    base.sections.due_diligence = { instances_identified: 'No instances were identified', remediation_taken: 'Not applicable', grievance_mechanism: 'No' }
    base.sections.training = { training_provided: 'No' }
    base.sections.policies = {}
    const m = buildUkStatementModel(base)
    const all = printed(m)
    expect(all).toContain('No cases of slavery or human trafficking were identified during the financial year.')
    expect(all).toContain('No remediation was needed, as no cases were identified.')
    expect(all).toContain('We do not yet have a channel for workers or others to raise concerns.')
    expect(all).toContain('We did not provide training about slavery and human trafficking to our staff during the financial year.')
    expect(m.parts.map(p => p.title)).not.toContain('Policies')
  })
  it('a single policy is one sentence, dated in month and year; who is accountable is a sentence too', () => {
    const all = printed(buildUkStatementModel(UK_SINGLE_COMPANY))
    expect(all).toContain('We have a written policy on slavery and human trafficking: our Supplier Code of Conduct, dated March 2024 and approved by the Board of Directors.')
    expect(all).toContain('Our contracts or purchase terms require suppliers to follow it.')
    expect(all).toContain('Our Head of Sourcing is accountable for this policy.')
    expect(all).not.toContain('Accountable for the policies')
  })
  it('several policies: a table, and the sentences speak of them in the plural', () => {
    const two = { ...UK_SINGLE_COMPANY, sections: { ...UK_SINGLE_COMPANY.sections, policies: { ...UK_SINGLE_COMPANY.sections.policies,
      policy_list: [{ name: 'Supplier Code of Conduct', year: '2024-03', approved_by: 'Board of Directors' }, { name: 'Human Rights Policy', year: '2023-11', approved_by: '' }] } } }
    const m = buildUkStatementModel(two)
    const all = printed(m)
    expect(all).toContain('We have written policies on slavery and human trafficking, listed below.')
    expect(all).toContain('Our contracts or purchase terms require suppliers to follow them.')
    expect(all).toContain('Our Head of Sourcing is accountable for these policies.')
    expect(m.parts.flatMap(p => p.blocks).find(b => b.kind === 'table')).toMatchObject({ title: 'Policies', columns: ['Policy', 'Date', 'Approved by'],
      rows: [['Supplier Code of Conduct', 'March 2024', 'Board of Directors'], ['Human Rights Policy', 'November 2023', '']] })
  })
})

describe('dates', () => {
  it('month and year, or the full date; never ISO', () => {
    expect(ukDateText('2024-03')).toBe('March 2024')
    expect(ukDateText('2026-05-14')).toBe('14 May 2026')
    expect(ukDateText('Spring 2024')).toBe('Spring 2024')
    for (const f of FIXTURES) expect(printed(buildUkStatementModel(f)).filter(s => /\b\d{4}-\d{2}(-\d{2})?\b/.test(s)), f.giving).toEqual([])
  })
})

describe('approval and signing by kind of organisation (s.54(6))', () => {
  const cases: [UkOrgType, string, string | null][] = [
    ['company', 'This statement was signed by A B, T, a director of Harbourside Consulting LLP, on 1 June 2026.', 'This statement was approved by the Board of Directors of Harbourside Consulting LLP on 31 May 2026.'],
    ['body_corporate', 'This statement was signed by A B, T, a director (or equivalent) of Harbourside Consulting LLP, on 1 June 2026.', 'This statement was approved by the Board of Directors of Harbourside Consulting LLP on 31 May 2026.'],
    ['llp', 'This statement was signed by A B, T, a designated member of Harbourside Consulting LLP, on 1 June 2026.', 'This statement was approved by the members of Harbourside Consulting LLP on 31 May 2026.'],
    ['limited_partnership', 'This statement was signed by A B, T, a general partner of Harbourside Consulting LLP, on 1 June 2026.', null],
    ['other_partnership', 'This statement was signed by A B, T, a partner of Harbourside Consulting LLP, on 1 June 2026.', null],
  ]
  for (const [type, signed, approved] of cases) it(type, () => {
    const input = withApproval({ org_type: type, approving_body: 'Board of Directors', approval_date: '2026-05-31', signed_date: '2026-06-01' })
    const sig = signing(input)
    expect(sig.attestation).toEqual([signed])
    expect(sig.signers).toEqual([{ entity: 'Harbourside Consulting LLP', statement: '', rows: [
      { label: 'Name', value: 'A B' }, { label: 'Position', value: 'T' }, { label: 'Date', value: '1 June 2026' }, { label: 'Signature', value: '' }] }])
    expect(approvalParas(input)).toEqual(approved ? [approved] : [])
    expect(printed(buildUkStatementModel(input)).join('\n')).not.toMatch(/Signed as/)
  })
  it('the role is not repeated when the position already states it', () => {
    expect(signing(UK_SINGLE_COMPANY).attestation[0]).toBe('This statement was signed by Alex Morgan, Director of Fellside Outdoor Clothing Ltd, on 15 May 2026.')
    expect(signing(UK_GROUP).attestation[0]).toBe('This statement was signed by Jordan Reid, Chief Executive and Director of Fellside Group plc, on 21 May 2026.')
    expect(signing(UK_LLP).attestation[0]).toBe('This statement was signed by Sam Patel, Designated Member of Harbourside Consulting LLP, on 2 July 2026.')
    const as = (org_type: UkOrgType, signer_title: string) => signing(withApproval({ org_type, signer_title })).attestation[0]
    expect(as('company', 'Company Secretary')).toBe('This statement was signed by A B, Company Secretary, a director of Harbourside Consulting LLP.')
    expect(as('company', 'Managing Director')).toBe('This statement was signed by A B, Managing Director of Harbourside Consulting LLP.')
    expect(as('body_corporate', 'Chair of the Management Committee')).toBe('This statement was signed by A B, Chair of the Management Committee, a director (or equivalent) of Harbourside Consulting LLP.')
    expect(as('body_corporate', 'Director')).toBe('This statement was signed by A B, Director of Harbourside Consulting LLP.')
    expect(as('llp', 'Partner')).toBe('This statement was signed by A B, Partner, a designated member of Harbourside Consulting LLP.')
    expect(as('limited_partnership', 'General Partner')).toBe('This statement was signed by A B, General Partner of Harbourside Consulting LLP.')
    expect(as('other_partnership', 'Senior Partner')).toBe('This statement was signed by A B, Senior Partner of Harbourside Consulting LLP.')
    expect(as('other_partnership', 'Practice Manager')).toBe('This statement was signed by A B, Practice Manager, a partner of Harbourside Consulting LLP.')
  })
})

describe('a group statement', () => {
  it('names every organisation it covers, and each one’s approval', () => {
    const m = buildUkStatementModel(UK_GROUP)
    expect(m.cover.rows).toContainEqual(['Organisations covered', 'Fellside Group plc; Fellside Outdoor Clothing Ltd; Fellside Retail Ltd'])
    const approval = m.parts.at(-1)!.blocks
    expect(approval.find(b => b.kind === 'table')).toMatchObject({ title: 'Approval by each other organisation covered', rows: [
      ['Fellside Outdoor Clothing Ltd', 'Board of Directors', '18 May 2026', 'Alex Morgan', 'Director'], ['Fellside Retail Ltd', 'Board of Directors', '19 May 2026', 'Chris Lee', 'Director']] })
  })
  it('a column empty in every row is left out', () => {
    const rows = [{ organisation: 'A Ltd', approved_by: 'Board of Directors', approval_date: '', signer_name: 'C D', signer_title: '' }]
    const g = { ...UK_GROUP, sections: { ...UK_GROUP.sections, approval: { ...UK_GROUP.sections.approval, group_approvals: rows } } }
    expect(buildUkStatementModel(g).parts.at(-1)!.blocks.find(b => b.kind === 'table')).toMatchObject({ columns: ['Organisation', 'Approved by', 'Signed by'], rows: [['A Ltd', 'Board of Directors', 'C D']] })
  })
})

describe('voice: generated sentences in the first person plural', () => {
  /** The sentences the model wrote (not answers printed as given), outside approval and signing. */
  const generated = (f: UkStatementInput) => {
    const { model, trace } = buildUkStatement(f)
    const ours = new Set(trace.map(t => t.text))
    return model.parts.slice(0, -1).flatMap(p => paras(p.blocks)).filter(s => ours.has(s))
  }
  it('never the organisation’s name, "the group" or "the organisation"; the same sentences for a group as for one organisation', () => {
    for (const f of FIXTURES) {
      const g = generated(f)
      expect(g.length, f.giving).toBeGreaterThan(0)
      for (const name of f.covered) expect(g.filter(s => s.includes(name)), f.giving).toEqual([])
      expect(g.filter(s => /\b(the group|the organisation|its own|it controls)\b/i.test(s)), f.giving).toEqual([])
    }
    const single = { ...UK_GROUP, sections: { ...UK_GROUP.sections, statement_details: { ...UK_GROUP.sections.statement_details, is_group_statement: 'No' } } }
    expect(generated(single)).toEqual(generated(UK_GROUP))
    expect(generated(UK_SINGLE_COMPANY)).toEqual(expect.arrayContaining(['We can see our direct suppliers and some of their suppliers.',
      'We assessed the risk of slavery and human trafficking in our business and supply chains during the financial year.']))
  })
  it('approval and signing stay in the third person, with the organisation’s name', () => {
    expect(approvalParas(UK_GROUP)).toEqual(['This statement was approved by the Board of Directors of Fellside Group plc on 20 May 2026.'])
    expect(signing(UK_GROUP).attestation[0]).toMatch(/^This statement was signed by .* of Fellside Group plc, on /)
  })
})

describe('page layout', () => {
  /** Each fixture, and versions pushed down the page by a longer opening, so the breaks fall in different places. */
  const variants = FIXTURES.flatMap(f => Array.from({ length: 20 }, (_, i) => i * 2).map(n => ({ name: `${f.giving} +${n}`, input: { ...f, sections: { ...f.sections,
    steps_taken: { ...f.sections.steps_taken, steps_summary: [str(f.sections.steps_taken?.steps_summary), ...Array(n).fill('We reviewed our suppliers again during the year.')].filter(Boolean).join(' ') } } } })))
  const pagesOf = (input: UkStatementInput) => generateS211ReportPDF(buildUkStatementModel(input), UK_PDF_OPTIONS).pages
  it('a heading and its reference line never end a page without the first content beneath them', () => {
    for (const v of variants) for (const p of pagesOf(v.input)) expect(p.firstContentPage, `${v.name}: ${p.title}`).toBe(p.headingPage)
  })
  it('approval and signing are on one page together', () => {
    for (const v of variants) {
      const last = pagesOf(v.input).at(-1)!
      expect(last.title).toBe('Approval and signing')
      expect(last.endPage, v.name).toBe(last.headingPage)
    }
  })
  it('negative control: without the UK options the same variants do strand a heading and split approval', () => {
    const plain = variants.map(v => { const m = buildUkStatementModel(v.input); return generateS211ReportPDF({ ...m, parts: m.parts.map(p => ({ ...p, keepTogether: false })) }, { format: 'a4' }).pages })
    expect(plain.filter(pg => pg.some(p => p.firstContentPage !== p.headingPage)).length).toBeGreaterThan(0)
    expect(plain.filter(pg => pg.at(-1)!.endPage !== pg.at(-1)!.headingPage).length).toBeGreaterThan(0)
  })
})

describe('British English', () => {
  it('its own words are British', () => {
    for (const f of FIXTURES) expect(printed(buildUkStatementModel(f)).join('\n')).not.toMatch(/\b(organiz\w*|recogniz\w*|program)\b/i)
  })
})

describe('the UK export gate', () => {
  const complete = (input: typeof UK_SINGLE_COMPANY) =>
    Object.fromEntries(UK_SECTIONS.map(d => [d.key, { status: 'complete' as const, content: input.sections[d.key as UkSectionKey] ?? {} }])) as Record<UkSectionKey, { status: 'complete'; content: SectionContent }>

  it('a finished statement is ready, for each fixture', () => {
    for (const f of [UK_SINGLE_COMPANY, UK_LLP, UK_GROUP]) expect(ukExportGate(complete(f), { giving: f.giving, covered: f.covered }), f.giving).toEqual({ ready: true, blockers: [] })
  })
  it('blocks an incomplete required section, a missing giving organisation, and a group with no others', () => {
    const s = complete(UK_SINGLE_COMPANY)
    s.approval = { status: 'in_progress' as never, content: {} }
    const g = ukExportGate(s, { giving: null, covered: [] })
    expect(g.ready).toBe(false)
    expect(g.blockers.map(b => b.message)).toEqual(expect.arrayContaining(['9. Approval and signing is not marked complete.', 'Choose the organisation giving the statement.']))
    const group = complete(UK_GROUP)
    expect(ukExportGate(group, { giving: 'Fellside Group plc', covered: ['Fellside Group plc'] }).blockers.map(b => b.message))
      .toContain('A group statement covers more than one organisation: choose the others it covers.')
  })
  it('blocks a saved draft, not an offered one', () => {
    const s = complete(UK_SINGLE_COMPANY)
    s.training = { status: 'complete', content: { ...s.training.content, [DRAFT_KEY]: { training_description: 'canada' } } }
    const b = ukExportGate(s, { giving: UK_SINGLE_COMPANY.giving, covered: UK_SINGLE_COMPANY.covered }).blockers
    expect(b).toEqual([{ section: 'training', missing: ['What the training covers, and how it is reviewed'],
      message: '8. Training: an answer started from another country’s report is not confirmed. Edit each, or confirm that it covers slavery and human trafficking.' }])
    s.training = { status: 'complete', content: withoutOffered({ ...UK_SINGLE_COMPANY.sections.training!, [OFFERED_KEY]: { x: 'canada' }, x: 'offered' } as SectionContent) }
    expect(ukExportGate(s, { giving: UK_SINGLE_COMPANY.giving, covered: UK_SINGLE_COMPANY.covered }).ready).toBe(true)
  })
})
