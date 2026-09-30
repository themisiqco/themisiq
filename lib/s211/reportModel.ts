// lib/s211/reportModel.ts
// The S-211 report as a document: what the PDF prints, built from the saved report and its sections.
// Pure: no React, no database. lib/s211/reportPdf.ts draws it and decides nothing.
//
// ⚠️ THE ENTITY'S DOCUMENT, NOT OURS. This is what the entity files with Public Safety Canada and
// publishes on its website. Only the user's own answers print, under plain headings. No builder
// guidance, prompt, example, key term or ThemisIQ commentary appears in the body. The one exception is
// an optional "Prepared with ThemisIQ" footer, off unless the caller turns it on.
//
// ⚠️ HEADINGS ARE REPORT LABELS, NOT FIELD LABELS. The builder's labels are prompts ("What the entity did
// in the year"). REPORT_LABEL below gives each printed field a heading a reader of the report expects.
// Every field in lib/s211/builderContent.ts is either printed here or named in NOT_PRINTED_HERE with the
// reason; reportModel.test.ts fails when a new field is in neither, so a field cannot be dropped silently.
//
// ⚠️ SECTION 9 PRINTS AS SAVED. The summary is never rebuilt here from sections 3 to 8: the user
// edited and approved the saved text, and that is the text the governing body approves.

import { SECTIONS, MONTHS, ATTESTATION_SIGNATURE_LINES, type Field, type SectionContent, type SectionKey } from './builderContent'
import { NOTHING_TO_REPORT_KEY, isFilled, isIsoDate } from './sectionStatus'
import { deriveFinancialYear } from './financialYear'

export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'facts'; rows: [string, string][] }
  | { kind: 'table'; title: string; columns: string[]; rows: string[][] }
  /** The attestation and the signature block under it, kept on one page together. */
  | { kind: 'signature'; heading: string; attestation: string[]; signers: SignatureBlock[] }

/** One signer's block: Public Safety Canada's four lines and the authority statement for one entity. */
export type SignatureBlock = { entity: string; rows: { label: string; value: string }[]; statement: string }

export type ReportPart = { key: SectionKey; title: string; reference: string | null; blocks: Block[] }

export type S211ReportModel = {
  cover: { title: string; legalName: string; revised: boolean; rows: [string, string][] }
  /** The running header on every page after the cover. */
  runningHeader: string
  parts: ReportPart[]
  /** null unless the caller asked for it. */
  footerCredit: string | null
  metadata: { title: string; subject: string; author: string; language: 'en-CA' }
}

export type S211ReportInput = { reportingYear: number; sections: Partial<Record<SectionKey, SectionContent>> }
export type S211ReportOptions = { preparedWithThemisIq?: boolean }

export const ACT_TITLE = 'Fighting Against Forced Labour and Child Labour in Supply Chains Act'
export const REPORT_TITLE = `Report under the ${ACT_TITLE}`
export const PREPARED_WITH = 'Prepared with ThemisIQ'

/** The reference line under each part's heading. Section 10 has none: the Act does not ask for it. */
export const PART_REFERENCE: Record<SectionKey, string | null> = {
  report_details: 'Act s.11(2)',
  structure_activities_supply_chains: 'Act s.11(3)(a)',
  policies_due_diligence: 'Act s.11(3)(b)',
  risks: 'Act s.11(3)(c)',
  remediation: 'Act s.11(3)(d)',
  remediation_income_loss: 'Act s.11(3)(e)',
  training: 'Act s.11(3)(f)',
  effectiveness: 'Act s.11(3)(g)',
  steps_taken: 'Act s.11(1)',
  other_information: null,
  approval_attestation: 'Act s.11(4) and (5)',
}

/**
 * Report headings for the printed fields, by section and field key. A field with `null` prints its
 * paragraph with no heading of its own (the part's heading already says what it is).
 */
