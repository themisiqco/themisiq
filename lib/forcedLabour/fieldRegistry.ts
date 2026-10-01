// lib/forcedLabour/fieldRegistry.ts
// Every answer the Forced Labour Reporting builder keeps, with the countries whose report uses it and where
// Canada stores it today. Stage C step 1 (1 Oct 2026). The shared model (fl_answers) and the Canada adapter
// read this; nothing renders it.
//
// ⚠️ A FIELD IS SHARED WHEN MORE THAN ONE COUNTRY USES IT, AND ONLY THEN. Shared answers live once, per
// field, in fl_answers; a field one country uses lives in that country's detail record. `storage()` derives
// it from `countries`, so the two cannot disagree.
//
// ⚠️ `countries` FOLLOWS THE STAGE A CROSSWALK, AND fieldRegistry.test.ts ENFORCES IT. A field in template
// area n may list a country only if lib/forcedLabour/requirementsMap.ts CROSSWALK row n cites that country.
// So the UK is never on an area 7 field (s.54(5) has nothing there), and Australia never on Canada's loss
// of income section (s.11(3)(e), Canada-only). A field the crosswalk would allow can still be Canada-only:
// `controlled_entities` follows each Canadian section's own guidance, and Australia's s.16(1) reaches owned
// or controlled entities only in (c) and (d).
//
// ⚠️ EVERY CANADIAN FIELD IS HERE, AND NOTHING ELSE CLAIMS TO BE CANADIAN. The test walks
// lib/s211/builderContent.ts SECTIONS, the hidden keys the builder writes, and the s211_reports columns in
// the migration, both ways. A new Canadian field fails the test until it is placed.
//
// Keys are `<canadian section>.<field>` for anything Canada stores in a section, `report.<column>` for an
// s211_reports column, so they are unique and say where the answer came from. UK and Australia fields join
// when their builders are written (Stage C steps 5 and 6).

import type { SectionKey } from '../s211/builderContent'

export type CountryKey = 'canada' | 'uk' | 'australia'
const ALL: readonly CountryKey[] = ['canada', 'uk', 'australia']
const CA: readonly CountryKey[] = ['canada']
const CA_UK: readonly CountryKey[] = ['canada', 'uk']
const CA_AU: readonly CountryKey[] = ['canada', 'australia']

/** A template area (1 to 7), or what sits outside them. */
export type Area = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 'identity' | 'period' | 'applicability' | 'report' | 'steps' | 'approval'

/** Where Canada keeps the answer today. */
export type CanadaHome =
  | { kind: 'section'; section: SectionKey; field: string; hidden?: true }
  | { kind: 'column'; column: string }

export type RegistryField = {
  key: string
  countries: readonly CountryKey[]
  area: Area
  canada: CanadaHome | null
  note?: string
  /**
   * The answer this field gives, across countries, when each country keeps its own (Stage D1b): the Canada
   * key of the question. Fields with the same concept are each other's draft source (lib/forcedLabour/drafts.ts).
   */
  concept?: string
}

export const storage = (f: RegistryField): 'shared' | 'country' => (f.countries.length > 1 ? 'shared' : 'country')

const sec = (section: SectionKey, area: Area, countries: readonly CountryKey[], fields: string[], note?: string): RegistryField[] =>
  fields.map(field => ({ key: `${section}.${field}`, countries, area, canada: { kind: 'section', section, field }, ...(note ? { note } : {}) }))
const hidden = (section: SectionKey, field: string, area: Area, note: string): RegistryField =>
  ({ key: `${section}.${field}`, countries: CA, area, canada: { kind: 'section', section, field, hidden: true }, note })
const col = (column: string, area: Area, countries: readonly CountryKey[], note?: string): RegistryField =>
  ({ key: `report.${column}`, countries, area, canada: { kind: 'column', column }, ...(note ? { note } : {}) })

