// lib/forcedLabour/uk/builderContent.ts
// The UK statement builder's sections (Modern Slavery Act 2015, s.54). Stage D1 (1 Oct 2026).
//
// ⚠️ BRITISH SPELLING. Everything UK-specific is written in British English ("organisation", "recognise",
// "programme"): titles, labels, hints, plain explanations. Shared screens and Canada keep Canadian spelling.
// A quotation keeps its source's spelling. lib/forcedLabour/uk/spelling.test.ts holds both rules.
//
// ⚠️ QUOTATIONS COME FROM lib/forcedLabour/uk/requirements.ts AND NOWHERE ELSE, and law and guidance are
// marked as lib/forcedLabour/requirementsMap.ts marks them: s.54(4) is the only content the Act requires;
// the six s.54(5) topics are what a statement "may include", which the statutory guidance recommends covering.
//
// ⚠️ SHARED FIELDS KEEP CANADA'S DEFINITION. A field shared with the Canada report (lib/forcedLabour/
// fieldRegistry.ts) takes its type, options and columns from lib/s211/builderContent.ts, so a value saved in
// either builder fits the other. Only the words change: a UK label and hint, British option labels, and a
// UK source tag. A UK-only field is in the registry too, under a "uk_" section.
//
// ⚠️ SCOPE (Stage D1b). Canada asks about forced labour and child labour; section 54 is about slavery and human
// trafficking. Answers whose meaning depends on that are per-country (fieldRegistry.ts PER_COUNTRY): the UK keeps
// its own, and may start from Canada's as a draft marked "check it covers slavery and human trafficking".

import {
  UK_MSA_S54_4, UK_MSA_S54_5, UK_MSA_S54_6, UK_MSA_S54_12_COMMERCIAL_ORGANISATION, UK_MSA_S54_12_PARTNERSHIP, UK_REGS_1_2_B, UK_REGS_3_2,
  UK_GUIDANCE_CONTENT_AREAS, UK_GUIDANCE_NO_STEPS, UK_GUIDANCE_GROUP_ONE_STATEMENT, UK_GUIDANCE_GROUP_STATEMENT, UK_GUIDANCE_PLAIN_LANGUAGE,
  UK_GUIDANCE_APPROVAL, UK_GUIDANCE_APPROVAL_DATE, UK_GOVUK_APPROVAL_STATEMENT, UK_GOVUK_SIGN_OFF,
} from './requirements'
import { OPEN_QUESTIONS } from '../requirementsMap'
import { PER_COUNTRY } from '../fieldRegistry'
import { SECTIONS as CANADA_SECTIONS, letteredLines, type Field, type Quote, type SectionContent, type SectionKey } from '../../s211/builderContent'

// ── Keys ────────────────────────────────────────────────────────────────────────────────────────────
export const UK_SECTION_KEYS = [
  'statement_details', 'steps_taken', 'structure_business_supply_chains', 'policies', 'due_diligence', 'risk', 'effectiveness', 'training', 'approval',
] as const
export type UkSectionKey = typeof UK_SECTION_KEYS[number]
export const isUkSectionKey = (k: unknown): k is UkSectionKey => typeof k === 'string' && (UK_SECTION_KEYS as readonly string[]).includes(k)

// ── Source tags ─────────────────────────────────────────────────────────────────────────────────────
export type UkSource = 'act' | 'uk-topic' | 'template' | 'good-practice'
export const UK_SOURCE_LABEL: Record<UkSource, string> = {
  act: 'Required by the Act',
  'uk-topic': 'Section 54(5) lists it; the statutory guidance recommends it',
  template: 'International reporting template, optional',
  'good-practice': 'Good practice',
}

/** A UK field: a Field as the builder draws it, with the registry key its answer is kept under. */
export type UkField = Field & { registryKey: string; ukSource: UkSource; sharedNote?: string }