export const REPORT_LABEL: Partial<Record<SectionKey, Record<string, string | null>>> = {
  structure_activities_supply_chains: {
    legal_form: 'Legal form', structure_description: 'Structure', employees_canada: 'Employees in Canada',
    employees_outside_canada: 'Employees outside Canada', activities: 'Activities with goods', goods_description: 'Goods',
    operating_countries: 'Countries or regions of operation', supply_chain_description: 'Supply chain',
    supply_chain_visibility: 'Supply chain visibility', source_countries: 'Source countries or regions of the goods',
    unknowns: 'Gaps in our knowledge of the supply chain', information_gathering: 'How the information in this report was gathered',
    changes_since_last_report: 'Changes since the last report',
  },
  policies_due_diligence: {
    has_policy: 'Written policy on forced labour and child labour', policy_list: 'Policies', policy_applies_to: 'Where the policy applies',
    supplier_terms: 'Contracts or purchase terms requiring suppliers to follow the policy',
    due_diligence_steps: 'Due diligence steps (OECD Due Diligence Guidance for Responsible Business Conduct)',
    due_diligence_description: 'Due diligence during the financial year', responsible_role: 'Accountable role',
    policy_topics: 'Topics the policies cover', international_standards: 'International standards the policies refer to',
    policy_communication: 'How the policies are communicated and enforced', purchasing_practices: 'Our purchasing practices',
    controlled_entities: 'Entities we control',
  },
  risks: {
    risk_assessment_done: 'Risk assessment during the financial year', assessment_methods: 'How the risks were assessed',
    risk_areas: 'Risk areas', own_operations_risk: 'Risks in our own operations', management_steps: 'How we managed the risks',
    assessment_timing: 'Timing of the risk assessment', assessment_role: 'Role responsible for the risk assessment',
    stakeholder_engagement: 'Stakeholders engaged', controlled_entities: 'Entities we control',
  },
  remediation: {
    instances_identified: 'Instances of forced labour or child labour', remediation_taken: 'Remediation measures taken',
    remediation_description: 'Remediation measures', grievance_mechanism: 'Channel for reporting concerns',
    grievance_description: 'How the channel works', controlled_entities: 'Entities we control',
  },
  remediation_income_loss: {
    measures_caused_loss: 'Loss of income caused by our measures', income_remediation_taken: 'Measures to remediate lost income',
    income_remediation_description: 'Remediation of lost income', controlled_entities: 'Entities we control',
  },
  training: {
    training_provided: 'Training during the financial year', mandatory: 'Mandatory or optional', audience: 'Who received it',
    covers: 'Topics covered', developed_by: 'Developed', developer_name: 'Developed by', frequency_and_length: 'Length and frequency',
    employees_trained: 'Employees who completed it', assessment: 'Ends with a test or other check',
    training_description: 'Training content and review', controlled_entities: 'Entities we control',
  },
  effectiveness: {
    assesses_effectiveness: 'Process for assessing effectiveness', methods: 'How effectiveness is assessed', indicators: 'Indicators',
    effectiveness_description: 'How the assessment is done', goal_horizons: 'Time horizons', goals_short_term: 'Short-term goals',
    goals_medium_term: 'Medium-term goals', goals_long_term: 'Long-term goals', progress_since_last_report: 'Progress since the last report',
    findings_changed_practice: 'How findings changed our practices', controlled_entities: 'Entities we control',
  },
  steps_taken: {
    steps_summary: null, scope_of_actions: 'Scope of the actions', governance: 'Responsibility and oversight',
    external_engagement: 'Work with industry initiatives, NGOs, trade unions or government', controlled_entities: 'Entities we control',
  },
  other_information: {
    other_description: null, challenges: 'Challenges', steps_planned_next: 'Steps planned before the next report', links: 'Public documents',
  },
}

/** Column headings for the printed tables, where the builder's column label is a prompt. */
const COLUMN_LABEL: Record<string, Record<string, string>> = {
  'policies_due_diligence.policy_list': { name: 'Policy', year: 'Adopted or last updated', approved_by: 'Approved by' },
  'policies_due_diligence.due_diligence_steps': { step: 'Step', status: 'Status' },
  'risks.risk_areas': { area: 'Area', why: 'Why it carries a risk', worker_groups: 'Worker groups affected', action: 'What was done' },
  'effectiveness.indicators': { indicator: 'Indicator', this_year: 'This year', last_year: 'Last year' },
  'other_information.links': { title: 'Document', url: 'Web address' },
}