const CANADA_AS_LISTED: readonly RegistryField[] = [
  // ── s211_reports columns ──
  col('company_name', 'identity', ALL, 'The organization’s name: fl_reports.organization_name.'),
  col('reporting_year', 'report', CA, 'Canada’s report year (due May 31 of it). UK and Australia work from the period.'),
  col('financial_year_end', 'period', ALL, 'The period end: fl_reports.period_end.'),
  ...['listed_in_canada', 'place_of_business_in_canada', 'does_business_in_canada', 'has_assets_in_canada']
    .map(c => col(c, 'applicability', CA)),
  ...['assets', 'revenue', 'avg_employees', 'currency'].flatMap(m => ['recent', 'prior'].map(y =>
    col(`${y}_fy_${m}`, 'applicability', CA, m === 'revenue' || m === 'currency'
      ? 'Canada’s own measure and currency. Each country asks for its own; the organization’s shared figure only pre-fills an estimate.'
      : undefined))),
  col('status', 'report', CA, 'Canada report status. Each country has its own in fl_report_countries.'),

  // ── 1. report_details ──
  ...sec('report_details', 'identity', ALL, ['legal_name', 'joint_entities'], 'Stored in fl_answers as Canada keeps them (Canada adapter, 1 Oct 2026). fl_report_entities, with each country\u2019s reporting entities marked, is filled from them when a second country needs it.'),
  ...sec('report_details', 'period', ALL, ['year_end_month', 'year_end_day', 'financial_year_start', 'financial_year_end'], 'Stored in fl_answers as Canada keeps them (year-end month and day, or the override dates). fl_reports.period_start / period_end are derived from them when a second country needs a period.'),
  ...sec('report_details', 'period', CA, ['financial_year_confirmed'], 'Confirms the year Canada’s May 31 rule derives (deriveFinancialYear).'),
  ...sec('report_details', 'report', CA, ['report_type'], 'Canada s.11(2). Australia (s.13/s.14) and the UK (group statement) each ask their own.'),
  ...sec('report_details', 'report', CA, ['is_revised', 'revision_date', 'revision_changes'], 'Canada s.12.'),
  ...sec('report_details', 'report', CA, ['other_jurisdictions'], 'Canada only today. Later read from the report’s countries.'),
  hidden('report_details', '_applicability', 'applicability', 'The s.9 goods answers (lib/s211/applicability.ts formToActivities).'),

  // ── 2. structure_activities_supply_chains: area 1 ──
  ...sec('structure_activities_supply_chains', 1, ALL, [
    'legal_form', 'structure_description', 'goods_description', 'operating_countries', 'supply_chain_description',
    'supply_chain_visibility', 'source_countries', 'unknowns', 'information_gathering', 'changes_since_last_report']),
  ...sec('structure_activities_supply_chains', 1, CA, ['employees_canada', 'employees_outside_canada'], 'Split by Canada, as Canada’s guidance asks.'),
  ...sec('structure_activities_supply_chains', 1, CA, ['activities'], 'Producing, selling, distributing, importing into Canada: the s.9 activities.'),

  // ── 3. policies_due_diligence: areas 2 and 4 ──
  ...sec('policies_due_diligence', 2, ALL, [
    'has_policy', 'policy_list', 'policy_applies_to', 'supplier_terms', 'responsible_role', 'policy_topics',
    'international_standards', 'policy_communication']),
  ...sec('policies_due_diligence', 4, ALL, ['due_diligence_steps', 'due_diligence_description', 'purchasing_practices']),
  ...sec('policies_due_diligence', 2, CA_AU, ['controlled_entities'], 'Australia s.16(1)(d) reaches entities owned or controlled.'),

  // ── 4. risks: area 3 ──
  ...sec('risks', 3, ALL, [
    'risk_assessment_done', 'assessment_methods', 'risk_areas', 'own_operations_risk', 'management_steps',
    'assessment_timing', 'assessment_role', 'stakeholder_engagement']),
  ...sec('risks', 3, CA_AU, ['controlled_entities'], 'Australia s.16(1)(c) reaches entities owned or controlled.'),

  // ── 5. remediation: area 4 ──
  ...sec('remediation', 4, ALL, ['instances_identified', 'remediation_taken', 'remediation_description', 'grievance_mechanism', 'grievance_description']),
  ...sec('remediation', 4, CA_AU, ['controlled_entities'], 'Australia s.16(1)(d).'),

  // ── 6. remediation_income_loss: area 4, Canada s.11(3)(e) only ──
  ...sec('remediation_income_loss', 4, CA, ['measures_caused_loss', 'income_remediation_taken', 'income_remediation_description', 'controlled_entities']),

  // ── 7. training: area 5 ──
  ...sec('training', 5, ALL, [
    'training_provided', 'mandatory', 'audience', 'covers', 'developed_by', 'developer_name', 'frequency_and_length',
    'employees_trained', 'assessment', 'training_description']),
  ...sec('training', 5, CA_AU, ['controlled_entities'], 'Australia s.16(1)(d): training is an example of an action.'),

  // ── 8. effectiveness: area 6 ──
  ...sec('effectiveness', 6, ALL, [
    'assesses_effectiveness', 'methods', 'indicators', 'effectiveness_description', 'goal_horizons', 'goals_short_term',
    'goals_medium_term', 'goals_long_term', 'progress_since_last_report', 'findings_changed_practice']),
  ...sec('effectiveness', 6, CA, ['controlled_entities'], 'Canada’s guidance; Australia s.16(1)(e) does not name controlled entities.'),

  // ── 9. steps_taken: Canada s.11(1) and UK s.54(4) ──
  ...sec('steps_taken', 'steps', CA_UK, ['steps_summary', 'scope_of_actions', 'governance', 'external_engagement'],
    'The steps taken: Canada s.11(1), UK s.54(4), the only content the UK requires.'),
  ...sec('steps_taken', 'steps', CA, ['controlled_entities']),
  hidden('steps_taken', 'steps_checklist', 'steps', 'The checklist the summary draft was built from (lib/s211/stepsSummary.ts).'),
  hidden('steps_taken', '_built_summary', 'steps', 'The draft as built, to tell an edited summary from a built one.'),
  hidden('steps_taken', '_built_from', 'steps', 'Fingerprint of the answers the draft was built from (stepsFingerprint).'),
  hidden('steps_taken', '_built_texts', 'steps', 'The text for each checklist item.'),

  // ── 10. other_information: area 7, Australia s.16(1)(g) ──
  ...sec('other_information', 7, CA_AU, ['has_other_information', 'other_description', 'challenges', 'steps_planned_next', 'links']),

  // ── 11. approval_attestation: each country has its own ──
  ...sec('approval_attestation', 'approval', CA, [
    'governing_body', 'approval_basis', 'approval_date', 'controlling_entity', 'signatory_name', 'signatory_title',
    'entity_signatories', 'attestation_text', 'authority_to_bind'], 'Canada s.11(4) and (5). Each country records its own approval.'),
  hidden('approval_attestation', '_attestation_built', 'approval', 'The attestation as built (lib/s211/attestation.ts).'),
]