export type UkSectionDef = {
  key: UkSectionKey
  number: number
  title: string
  /** The Act's words, and whether the Act requires the content ('requires') or lists it ('may include'). */
  actQuote: Quote
  actStatus: 'requires' | 'may-include' | 'identifies'
  mapsTo: string
  plainTerms: string
  readersLookFor: string
  /** Verbatim statutory guidance, each with its source. */
  context: Quote[]
  fields: UkField[]
  /** An open question shown, as a question, when the answers make it relevant. */
  openQuestion?: { when: (c: SectionContent) => boolean; text: string; quotes: Quote[] }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────
const ACT_REF = 'Modern Slavery Act 2015'
const GUIDANCE_REF = 'Home Office, Transparency in supply chains: a practical guide'
const GOVUK_REF = 'GOV.UK, Publish an annual modern slavery statement'

/** The kinds of organisation s.54(6) distinguishes, as the approval section asks. */
export const UK_ORG_TYPES = [
  { value: 'company', label: 'A company' },
  { value: 'body_corporate', label: 'Another body corporate (not a company or an LLP)' },
  { value: 'llp', label: 'A limited liability partnership (LLP)' },
  { value: 'limited_partnership', label: 'A limited partnership registered under the Limited Partnerships Act 1907' },
  { value: 'other_partnership', label: 'Any other kind of partnership' },
] as const
export type UkOrgType = typeof UK_ORG_TYPES[number]['value']
/** Who signs, by kind of organisation (s.54(6)(a) to (d)), as a phrase. */
export const UK_SIGNER_ROLE: Record<UkOrgType, string> = {
  company: 'a director',
  body_corporate: 'a director (or equivalent)',
  llp: 'a designated member',
  limited_partnership: 'a general partner',
  other_partnership: 'a partner',
}
/** A company or another body corporate (not an LLP): s.54(6)(a), board approval and a director's signature. */
export const isBoard = (t: unknown): boolean => t === 'company' || t === 'body_corporate'
/** Who approves, where the Act names an approver (s.54(6)(a) and (b)); null where it names none. */
export const UK_APPROVER: Record<UkOrgType, string | null> = {
  company: 'the board of directors',
  body_corporate: 'the board of directors (or equivalent management body)',
  llp: 'the members',
  limited_partnership: null,
  other_partnership: null,
}
const guidance = (text: string): Quote => ({ lines: [text], ref: GUIDANCE_REF })
const LI_LINES = (p: { leadIn: string; items: readonly string[]; tail?: string }) => [p.leadIn, ...p.items, ...(p.tail ? [p.tail] : [])]
const s54_5 = (letter: string): Quote => {
  const p = UK_MSA_S54_5.paragraphs.find(x => x.letter === letter)!
  return { lines: [UK_MSA_S54_5.leadIn, `(${p.letter}) ${p.text}`], ref: `${ACT_REF}, s.54(5)(${letter})` }
}
const area = (i: number): Quote => ({ lines: [UK_GUIDANCE_CONTENT_AREAS.leadIn, UK_GUIDANCE_CONTENT_AREAS.items[i]], ref: GUIDANCE_REF })

/** Canadian spellings in shared option values, shown with British labels in the UK builder. */
export const toBritish = (s: string): string =>
  s.replace(/\borganization/g, 'organisation').replace(/\bOrganization/g, 'Organisation')
    .replace(/\brecogniz/g, 'recognis').replace(/\bprogram\b/g, 'programme')

/** The registry key of a UK field built on Canada's question: Canada's, or the UK's own if it is per-country. */
const ukRegistryKey = (section: SectionKey, key: string): string => {
  const p = PER_COUNTRY.find(x => x.key === `${section}.${key}`)
  return p?.ukSection ? `uk_${p.ukSection}.${key}` : `${section}.${key}`
}

const canadaField = (section: SectionKey, key: string): Field => {
  const f = CANADA_SECTIONS.find(s => s.key === section)!.fields.find(x => x.key === key)
  if (!f) throw new Error(`No Canada field ${section}.${key}`)
  return f
}

/**
 * A field built on Canada's question: Canada's definition (type, options, columns, limits, the conditions within
 * its own section), UK words, and nothing required unless the UK says so. Shared with Canada, unless the
 * registry makes it per-country (fieldRegistry.ts PER_COUNTRY): then the UK keeps its own answer, under
 * `uk_<UK section>.<field>`, and may start it from Canada's as a draft.
 */
function shared(section: SectionKey, key: string, ui: { label: string; hint: string; source: UkSource; optionLabels?: Record<string, string>; showWhen?: (c: SectionContent) => boolean; labelWhen?: (c: SectionContent) => string; sharedNote?: string; required?: Field['required'] }): UkField {
  const base = canadaField(section, key)
  const optionLabels = ui.optionLabels ?? (base.options ? Object.fromEntries(base.options.map(o => [o, toBritish(o)])) : undefined)
  return {
    ...base, label: ui.label, hint: ui.hint, source: 'good-practice', ukSource: ui.source, registryKey: ukRegistryKey(section, key),
    required: ui.required ?? false, waivedByNothingToReport: undefined,
    optionLabels, ...(ui.showWhen ? { showWhen: ui.showWhen } : {}),
    labelWhen: ui.labelWhen, sharedNote: ui.sharedNote,
    columns: base.columns?.map(c => ({ ...c, label: toBritish(c.label) })),
  }
}
/** A UK-only field, kept in the UK record under the registry key `<registrySection>.<key>`. */
function ukOnly(registrySection: string, f: Omit<Field, 'source'> & { ukSource: UkSource }): UkField {
  return { ...f, source: 'good-practice', registryKey: `${registrySection}.${f.key}` }
}

const NO_NAMES = 'Use a job title or committee name only. Do not name anyone.'

// ── Sections ────────────────────────────────────────────────────────────────────────────────────────
export const UK_SECTIONS: readonly UkSectionDef[] = [
  {
    key: 'statement_details', number: 1, title: 'Statement details',
    actQuote: { lines: LI_LINES(UK_MSA_S54_12_COMMERCIAL_ORGANISATION), ref: `${ACT_REF}, s.54(12)` },
    actStatus: 'identifies',
    mapsTo: 'Who the statement is for, and the financial year it covers (s.54(1): a statement for each financial year).',
    plainTerms: 'The organisation giving the statement, and the financial year it covers. If one statement is to serve a parent and its subsidiaries, choose every organisation it covers. These can differ from the entities in another country\u2019s report on the same report.',
    readersLookFor: 'The organisation’s full legal name, the financial year, and, for a group statement, each organisation it covers by name.',
    context: [guidance(UK_GUIDANCE_GROUP_ONE_STATEMENT), { lines: LI_LINES(UK_GUIDANCE_GROUP_STATEMENT), ref: GUIDANCE_REF }],
    fields: [
      ukOnly('uk_statement_details', { key: 'is_group_statement', label: 'Is this one statement for a parent and its subsidiaries?', type: 'yn', ukSource: 'good-practice',
        hint: 'The statutory guidance allows a parent to produce one statement that its subsidiaries use. The Act has no provision of its own for it.' }),
      shared('report_details', 'year_end_month', { label: 'Financial year end: month', hint: '', source: 'good-practice' }),
      shared('report_details', 'year_end_day', { label: 'Financial year end: day', hint: 'The day of the month.', source: 'good-practice' }),
      ukOnly('uk_statement_details', { key: 'financial_year_ending', label: 'Year in which that financial year ended', type: 'number', ukSource: 'good-practice',
        hint: 'For example 2025, for a financial year ending on 31 December 2025.' }),
      shared('report_details', 'financial_year_start', { label: 'Financial year start', hint: 'Only if the financial year is not twelve months ending on the date above.', source: 'good-practice' }),
      shared('report_details', 'financial_year_end', { label: 'Financial year end', hint: 'Only if the financial year is not twelve months ending on the date above.', source: 'good-practice' }),
    ],
    openQuestion: {
      when: c => c.is_group_statement === 'Yes',
      text: OPEN_QUESTIONS.find(q => q.country === 'uk')!.question,
      quotes: [{ lines: letteredLines(UK_MSA_S54_6), ref: `${ACT_REF}, s.54(6)` }],
    },
  },
  {
    key: 'steps_taken', number: 2, title: 'Steps taken',
    actQuote: { lines: letteredLines(UK_MSA_S54_4), ref: `${ACT_REF}, s.54(4)` },
    actStatus: 'requires',
    mapsTo: 'Section 54(4): the one thing the Act requires a statement to contain.',
    plainTerms: 'Say what the organisation did during the financial year to ensure that slavery and human trafficking is not taking place in its supply chains or in its own business. If it did nothing, the Act lets it say so plainly instead.',
    readersLookFor: 'Concrete actions taken in the year, rather than intentions, and a statement that is honest where little or nothing was done.',
    context: [guidance(UK_GUIDANCE_NO_STEPS), guidance(UK_GUIDANCE_PLAIN_LANGUAGE)],
    fields: [
      ukOnly('uk_steps_taken', { key: 'statement_kind', label: 'What will the statement say?', type: 'choice', ukSource: 'act', required: true,
        options: ['steps', 'no_steps'],
        optionLabels: { steps: 'The steps the organisation took during the financial year',
          no_steps: `That no steps were taken. The Act allows “${UK_MSA_S54_4.paragraphs[1].text.replace(/\.$/, '')}”` },
        hint: 'Either is a statement under section 54(4).' }),
      shared('steps_taken', 'steps_summary', { label: 'The steps taken during the financial year', source: 'act',
        hint: 'What was done in the year in its supply chains and in its own business.',
        required: c => c.statement_kind === 'steps', showWhen: c => c.statement_kind !== 'no_steps' }),
      shared('steps_taken', 'scope_of_actions', { label: 'Scope of the actions', hint: 'Whether they applied across the organisation and its supply chains, or to parts of them.', source: 'good-practice',
        showWhen: c => c.statement_kind !== 'no_steps' }),
      shared('steps_taken', 'governance', { label: 'Who is responsible, and the senior oversight', hint: NO_NAMES, source: 'good-practice', showWhen: c => c.statement_kind !== 'no_steps' }),
      shared('steps_taken', 'external_engagement', { label: 'Work with industry initiatives, NGOs, trade unions or government bodies', hint: 'Optional.', source: 'good-practice', showWhen: c => c.statement_kind !== 'no_steps' }),
    ],
  },
  {
    key: 'structure_business_supply_chains', number: 3, title: 'Structure, business and supply chains',
    actQuote: s54_5('a'), actStatus: 'may-include',
    mapsTo: 'Section 54(5)(a). The Act lists it as something a statement may include; the statutory guidance recommends covering it.',
    plainTerms: 'How the organisation is set up, what it does, and where its supply chains run. This gives readers the context for everything else in the statement.',
    readersLookFor: 'Who the statement covers, the sectors and countries the supply chains run through, and how far down them the organisation can see.',
    context: [area(0)],
    fields: [
      shared('structure_activities_supply_chains', 'legal_form', { label: 'Legal form', hint: 'How the organisation is constituted in law.', source: 'good-practice',
        optionLabels: { Corporation: 'Company or other body corporate', Trust: 'Trust', Partnership: 'Partnership', 'Other unincorporated organization': 'Other unincorporated organisation' } }),
      shared('structure_activities_supply_chains', 'structure_description', { label: 'Structure', hint: 'Ownership, main business units, and any subsidiaries, with what they do and where.', source: 'uk-topic' }),
      shared('structure_activities_supply_chains', 'goods_description', { label: 'Goods and services', hint: 'The main goods or services the organisation supplies.', source: 'good-practice' }),
      shared('structure_activities_supply_chains', 'operating_countries', { label: 'Countries or regions of operation', hint: 'One per line.', source: 'good-practice' }),
      shared('structure_activities_supply_chains', 'supply_chain_description', { label: 'Supply chains', hint: 'What the organisation buys, the countries it comes from, and the number of direct suppliers.', source: 'uk-topic' }),
      shared('structure_activities_supply_chains', 'supply_chain_visibility', { label: 'How far down the supply chains the organisation can see', hint: 'Choose the closest.', source: 'good-practice' }),
      shared('structure_activities_supply_chains', 'source_countries', { label: 'Source countries or regions', hint: 'One per line.', source: 'good-practice' }),
      shared('structure_activities_supply_chains', 'unknowns', { label: 'What the organisation does not yet know about its supply chains', hint: 'For example the tiers below direct suppliers that have not been mapped.', source: 'template' }),
      shared('structure_activities_supply_chains', 'information_gathering', { label: 'How the information in this statement was gathered', hint: 'For example which teams contributed and what records were used.', source: 'template' }),
      shared('structure_activities_supply_chains', 'changes_since_last_report', { label: 'What changed since the last statement', hint: 'Leave blank for a first statement.', source: 'template' }),
    ],
  },
  {
    key: 'policies', number: 4, title: 'Policies',
    actQuote: s54_5('b'), actStatus: 'may-include',
    mapsTo: 'Section 54(5)(b). The Act lists it as something a statement may include; the statutory guidance recommends covering it.',
    plainTerms: 'The organisation’s policies on slavery and human trafficking: what they are, who they apply to, and how they are put into practice.',
    readersLookFor: 'Named policies with dates, who approved them, whether suppliers are bound by them, and how they are communicated and enforced.',
    context: [area(1)],
    fields: [
      shared('policies_due_diligence', 'has_policy', { label: 'A written policy on slavery and human trafficking', hint: 'For example a supplier code of conduct or a responsible sourcing policy.', source: 'uk-topic' }),
      ukOnly('uk_policies', { key: 'covers_slavery_trafficking', label: 'The policy covers slavery and human trafficking', type: 'ynp', ukSource: 'good-practice',
        options: ['Yes', 'No', 'In progress'], hint: 'Asked for the UK statement only.' }),
      shared('policies_due_diligence', 'policy_list', { label: 'Policies', hint: 'One row per policy, with the date it was adopted or last updated.', source: 'uk-topic' }),
      shared('policies_due_diligence', 'policy_applies_to', { label: 'Where the policy applies', hint: 'Tick all that apply.', source: 'good-practice',
        optionLabels: { 'Own operations': 'Own operations', 'Direct suppliers': 'Direct suppliers', 'Indirect suppliers': 'Indirect suppliers', 'Controlled entities': 'Subsidiaries and other organisations it controls' } }),
      shared('policies_due_diligence', 'supplier_terms', { label: 'Contracts or purchase terms that require suppliers to follow the policy', hint: '', source: 'good-practice', labelWhen: () => 'Contracts or purchase terms that require suppliers to follow the policy' }),
      shared('policies_due_diligence', 'responsible_role', { label: 'Who is accountable', hint: NO_NAMES, source: 'good-practice' }),
      shared('policies_due_diligence', 'policy_topics', { label: 'Topics the policies cover', hint: 'Tick those your policies address.', source: 'template' }),
      shared('policies_due_diligence', 'international_standards', { label: 'International standards the policies refer to', hint: 'Tick those that apply.', source: 'template' }),
      shared('policies_due_diligence', 'policy_communication', { label: 'How policies are communicated and enforced', hint: 'Within the organisation and to suppliers.', source: 'template' }),
    ],
  },
  {
    key: 'due_diligence', number: 5, title: 'Due diligence',
    actQuote: s54_5('c'), actStatus: 'may-include',
    mapsTo: 'Section 54(5)(c). The Act lists it as something a statement may include; the statutory guidance recommends covering it, including the approach to remediation.',
    plainTerms: 'The processes the organisation uses to find, prevent and deal with slavery and human trafficking in its business and supply chains, and what it does when it finds a case.',
    readersLookFor: 'A named process with an owner and a frequency, what it found during the year, and what was done for anyone affected.',
    context: [area(3)],
    fields: [
      shared('policies_due_diligence', 'due_diligence_description', { label: 'What the organisation did during the year', hint: 'Name the process, which role or team runs it (a job title, not a person’s name) and how often.', source: 'uk-topic' }),
      shared('policies_due_diligence', 'due_diligence_steps', { label: 'Due diligence steps taken', hint: 'The steps of the OECD due diligence guidance, which is voluntary. The Act does not require it.', source: 'good-practice' }),
      shared('policies_due_diligence', 'purchasing_practices', { label: 'Whether the organisation’s own purchasing practices could contribute to the risk', hint: 'For example prices, lead times and late changes to orders.', source: 'template' }),
      shared('remediation', 'instances_identified', { label: 'Were any cases of slavery or human trafficking identified during the financial year?', hint: '', source: 'good-practice' }),
      shared('remediation', 'remediation_taken', { label: 'Remediation measures were taken', hint: 'Not applicable only where no cases were identified.', source: 'good-practice' }),
      shared('remediation', 'remediation_description', { label: 'What was done', hint: 'For whom in general terms, and the outcome. Do not identify any person.', source: 'good-practice' }),
      shared('remediation', 'grievance_mechanism', { label: 'A channel for workers or others to report concerns', hint: '', source: 'good-practice' }),
      shared('remediation', 'grievance_description', { label: 'How the channel works', hint: 'Who can use it, how they are told about it, and who handles reports.', source: 'good-practice' }),
    ],
  },
  {
    key: 'risk', number: 6, title: 'Risk assessment and management',
    actQuote: s54_5('d'), actStatus: 'may-include',
    mapsTo: 'Section 54(5)(d). The Act lists it as something a statement may include; the statutory guidance recommends covering it.',
    plainTerms: 'Where in the business and supply chains slavery and human trafficking is most likely, and the steps taken to assess and manage that risk.',
    readersLookFor: 'Specific sectors, countries or goods identified as higher risk, why, and what was done about each.',
    context: [area(2)],
    fields: [
      shared('risks', 'risk_assessment_done', { label: 'The organisation assessed these risks during the year', hint: '', source: 'uk-topic' }),
      shared('risks', 'assessment_methods', { label: 'How the risks were assessed', hint: 'Tick all that apply.', source: 'good-practice' }),
      shared('risks', 'risk_areas', { label: 'Risk areas', hint: 'One row per area.', source: 'uk-topic' }),
      shared('risks', 'own_operations_risk', { label: 'Risks in the organisation’s own operations', hint: 'Including agency or temporary labour at its own sites.', source: 'good-practice' }),
      shared('risks', 'management_steps', { label: 'How the organisation managed the risks it found', hint: '', source: 'uk-topic' }),
      shared('risks', 'assessment_timing', { label: 'When the risk assessment was done, and how often it is updated', hint: 'For example "September 2025; reviewed every year".', source: 'template' }),
      shared('risks', 'assessment_role', { label: 'Role responsible for the risk assessment', hint: NO_NAMES, source: 'template' }),
      shared('risks', 'stakeholder_engagement', { label: 'Stakeholders engaged to identify risks', hint: 'For example workers, suppliers, trade unions or NGOs.', source: 'template' }),
    ],
  },
  {
    key: 'effectiveness', number: 7, title: 'Effectiveness',
    actQuote: s54_5('e'), actStatus: 'may-include',
    mapsTo: 'Section 54(5)(e). The Act lists it as something a statement may include, measured against performance indicators the organisation considers appropriate; the statutory guidance recommends covering it.',
    plainTerms: 'How the organisation knows whether its actions are working, and the performance indicators it uses to measure that.',
    readersLookFor: 'Indicators with figures for this year and last, who reviews them, and what changed as a result.',
    context: [area(5)],
    fields: [
      shared('effectiveness', 'assesses_effectiveness', { label: 'The organisation has a way of checking that its actions work', hint: '', source: 'uk-topic' }),
      shared('effectiveness', 'methods', { label: 'How effectiveness is checked', hint: 'Tick all that apply.', source: 'good-practice',
        optionLabels: {
          [canadaField('effectiveness', 'methods').options![0]]: 'A regular review or audit of policies and procedures',
          [canadaField('effectiveness', 'methods').options![1]]: 'Tracking key performance indicators',
          [canadaField('effectiveness', 'methods').options![2]]: 'An independent review or audit by an external organisation',
          [canadaField('effectiveness', 'methods').options![3]]: 'Working with suppliers to measure the effectiveness of their actions',
          Other: 'Other',
        } }),
      shared('effectiveness', 'indicators', { label: 'Performance indicators tracked', hint: 'For example the share of suppliers that signed the code, or audits completed.', source: 'uk-topic' }),
      shared('effectiveness', 'effectiveness_description', { label: 'How the checks are done, by whom and how often', hint: NO_NAMES, source: 'uk-topic' }),
      shared('effectiveness', 'goal_horizons', { label: 'What you mean by short, medium and long term', hint: 'For example within one year, one to three years, beyond three years.', source: 'good-practice' }),
      shared('effectiveness', 'goals_short_term', { label: 'Short-term goals', hint: 'With dates.', source: 'good-practice' }),
      shared('effectiveness', 'goals_medium_term', { label: 'Medium-term goals', hint: 'With dates.', source: 'good-practice' }),
      shared('effectiveness', 'goals_long_term', { label: 'Long-term goals', hint: '', source: 'good-practice' }),
      shared('effectiveness', 'progress_since_last_report', { label: 'Progress against the goals in the last statement', hint: 'Leave blank for a first statement.', source: 'good-practice' }),
      shared('effectiveness', 'findings_changed_practice', { label: 'How findings changed business practice', hint: 'For example a change to contracts or to how suppliers are chosen.', source: 'template' }),
    ],
  },
  {
    key: 'training', number: 8, title: 'Training',
    actQuote: s54_5('f'), actStatus: 'may-include',
    mapsTo: 'Section 54(5)(f). The Act lists it as something a statement may include; the statutory guidance recommends covering it.',
    plainTerms: 'The training about slavery and human trafficking available to staff: who receives it, what it covers and how often.',
    readersLookFor: 'Which roles are trained, whether it is mandatory, what it covers, and how many people completed it.',
    context: [area(4)],
    fields: [
      shared('training', 'training_provided', { label: 'Training about slavery and human trafficking was available to staff during the year', hint: '', source: 'uk-topic' }),
      ukOnly('uk_training', { key: 'covers_slavery_trafficking', label: 'The training covers slavery and human trafficking', type: 'ynp', ukSource: 'good-practice',
        options: ['Yes', 'No', 'In progress'], hint: 'Asked for the UK statement only.' }),
      shared('training', 'mandatory', { label: 'Mandatory or optional', hint: '', source: 'good-practice' }),
      shared('training', 'audience', { label: 'Who received it', hint: 'Staff only.', source: 'good-practice' }),
      shared('training', 'covers', { label: 'What it covers', hint: '', source: 'good-practice',
        optionLabels: { 'Forced labour': 'Forced labour', 'Child labour': 'Child labour', 'Risks specific to the entity\'s sector': 'Risks specific to the organisation\u2019s sector' } }),
      shared('training', 'developed_by', { label: 'Who developed it', hint: '', source: 'good-practice' }),
      shared('training', 'developer_name', { label: 'Name of the external organisation that developed it', hint: 'An organisation, not a person.', source: 'template' }),
      shared('training', 'frequency_and_length', { label: 'Length and frequency', hint: 'For example "45 minutes, once a year".', source: 'good-practice' }),
      shared('training', 'employees_trained', { label: 'Staff who completed it during the year', hint: 'A count.', source: 'good-practice' }),
      shared('training', 'assessment', { label: 'The training ends with a test or other check', hint: '', source: 'good-practice' }),
      shared('training', 'training_description', { label: 'What the training covers, and how it is reviewed', hint: '', source: 'uk-topic' }),
    ],
  },
  {
    key: 'approval', number: 9, title: 'Approval and signing',
    actQuote: { lines: letteredLines(UK_MSA_S54_6), ref: `${ACT_REF}, s.54(6)` },
    actStatus: 'requires',
    mapsTo: 'Section 54(6): who must approve the statement and who must sign it, by kind of organisation.',
    plainTerms: 'Choose the kind of organisation giving the statement. The Act then says who approves it and who signs it: for a company or other body corporate, the board approves and a director (or equivalent) signs; for an LLP, the members approve and a designated member signs; for a limited partnership, a general partner signs; for any other partnership, a partner signs.',
    readersLookFor: 'A clear statement that the right body approved the statement, with the date, and the name and position of the person who signed it.',
    context: [guidance(UK_GUIDANCE_APPROVAL), guidance(UK_GUIDANCE_APPROVAL_DATE),
      { lines: [UK_GOVUK_APPROVAL_STATEMENT], ref: GOVUK_REF }, { lines: [UK_GOVUK_SIGN_OFF], ref: GOVUK_REF }],
    fields: [
      ukOnly('uk_approval', { key: 'org_type', label: 'What kind of organisation is giving the statement?', type: 'choice', ukSource: 'act', required: true,
        options: UK_ORG_TYPES.map(o => o.value), optionLabels: Object.fromEntries(UK_ORG_TYPES.map(o => [o.value, o.label])),
        hint: 'Section 54(6) sets who approves and who signs for each.' }),
      ukOnly('uk_approval', { key: 'approving_body', label: 'The board that approved the statement', type: 'text', ukSource: 'act',
        required: c => isBoard(c.org_type), showWhen: c => isBoard(c.org_type),
        hint: 'The board of directors, or the equivalent management body, as it is named (for example "Board of Directors").' }),
      ukOnly('uk_approval', { key: 'approval_date', label: 'Date of approval', type: 'date', ukSource: 'good-practice',
        showWhen: c => isBoard(c.org_type) || c.org_type === 'llp',
        hint: 'The statutory guidance calls including it best practice; the Act does not require it.' }),
      ukOnly('uk_approval', { key: 'signer_name', label: 'Full name of the person signing', type: 'text', ukSource: 'act', required: true, showWhen: c => !!c.org_type,
        hint: 'GOV.UK: include their name, job title and the date.' }),
      ukOnly('uk_approval', { key: 'signer_title', label: 'Their position', type: 'text', ukSource: 'act', required: true, showWhen: c => !!c.org_type,
        hint: 'For example "Director" or "Designated Member".' }),
      ukOnly('uk_approval', { key: 'signed_date', label: 'Date of signing', type: 'date', ukSource: 'good-practice', showWhen: c => !!c.org_type,
        hint: 'GOV.UK asks for the date. No physical signature is needed, but the statement should say clearly that it has been signed.' }),
      ukOnly('uk_approval', { key: 'signer_capacity', label: 'The person signing holds the role the Act requires', type: 'confirm', ukSource: 'act', required: true,
        showWhen: c => !!c.org_type, labelWhen: c => `The person signing is ${UK_SIGNER_ROLE[(c.org_type as UkOrgType)] ?? 'the person the Act requires'} of the organisation giving the statement`,
        hint: '' }),
      ukOnly('uk_approval', { key: 'signer_on_board', label: 'The director signing sits on the board that approved the statement', type: 'confirm', ukSource: 'good-practice',
        showWhen: c => isBoard(c.org_type), hint: 'Best practice in the statutory guidance.' }),
      ukOnly('uk_approval', { key: 'group_approvals', label: 'Approval by each other organisation the statement covers', type: 'rows', ukSource: 'good-practice',
        columns: [{ key: 'organisation', label: 'Organisation' }, { key: 'approved_by', label: 'Approved by' }, { key: 'approval_date', label: 'Date of approval' },
          { key: 'signer_name', label: 'Signed by' }, { key: 'signer_title', label: 'Their position' }],
        hint: 'For a group statement only. Whether each organisation\u2019s own board must approve it is an open question (see above).' }),
    ],
  },
]

export const ukSectionDef = (k: UkSectionKey): UkSectionDef => UK_SECTIONS.find(s => s.key === k)!

// ── Key terms ───────────────────────────────────────────────────────────────────────────────────────
export const UK_KEY_TERMS: { term: string; quote: Quote; explanation: string }[] = [
  { term: 'Commercial organisation', quote: { lines: LI_LINES(UK_MSA_S54_12_COMMERCIAL_ORGANISATION), ref: `${ACT_REF}, s.54(12)` },
    explanation: 'A company or a partnership, wherever it was set up, that does business in any part of the United Kingdom.' },
  { term: 'Partnership', quote: { lines: LI_LINES(UK_MSA_S54_12_PARTNERSHIP), ref: `${ACT_REF}, s.54(12)` },
    explanation: 'Ordinary and limited partnerships under UK law, and firms of a similar character formed elsewhere.' },
  { term: 'Subsidiary undertaking', quote: { lines: [UK_REGS_1_2_B], ref: 'SI 2015/1833, reg. 1(2)(b)' },
    explanation: 'Turnover of subsidiaries counts towards the threshold. The Companies Act 2006 definition decides what a subsidiary undertaking is.' },
  { term: 'Turnover', quote: { lines: letteredLines(UK_REGS_3_2), ref: 'SI 2015/1833, reg. 3(2)' },
    explanation: 'Income from ordinary activities, after trade discounts, VAT and other taxes on it.' },
]
export const UK_KEY_TERMS_EXPLANATION_LABEL = 'Our explanation'

// ── The financial year a statement covers ──────────────────────────────────────────────────────────
const UK_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** A date as the UK writes it: 31 December 2025. */
export const ukDate = (iso: string): string => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${UK_MONTHS[m - 1]} ${y}` }
const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The financial year from the statement details: the override dates when both are given, otherwise the twelve
 * months ending on the year-end day and month in the year given. Null until there is enough to say.
 */
export function ukFinancialYear(c: SectionContent): { start: string; end: string; override: boolean } | null {
  const s = c.financial_year_start, e = c.financial_year_end
  if (typeof s === 'string' && typeof e === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(e)) return { start: s, end: e, override: true }
  const m = c.year_end_month, d = c.year_end_day, y = c.financial_year_ending
  if (typeof m !== 'number' || typeof d !== 'number' || typeof y !== 'number') return null
  const end = new Date(Date.UTC(y, m - 1, d))
  if (end.getUTCMonth() !== m - 1) return null
  const start = new Date(Date.UTC(y - 1, m - 1, d + 1))
  return { start: iso(start), end: iso(end), override: false }
}