/** Fields the parts do not print field by field, and why. Section 1 and section 11 are assembled whole. */
export const NOT_PRINTED_HERE: Record<string, string> = {
  'report_details.*': 'Section 1 is printed as the cover and the report details part, assembled from its answers.',
  'approval_attestation.*': 'Section 11 is printed as the approval statement, the attestation and the signature block.',
  'other_information.has_other_information': 'Decides whether section 10 prints at all.',
}

// ── helpers ───────────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
type Row = Record<string, string>
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((r): r is Row => !!r && typeof r === 'object') : [])

/** "2026-04-14" as "April 14, 2026". Anything that is not a date is returned as typed. */
export function longDate(iso: string): string {
  if (!isIsoDate(iso)) return iso
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** A sentence ending in one full stop, however the last name ends ("Inc." does not become "Inc.."). */
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`)


/** Paragraphs as typed: split at blank lines, single line breaks kept inside a paragraph. */
const paras = (text: string): Block[] =>
  text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => ({ kind: 'para' as const, text: p }))

/** The financial year the report covers: the user's corrected dates if both are given, otherwise derived. */
export function financialYearOf(s1: SectionContent, reportingYear: number): { start: string; end: string } | null {
  const start = str(s1.financial_year_start), end = str(s1.financial_year_end)
  if (isIsoDate(start) && isIsoDate(end)) return { start, end }
  if (typeof s1.year_end_month === 'number' && typeof s1.year_end_day === 'number') {
    const d = deriveFinancialYear(s1.year_end_month, s1.year_end_day, reportingYear)
    if (d) return { start: isIsoDate(start) ? start : d.start, end: isIsoDate(end) ? end : d.end }
  }
  return null
}

/** The entities the report covers: the legal name for a single report; the listed names for a joint one. */
export function entitiesCovered(s1: SectionContent): string[] {
  const legal = str(s1.legal_name)
  if (s1.report_type === 'joint') {
    const listedNames = strings(s1.joint_entities)
    return listedNames.length ? listedNames : legal ? [legal] : []
  }
  return legal ? [legal] : []
}

/**
 * The approval statement s.11(5)(a) requires, naming the paragraph of s.11(4) relied on and using its
 * words: "the governing body of each entity included in the report", "the entity ... that controls each
 * entity included in the report". reportModel.test.ts checks those phrases against the verified constant.
 */
export function approvalStatement(s11: SectionContent, legalName: string): string {
  const raw = str(s11.governing_body)
  const body = /^the\s/i.test(raw) ? raw : `the ${raw}`
  const date = str(s11.approval_date)
  // The date leads, so it cannot be read as the date of anything but the approval.
  const lead = date ? `On ${longDate(date)}, this` : 'This'
  switch (s11.approval_basis) {
    case 'single':
      return `${lead} report was approved by ${body} of ${legalName}, as the governing body of the entity, under paragraph 11(4)(a) of the Act.`
    case 'joint_each':
      return `${lead} joint report was approved by the governing body of each entity included in the report (${raw}), under subparagraph 11(4)(b)(i) of the Act.`
    case 'joint_controlling':
      return `${lead} joint report was approved by ${body} of ${str(s11.controlling_entity) || legalName}, as the governing body of the entity that controls each entity included in the report, under subparagraph 11(4)(b)(ii) of the Act.`
    default:
      return `${lead} report was approved by ${body} of ${legalName}.`
  }
}

/**
 * The signature blocks, one per approving governing body, as s.11(5)(b) asks for "the signature of one
 * or more members of the governing body of each entity that approved the report":
 *   11(4)(a)      one block, binding the entity;
 *   11(4)(b)(i)   one block for each entity covered, each binding that entity, signer from its row;
 *   11(4)(b)(ii)  one block, binding the controlling entity whose body approved.
 * The authority statement follows the guidance: "the approving member has the legal authority to bind
 * the entity" (S211_ATTESTATION_AUTHORITY), so each signer binds the entity whose body they sign for.
 */
export function signatureBlocks(s11: SectionContent, s1: SectionContent): SignatureBlock[] {
  const [nameLabel, titleLabel, dateLabel] = ATTESTATION_SIGNATURE_LINES
  const block = (entity: string, name: string, title: string): SignatureBlock => ({
    entity,
    rows: [
      { label: nameLabel, value: name }, { label: titleLabel, value: title },
      { label: dateLabel, value: '' }, { label: 'Signature', value: '' },
    ],
    statement: sentence(`I have the authority to bind ${entity}`),
  })
  const legalName = str(s1.legal_name)
  if (s11.approval_basis === 'joint_each') {
    const rows = rowsOf(s11.entity_signatories)
    const key = (x: string) => x.trim().toLowerCase()
    return entitiesCovered(s1).map(e => {
      const r = rows.find(x => key(str(x.entity)) === key(e))
      return block(e, str(r?.name), str(r?.title))
    })
  }
  const entity = s11.approval_basis === 'joint_controlling' ? (str(s11.controlling_entity) || legalName) : legalName
  return [block(entity, str(s11.signatory_name), str(s11.signatory_title))]
}

/** Entities covered by a joint report that have no signer row, and signer rows naming no covered entity. */
export function signerMismatches(s11: SectionContent, s1: SectionContent): { unsigned: string[]; unknown: string[] } {
  if (s11.approval_basis !== 'joint_each') return { unsigned: [], unknown: [] }
  const key = (x: string) => x.trim().toLowerCase()
  const rows = rowsOf(s11.entity_signatories).filter(r => str(r.entity) || str(r.name) || str(r.title))
  const covered = entitiesCovered(s1)
  return {
    unsigned: covered.filter(e => !rows.some(r => key(str(r.entity)) === key(e) && str(r.name) && str(r.title))),
    unknown: rows.map(r => str(r.entity)).filter(e => e && !covered.some(c => key(c) === key(e))),
  }
}

// ── one part, field by field ──────────────────────────────────────────────────────────────────────

function fieldValue(f: Field, v: unknown): string | null {
  switch (f.type) {
    case 'number': return typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-CA') : null
    case 'date': return str(v) ? longDate(str(v)) : null
    case 'checklist': case 'list': { const xs = strings(v); return xs.length ? xs.join('\n') : null }
    case 'confirm': return null
    case 'month': return typeof v === 'number' && v >= 1 && v <= 12 ? MONTHS[v - 1] : null
    default: { const s = str(v); return s ? (f.optionLabels?.[s] ?? s) : null }
  }
}

function fieldBlocks(key: SectionKey, c: SectionContent): Block[] {
  const def = SECTIONS.find(s => s.key === key)!
  const labels = REPORT_LABEL[key] ?? {}
  const out: Block[] = []
  let facts: [string, string][] = []
  const flush = () => { if (facts.length) { out.push({ kind: 'facts', rows: facts }); facts = [] } }

  const nothing = str(c[NOTHING_TO_REPORT_KEY])
  if (nothing) out.push(...paras(nothing))

  for (const f of def.fields) {
    if (!(f.key in labels)) continue
    if (f.showWhen && !f.showWhen(c)) continue
    const v = c[f.key]
    if (!isFilled(v)) continue
    let label = labels[f.key]
    // "The policy" only when a written policy is ticked (review item A6, carried into the report).
    if (key === 'policies_due_diligence' && f.key === 'supplier_terms' && c.has_policy !== 'Yes') {
      label = 'Contracts or purchase terms requiring suppliers to follow a code of conduct or sourcing standard'
    }
    if (f.type === 'textarea') {
      flush()
      if (label) out.push({ kind: 'subheading', text: label })
      out.push(...paras(str(v)))
    } else if (f.type === 'rows') {
      flush()
      const colLabels = COLUMN_LABEL[`${key}.${f.key}`] ?? {}
      const rows = rowsOf(v).filter(r => Object.values(r).some(x => str(x)))
      // A column no row fills is left out rather than printed empty.
      const cols = (f.columns ?? []).filter(col => rows.some(r => str(r[col.key])))
      if (rows.length && cols.length) {
        out.push({ kind: 'table', title: label ?? f.label, columns: cols.map(col => colLabels[col.key] ?? col.label), rows: rows.map(r => cols.map(col => str(r[col.key]))) })
      }
    } else {
      const value = fieldValue(f, v)
      if (value !== null && label) facts.push([label, value])
    }
  }
  flush()
  return out
}

// ── the model ─────────────────────────────────────────────────────────────────────────────────────

export function buildS211ReportModel(input: S211ReportInput, options: S211ReportOptions = {}): S211ReportModel {
  const s1 = input.sections.report_details ?? {}
  const s11 = input.sections.approval_attestation ?? {}
  const legalName = str(s1.legal_name)
  const joint = s1.report_type === 'joint'
  const entities = entitiesCovered(s1)
  const fy = financialYearOf(s1, input.reportingYear)
  const fyText = fy ? `${longDate(fy.start)} to ${longDate(fy.end)}` : 'Not stated'
  const revised = s1.is_revised === 'Yes'
  const otherLaws = strings(s1.other_jurisdictions).filter(x => x !== 'None')

  const coverRows: [string, string][] = [
    ['Report type', joint ? 'Joint report' : 'Single report'],
    ...(joint ? [['Entities covered', entities.join('\n')] as [string, string]] : []),
    ['Financial year', fyText],
    ['Reporting year', String(input.reportingYear)],
    ...(revised ? [['Revised report', str(s1.revision_date) ? `Revised on ${longDate(str(s1.revision_date))}` : 'Yes'] as [string, string]] : []),
    ...(otherLaws.length ? [['Also reports under', otherLaws.join('\n')] as [string, string]] : []),
  ]

  const parts: ReportPart[] = []
  for (const d of SECTIONS) {
    const c = input.sections[d.key] ?? {}
    if (d.optional && c.has_other_information !== 'Yes') continue
    const part: ReportPart = { key: d.key, title: d.title, reference: PART_REFERENCE[d.key], blocks: [] }

    if (d.key === 'report_details') {
      const facts: [string, string][] = [
        ['Legal name', legalName],
        ['Financial year', fyText],
        ['Report type', joint ? 'Joint report' : 'Single report'],
        ...(joint ? [['Entities covered', entities.join('\n')] as [string, string]] : []),
        ['Revised report', revised ? 'Yes' : 'No'],
        ...(revised && str(s1.revision_date) ? [['Date of the revision', longDate(str(s1.revision_date))] as [string, string]] : []),
        ...(otherLaws.length ? [['Also reports under', otherLaws.join('\n')] as [string, string]] : []),
      ]
      part.blocks.push({ kind: 'facts', rows: facts })
      if (revised && str(s1.revision_changes)) {
        part.blocks.push({ kind: 'subheading', text: 'Changes from the original report' }, ...paras(str(s1.revision_changes)))
      }
    } else if (d.key === 'approval_attestation') {
      part.blocks.push({ kind: 'para', text: approvalStatement(s11, legalName) })
      // Public Safety Canada's four lines, in its order, once per approving body. The names and titles are
      // the one piece of personal information the report carries; dates and signatures are left blank.
      part.blocks.push({
        kind: 'signature',
        heading: 'Attestation',
        attestation: paras(str(s11.attestation_text)).map(b => (b as { text: string }).text),
        signers: signatureBlocks(s11, s1),
      })
    } else {
      part.blocks.push(...fieldBlocks(d.key, c))
    }
    parts.push(part)
  }

  return {
    cover: { title: REPORT_TITLE, legalName, revised, rows: coverRows },
    runningHeader: `${legalName}  ·  Financial year ${fyText}`,
    parts,
    footerCredit: options.preparedWithThemisIq ? PREPARED_WITH : null,
    metadata: {
      title: `${legalName}: ${REPORT_TITLE}, financial year ${fyText}`,
      subject: `Annual report under section 11 of the ${ACT_TITLE} (Canada)${revised ? ', revised' : ''}`,
      author: legalName,
      language: 'en-CA',
    },
  }
}

/** The file name the download is saved under: plain ASCII, no spaces. */
export function reportFileName(model: S211ReportModel, reportingYear: number): string {
  const base = model.cover.legalName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${base || 'report'}-S-211-report-${reportingYear}${model.cover.revised ? '-revised' : ''}.pdf`
}