// ── Per-country, not shared (Stage D1b, 1 Oct 2026) ─────────────────────────────────────────────────────
// Narrative answers whose meaning depends on the law's scope. Canada asks about forced labour and child
// labour; section 54 about slavery and human trafficking; Australia's Act about modern slavery. One answer
// cannot be right for all of them, so each country keeps its own, linked by `concept`. A country opening one
// with no answer yet starts from another country's as a draft, marked until the user edits or confirms it.
// Factual and structural answers (structure, supply chains, figures, process descriptions that do not depend
// on the scope) stay shared.
//   key (Canada's)                                   UK section     why it depends on the scope
export const PER_COUNTRY: readonly { key: string; ukSection: string | null; why: string }[] = [
  { key: 'policies_due_diligence.has_policy',              ukSection: 'policies',      why: 'Canada asks for a policy covering forced labour and child labour.' },
  { key: 'risks.risk_assessment_done',                     ukSection: 'risk',          why: '"These risks" are the law\u2019s risks.' },
  { key: 'risks.risk_areas',                               ukSection: 'risk',          why: 'Why each area carries a risk, and what was done, is about the law\u2019s risk.' },
  { key: 'risks.own_operations_risk',                      ukSection: 'risk',          why: 'A risk description.' },
  { key: 'risks.management_steps',                         ukSection: 'risk',          why: 'How the risks found were dealt with.' },
  { key: 'policies_due_diligence.due_diligence_description', ukSection: 'due_diligence', why: 'A due diligence narrative.' },
  { key: 'policies_due_diligence.purchasing_practices',    ukSection: 'due_diligence', why: 'Whether purchasing practices contribute to the law\u2019s risk.' },
  { key: 'remediation.instances_identified',               ukSection: 'due_diligence', why: 'Canada asks about instances of forced labour or child labour.' },
  { key: 'remediation.remediation_taken',                  ukSection: 'due_diligence', why: 'Remediation of those instances.' },
  { key: 'remediation.remediation_description',            ukSection: 'due_diligence', why: 'A remediation narrative.' },
  { key: 'training.training_provided',                     ukSection: 'training',      why: 'Canada asks about training on forced labour or child labour.' },
  { key: 'training.covers',                                ukSection: 'training',      why: 'Canada\u2019s options are forced labour and child labour.' },
  { key: 'training.training_description',                  ukSection: 'training',      why: 'Training content.' },
  { key: 'effectiveness.assesses_effectiveness',           ukSection: 'effectiveness', why: 'Whether the actions on the law\u2019s risk work.' },
  { key: 'effectiveness.effectiveness_description',        ukSection: 'effectiveness', why: 'An effectiveness narrative.' },
  { key: 'effectiveness.goals_short_term',                 ukSection: 'effectiveness', why: 'Goals on the law\u2019s risk.' },
  { key: 'effectiveness.goals_medium_term',                ukSection: 'effectiveness', why: 'Goals on the law\u2019s risk.' },
  { key: 'effectiveness.goals_long_term',                  ukSection: 'effectiveness', why: 'Goals on the law\u2019s risk.' },
  { key: 'effectiveness.progress_since_last_report',       ukSection: 'effectiveness', why: 'Progress against those goals.' },
  { key: 'effectiveness.findings_changed_practice',        ukSection: 'effectiveness', why: 'An effectiveness narrative.' },
  { key: 'steps_taken.steps_summary',                      ukSection: 'steps_taken',   why: 'Canada: steps on forced labour and child labour; s.54(4): on slavery and human trafficking.' },
  // The reporting entity and the entities covered: per country through fl_report_entities (Stage D1b), so a
  // UK subsidiary's statement and a Canadian parent's report can sit in one report. Canada keeps its own here.
  { key: 'report_details.legal_name',                      ukSection: null,            why: 'The entity giving each country\u2019s report can differ.' },
  { key: 'report_details.joint_entities',                  ukSection: null,            why: 'The entities each country\u2019s report covers can differ.' },
]
const PER_COUNTRY_KEYS = new Set(PER_COUNTRY.map(p => p.key))
const CANADA_AND_SHARED: readonly RegistryField[] = CANADA_AS_LISTED.map(f =>
  PER_COUNTRY_KEYS.has(f.key) ? { ...f, countries: CA, concept: PER_COUNTRY.find(p => p.key === f.key)!.ukSection ? f.key : undefined,
    note: `${f.note ? `${f.note} ` : ''}Per-country since Stage D1b: ${PER_COUNTRY.find(p => p.key === f.key)!.why}` } : f)
/** The UK's own answer to each per-country question, under its UK section. */
export const UK_PER_COUNTRY_FIELDS: readonly RegistryField[] = PER_COUNTRY.filter(p => p.ukSection).map(p => {
  const ca = CANADA_AS_LISTED.find(f => f.key === p.key)!
  return { key: `uk_${p.ukSection}.${p.key.split('.')[1]}`, countries: ['uk'] as const, area: ca.area, canada: null, concept: p.key, note: `The UK\u2019s own answer. ${p.why}` }
})

// ── UK-only (Stage D1, 1 Oct 2026). Kept in the UK record (fl_report_countries.content), never shared. ──
const ukOnly = (key: string, area: Area, note: string): RegistryField => ({ key, countries: ['uk'], area, canada: null, note })
/**
 * The organisation's own revenue, once, for the report as a whole. Not any law's measure: each country's check
 * asks for its own figure, and this only gives a starting estimate (converted at the dated rate in lib/fx.ts).
 * Canada keeps its own figures in its applicability answers, so Canada is not listed here.
 */
export const ORGANIZATION_FIELDS: readonly RegistryField[] = [
  { key: 'organization.revenue_amount', countries: ['uk', 'australia'], area: 'identity', canada: null, note: 'Revenue for the most recent financial year, as a plain number. A starting estimate only.' },
  { key: 'organization.revenue_currency', countries: ['uk', 'australia'], area: 'identity', canada: null, note: 'The currency of that figure (a code lib/fx.ts holds a rate for).' },
]

export const UK_ONLY_FIELDS: readonly RegistryField[] = [
  ukOnly('uk_statement_details.is_group_statement', 'identity', 'One statement for a parent and its subsidiaries (statutory guidance; the Act has no provision of its own).'),
  ukOnly('uk_statement_details.financial_year_ending', 'period', 'The year the financial year ended, with the shared year-end month and day.'),
  ukOnly('uk_steps_taken.statement_kind', 'steps', 'Section 54(4): the steps taken, or a statement that none were.'),
  ukOnly('uk_policies.covers_slavery_trafficking', 2, 'Whether the policy covers slavery and human trafficking, which the shared Canada question does not ask.'),
  ukOnly('uk_training.covers_slavery_trafficking', 5, 'Whether the training covers slavery and human trafficking, which the shared Canada question does not ask.'),
  // Approval and signing (Stage D2): section 54(6), by kind of organisation. Each country's approval is its own.
  ...['org_type', 'approving_body', 'approval_date', 'signer_name', 'signer_title', 'signed_date', 'signer_capacity', 'signer_on_board', 'group_approvals']
    .map(f => ukOnly(`uk_approval.${f}`, 'approval', 'Section 54(6) approval and signing, or the guidance\u2019s best practice on it.')),
]

/** Every field: Canada's (shared or not) and the UK's own. */
export const FIELD_REGISTRY: readonly RegistryField[] = [...CANADA_AND_SHARED, ...ORGANIZATION_FIELDS, ...UK_ONLY_FIELDS, ...UK_PER_COUNTRY_FIELDS]

/** Builder state that is never stored, so it has no registry entry. */
export const CANADA_UI_ONLY = ['fy_override'] as const

export const fieldByKey = (key: string): RegistryField | undefined => FIELD_REGISTRY.find(f => f.key === key)
export const fieldsFor = (country: CountryKey): RegistryField[] => FIELD_REGISTRY.filter(f => f.countries.includes(country))
export const sharedFields = (): RegistryField[] => FIELD_REGISTRY.filter(f => storage(f) === 'shared')
