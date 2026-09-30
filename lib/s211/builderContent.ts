// lib/s211/builderContent.ts
// The S-211 report builder's content: every section's title, the Act's words, the plain explanation,
// the prompts and the examples. Ported from scratch/s211-builder-content-draft.md as reviewed on
// 30 Sep 2026, with the curated optional template prompts added that day.
//
// ⚠️ QUOTATIONS COME FROM lib/s211/requirements.ts AND NOWHERE ELSE. Every Act or guidance sentence
// shown to a user is built from a constant there, each checked word for word against its source. This
// file writes only our own text: explanations, hints, examples, and the plain "nothing to report"
// sentences. Our text uses Canadian English; a quotation keeps its source's spelling.
//
// Source labels on prompts: 'act' (the Act requires it), 'guidance' (Public Safety Canada recommends
// it), 'template' (the optional International Reporting Template suggests it), 'good-practice' (our
// suggestion). A prompt is never presented as more than its label says.

import {
  S211_ACT_SECTION_11_1, S211_ACT_SECTION_11_2, S211_ACT_SECTION_11_3, S211_ACT_SECTION_11_4, S211_ACT_SECTION_11_5,
  S211_ACT_DEFINITION_FORCED_LABOUR, S211_ACT_DEFINITION_CHILD_LABOUR, S211_ACT_DEFINITION_ENTITY,
  S211_ACT_DEFINITION_GOVERNING_BODY, S211_GUIDANCE_SUPPLY_CHAIN, S211_GUIDANCE_DUE_DILIGENCE,
  S211_GUIDANCE_JOINT_REPORT, S211_GUIDANCE_PERSONAL_INFORMATION, S211_GUIDANCE_FINANCIAL_YEAR,
  S211_GUIDANCE_A, S211_GUIDANCE_B_OECD_STEPS, S211_GUIDANCE_B_OVERLAP, S211_GUIDANCE_C, S211_GUIDANCE_D,
  S211_GUIDANCE_E, S211_GUIDANCE_F, S211_GUIDANCE_G, S211_GUIDANCE_G_EXAMPLE_STEPS, S211_GUIDANCE_STEPS_EXAMPLES,
  S211_GUIDANCE_LINKS, S211_GUIDANCE_WIDER_ACTIONS, S211_GUIDANCE_CONCRETE_ACTIONS, S211_GUIDANCE_PROPER_SIGNATURE,
  S211_GUIDANCE_GOVERNING_BODY_CHOICE, S211_ATTESTATION_EXAMPLE, S211_ATTESTATION_INTRO, S211_ATTESTATION_SIGNATURE_BLOCK,
  S211_ATTESTATION_AUTHORITY, S211_ATTESTATION_MANDATORY, S211_GUIDANCE_STEPS_CONTROLLED, S211_GUIDANCE_B_CONTROLLED,
  S211_GUIDANCE_C_CONTROLLED, S211_GUIDANCE_D_CONTROLLED, S211_GUIDANCE_E_CONTROLLED, S211_GUIDANCE_F_CONTROLLED,
  S211_GUIDANCE_G_CONTROLLED,
} from './requirements'

// ── Keys ────────────────────────────────────────────────────────────────────────────────────────────
// The eleven keys, in report order. They are CHECKed in public.s211_report_sections.section_key
// (supabase/migrations/20260930_s211_report_sections.sql); a test holds the two lists together.
export const SECTION_KEYS = [
  'report_details',
  'structure_activities_supply_chains',
  'policies_due_diligence',
  'risks',
  'remediation',
  'remediation_income_loss',
  'training',
  'effectiveness',
  'steps_taken',
  'other_information',
  'approval_attestation',
] as const
export type SectionKey = typeof SECTION_KEYS[number]
export const isSectionKey = (k: unknown): k is SectionKey => typeof k === 'string' && (SECTION_KEYS as readonly string[]).includes(k)

// ── Types ───────────────────────────────────────────────────────────────────────────────────────────
export type Source = 'act' | 'guidance' | 'template' | 'good-practice'
export const SOURCE_LABEL: Record<Source, string> = {
  act: 'Required by the Act',
  guidance: 'Recommended by Public Safety Canada',
  template: 'Template, optional',
  'good-practice': 'Good practice',
}

export type SectionContent = Record<string, unknown>

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'date'
  | 'yn'        // Yes / No
  | 'ynp'       // Yes / No / In progress
  | 'choice'    // one of `options`
  | 'checklist' // any of `options`
  | 'list'      // a repeating list of short text
  | 'rows'      // a repeating list of rows with `columns`
  | 'confirm'   // a tick

export type Field = {
  key: string
  label: string
  type: FieldType
  hint: string
  source: Source
  options?: readonly string[]
  columns?: readonly { key: string; label: string }[]
  maxChars?: number
  /** Required to mark the section complete. A function makes it conditional on other answers. */
  required?: boolean | ((c: SectionContent) => boolean)
  /** A "nothing to report" sentence stands in for this field. */
  waivedByNothingToReport?: boolean
  /** Shown only when this returns true. */
  showWhen?: (c: SectionContent) => boolean
}

export type Quote = { lines: string[]; ref: string }

export type SectionDef = {
  key: SectionKey
  number: number
  title: string
  /** The Act's words for this section, with its lettering. null for section 10, which the Act does not ask for. */
  actQuote: Quote | null
  /** Where the section maps, in one line. */
  mapsTo: string
  plainTerms: string
  readersLookFor: string
  /** Verbatim guidance shown beside the prompts, each with its source. */
  context: Quote[]
  fields: Field[]
  /** Under (b) to (g) and the steps requirement: the guidance's sentence on controlled entities. */
  controlledEntities: string | null
  strongExample: string
  weakExample: string
  weakWhy: string
  /** The plain sentence "Nothing to report this year?" fills in. null where the section cannot be empty. */
  nothingToReport: string | null
  nothingToReportNote: string | null
  characterGuidance: string
  /** Section 10 only: the report may leave it out. */
  optional?: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────
type Lettered = { leadIn: string; paragraphs: readonly { letter: string; text: string; sub?: readonly { numeral: string; text: string }[] }[] }
/** A lettered provision as printed lines: the lead-in, then "(a) ...", "(i) ...". */
export const letteredLines = (p: Lettered): string[] => [
  p.leadIn,
  ...p.paragraphs.flatMap(x => [`(${x.letter}) ${x.text}`, ...(x.sub ?? []).map(s => `(${s.numeral}) ${s.text}`)]),
]
const act = (lines: string[], ref: string): Quote => ({ lines, ref })
const guidance = (text: string): Quote => ({ lines: [text], ref: 'Public Safety Canada, Guidance for entities' })
const para = (letter: string) => S211_ACT_SECTION_11_3.paragraphs.find(p => p.letter === letter)!.text
const YNP = ['Yes', 'No', 'In progress'] as const
const controlledField = (max: number): Field => ({
  key: 'controlled_entities', label: 'Entities you control', type: 'textarea', maxChars: max, source: 'guidance',
  hint: 'If the reporting entity controls other entities, describe what they did too. Leave blank if it controls none.',
})
const NO_NAMES = 'Use a job title or committee name only. Do not name anyone.'

// ── Key terms ───────────────────────────────────────────────────────────────────────────────────────
export type KeyTerm = { term: string; quote: Quote; explanation: string }
export const KEY_TERMS: KeyTerm[] = [
  { term: 'forced labour', quote: act(letteredLines(S211_ACT_DEFINITION_FORCED_LABOUR), 'Act, s.2'),
    explanation: 'Work that a person does because they fear for their own safety or the safety of someone close to them, or that meets the international definition of forced labour.' },
  { term: 'child labour', quote: act(letteredLines(S211_ACT_DEFINITION_CHILD_LABOUR), 'Act, s.2'),
    explanation: 'Work by anyone under 18 that breaks Canadian law, is dangerous to them, gets in the way of their schooling, or is one of the worst forms of child labour in international law. Not all work by people under 18 is child labour under the Act.' },
  { term: 'entity', quote: act(letteredLines(S211_ACT_DEFINITION_ENTITY), 'Act, s.2'),
    explanation: 'An organization the Act covers, either because it is listed in Canada or because it has a presence in Canada and meets two of the three size tests. Being an entity is not the same as having to report: that also depends on what the entity does with goods (s.9).' },
  { term: 'supply chain', quote: guidance(S211_GUIDANCE_SUPPLY_CHAIN),
    explanation: 'Everyone who supplies the goods and materials behind what the entity sells, all the way back to raw materials, but not its customers.' },
  { term: 'due diligence', quote: guidance(S211_GUIDANCE_DUE_DILIGENCE),
    explanation: 'The regular work of looking for problems such as forced labour in the business and its supply chain, and acting on what is found.' },
  { term: 'governing body', quote: act([S211_ACT_DEFINITION_GOVERNING_BODY], 'Act, s.2'),
    explanation: 'Usually the board of directors. It is the body that must approve the report.' },
]
export const KEY_TERMS_EXPLANATION_LABEL = 'Our explanation'

// ── Warnings ────────────────────────────────────────────────────────────────────────────────────────
export const PERSONAL_INFORMATION_WARNING = {
  quotes: [S211_GUIDANCE_PERSONAL_INFORMATION[0], S211_GUIDANCE_PERSONAL_INFORMATION[1]],
  ours: 'Do not name or identify any person anywhere in this report, except the member of the governing body who signs the attestation in section 11. That includes employees, workers, suppliers\' staff and anyone involved in a complaint.',
}

// ── The sections ────────────────────────────────────────────────────────────────────────────────────
export const SECTIONS: readonly SectionDef[] = [
  {
    key: 'report_details', number: 1, title: 'Reporting entity and report details',
    actQuote: act(letteredLines(S211_ACT_SECTION_11_2), 'Act, s.11(2)'),
    mapsTo: 'Act s.11(2). Template: administrative reporting requirements.',
    plainTerms: 'This section says who the report is from and which year it covers. A report can cover one entity, or several entities in the same group (a joint report). The reporting year is the entity\'s previous financial year.',
    readersLookFor: 'Public Safety Canada matches the report to the entity\'s questionnaire, so the legal name and financial year must agree with it. Reviewers and investors check that a joint report names every entity it covers.',
    context: [guidance(S211_GUIDANCE_FINANCIAL_YEAR), guidance(S211_GUIDANCE_JOINT_REPORT[1]), guidance(S211_GUIDANCE_JOINT_REPORT[3])],
    fields: [
      { key: 'legal_name', label: 'Legal name of the reporting entity', type: 'text', source: 'guidance', required: true,
        hint: 'The full legal name, as registered.' },
      { key: 'year_end_month', label: 'Financial year end: month', type: 'number', source: 'good-practice', required: true,
        hint: 'A number from 1 to 12. The builder works out the financial year the report covers.' },
      { key: 'year_end_day', label: 'Financial year end: day', type: 'number', source: 'good-practice', required: true,
        hint: 'A number from 1 to 31.' },
      { key: 'financial_year_confirmed', label: 'I confirm the financial year shown above', type: 'confirm', source: 'good-practice', required: true,
        hint: 'Check the dates before confirming. Correct them below if they are wrong.' },
      { key: 'financial_year_start', label: 'Financial year start (if different)', type: 'date', source: 'good-practice',
        hint: 'Fill in only if the dates shown are not right for this report.' },
      { key: 'financial_year_end', label: 'Financial year end (if different)', type: 'date', source: 'good-practice',
        hint: 'Fill in only if the dates shown are not right for this report.' },
      { key: 'report_type', label: 'Single or joint report', type: 'choice', options: ['single', 'joint'], source: 'act', required: true,
        hint: 'Choose joint only if the information applies to every entity covered.' },
      { key: 'joint_entities', label: 'Legal name of each entity covered', type: 'list', source: 'guidance',
        required: c => c.report_type === 'joint', showWhen: c => c.report_type === 'joint',
        hint: 'One legal name per line, including the reporting entity.' },
      { key: 'is_revised', label: 'Is this a revised report?', type: 'yn', source: 'act',
        hint: 'Yes only if a report for this year was already submitted and this one replaces it.' },
      { key: 'revision_date', label: 'Date of the revision', type: 'date', source: 'act',
        required: c => c.is_revised === 'Yes', showWhen: c => c.is_revised === 'Yes',
        hint: 'Required by s.12(2) for a revised report.' },
      { key: 'revision_changes', label: 'What changed from the original report', type: 'textarea', maxChars: 600, source: 'act',
        required: c => c.is_revised === 'Yes', showWhen: c => c.is_revised === 'Yes',
        hint: 'Required by s.12(2) for a revised report.' },
      { key: 'other_jurisdictions', label: 'Does the entity also report under these laws?', type: 'checklist', source: 'guidance',
        options: ['UK Modern Slavery Act 2015', 'Australia Modern Slavery Act 2018', 'Other', 'None'],
        hint: 'The questionnaire asks this. It is not a report requirement.' },
    ],
    controlledEntities: null,
    strongExample: 'Legal name: Harrowgate Outdoor Equipment Inc. Financial year: January 1, 2025 to December 31, 2025. Joint report covering Harrowgate Outdoor Equipment Inc. and its subsidiary Harrowgate Retail Ltd. Not a revised report.',
    weakExample: '"Harrowgate Group", 2025.',
    weakWhy: 'A trading name is not a legal name, the year has no dates, and a reader cannot tell which entities are covered.',
    nothingToReport: null, nothingToReportNote: null,
    characterGuidance: 'Names and dates only. No narrative.',
  },
  {
    key: 'structure_activities_supply_chains', number: 2, title: 'Structure, activities and supply chains',
    actQuote: act([para('a')], 'Act, s.11(3)(a)'),
    mapsTo: 'Act s.11(3)(a). Template area 1.',
    plainTerms: 'Describe what the entity is, what it does with goods, and where those goods and their inputs come from. This sets the scene for everything else: a reader cannot judge the entity\'s risks without knowing what it makes or imports and from where.',
    readersLookFor: 'The legal form and size of the entity, the goods it produces or imports, the countries involved, and how far down the supply chain the entity can see. Reviewers notice when a report describes the business but says nothing about suppliers.',
    context: [guidance(S211_GUIDANCE_SUPPLY_CHAIN), guidance(S211_GUIDANCE_A[3])],
    fields: [
      { key: 'legal_form', label: 'Legal form', type: 'choice', source: 'guidance', required: true,
        options: ['Corporation', 'Trust', 'Partnership', 'Other unincorporated organization'], hint: 'How the entity is organized in law.' },
      { key: 'structure_description', label: 'Structure', type: 'textarea', maxChars: 1200, source: 'act', required: true,
        hint: 'Ownership, main business units, and any entities the entity controls, with what they do and where.' },
      { key: 'employees_canada', label: 'Employees in Canada', type: 'number', source: 'guidance', hint: 'A count only. No names.' },
      { key: 'employees_outside_canada', label: 'Employees outside Canada', type: 'number', source: 'guidance', hint: 'A count only. No names.' },
      { key: 'activities', label: 'What the entity does with goods', type: 'checklist', source: 'act', required: true,
        options: ['Producing goods in Canada', 'Producing goods outside Canada', 'Selling goods', 'Distributing goods', 'Importing goods into Canada', 'Controlling an entity that does any of these'],
        hint: 'Tick all that apply. These are the activities in s.9 of the Act.' },
      { key: 'goods_description', label: 'Goods', type: 'textarea', maxChars: 1000, source: 'act',
        hint: 'The kinds of goods produced or imported, and rough volumes if known.' },
      { key: 'operating_countries', label: 'Countries or regions of operation', type: 'list', source: 'guidance', hint: 'One per line.' },
      { key: 'supply_chain_description', label: 'Supply chain', type: 'textarea', maxChars: 1500, source: 'act', required: true,
        hint: 'Main goods and inputs bought, the countries they come from, and the number of direct suppliers.' },
      { key: 'supply_chain_visibility', label: 'How far down the supply chain the entity can see', type: 'choice', source: 'good-practice',
        options: ['Direct suppliers only', 'Direct and some indirect suppliers', 'Mapped to raw materials for main products', 'Not mapped'], hint: 'Choose the closest.' },
      { key: 'source_countries', label: 'Source countries or regions of the goods', type: 'list', source: 'guidance',
        hint: 'Recommended by the guidance, not required. One per line.' },
      { key: 'unknowns', label: 'What the entity does not yet know about its supply chain', type: 'textarea', maxChars: 800, source: 'template',
        hint: 'For example, the tiers below direct suppliers that have not been mapped.' },
      { key: 'information_gathering', label: 'How the information in this report was gathered', type: 'textarea', maxChars: 600, source: 'template',
        hint: 'For example, which teams contributed and what records were used.' },
      { key: 'changes_since_last_report', label: 'What changed since the last report', type: 'textarea', maxChars: 600, source: 'template',
        hint: 'Leave blank for a first report.' },
    ],
    controlledEntities: null,
    strongExample: 'Harrowgate Outdoor Equipment Inc. is a privately held corporation based in Alberta with 310 employees in Canada and 40 in the United States. We design camping equipment and import finished goods into Canada. We do not manufacture. In 2025 we bought from 46 direct suppliers in Vietnam, China, Taiwan and Canada. Tents and sleeping bags made in Vietnam were about 60% of our purchases by value. We know the factories that make our finished goods. We do not yet know the mills that supply their fabric, and we describe our plan to map them in section 8.',
    weakExample: 'We are a leading outdoor brand with a global supply chain and long-standing supplier relationships.',
    weakWhy: 'It names no goods, no countries and no number of suppliers, and it says nothing about how far the entity can see.',
    nothingToReport: null,
    nothingToReportNote: 'Every entity has a structure and activities, so this section cannot be empty. If the supply chain has not been mapped, say so plainly: "We have not yet mapped our supply chain beyond our direct suppliers."',
    characterGuidance: '1,500 to 3,500 characters in total.',
  },
  {
    key: 'policies_due_diligence', number: 3, title: 'Policies and due diligence processes',
    actQuote: act([para('b')], 'Act, s.11(3)(b)'),
    mapsTo: 'Act s.11(3)(b). Template areas 2 and 4.',
    plainTerms: 'A policy is a written commitment, such as a supplier code of conduct. Due diligence is what the entity does to find and respond to problems in its operations and supply chain. The Act asks for both: what the entity has committed to, and what it actually does.',
    readersLookFor: 'Whether policies exist, who approved them, whether they reach suppliers, and whether anything checks that they are followed. A policy with no process behind it reads as a statement of intent.',
    context: [guidance(S211_GUIDANCE_DUE_DILIGENCE), guidance(S211_GUIDANCE_B_OVERLAP)],
    fields: [
      { key: 'has_policy', label: 'A written policy covering forced labour and child labour', type: 'ynp', options: YNP, source: 'act', required: true,
        hint: 'For example a supplier code of conduct or a responsible sourcing policy.' },
      { key: 'policy_list', label: 'Policies', type: 'rows', source: 'act',
        columns: [{ key: 'name', label: 'Policy' }, { key: 'year', label: 'Year adopted or last reviewed' }, { key: 'approved_by', label: 'Approved by (a body or role)' }],
        hint: 'One row per policy.' },
      { key: 'policy_applies_to', label: 'Where the policy applies', type: 'checklist', source: 'good-practice',
        options: ['Own operations', 'Direct suppliers', 'Indirect suppliers', 'Controlled entities'], hint: 'Tick all that apply.' },
      { key: 'supplier_terms', label: 'Contracts or purchase terms that require suppliers to follow the policy', type: 'ynp', options: YNP, source: 'good-practice', hint: '' },
      { key: 'due_diligence_steps', label: 'Due diligence steps taken (OECD Due Diligence Guidance, as the guidance lists them)', type: 'rows', source: 'guidance',
        columns: [{ key: 'step', label: 'Step' }, { key: 'status', label: 'Yes / No / In progress' }],
        hint: 'The OECD guidance is voluntary. The Act does not require an entity to follow it.' },
      { key: 'due_diligence_description', label: 'What the entity did in the year', type: 'textarea', maxChars: 1500, source: 'act', required: true, waivedByNothingToReport: true,
        hint: 'Name the process, who runs it and how often.' },
      { key: 'responsible_role', label: 'Who is accountable', type: 'text', source: 'guidance', hint: NO_NAMES },
      { key: 'policy_topics', label: 'Topics the policies cover', type: 'checklist', source: 'template',
        options: ['Worker-paid recruitment fees', 'Confiscation of identity documents', 'Freedom of movement', 'Compulsory overtime'], hint: 'Tick those your policies address.' },
      { key: 'international_standards', label: 'International standards the policies refer to', type: 'checklist', source: 'template',
        options: ['UN Guiding Principles on Business and Human Rights', 'OECD Due Diligence Guidance for Responsible Business Conduct', 'ILO labour standards'], hint: 'Tick those that apply.' },
      { key: 'policy_communication', label: 'How policies are communicated and enforced', type: 'textarea', maxChars: 800, source: 'template',
        hint: 'Inside the entity and to suppliers.' },
      { key: 'purchasing_practices', label: 'Whether your own purchasing practices could contribute to the risk', type: 'textarea', maxChars: 800, source: 'template',
        hint: 'For example prices, lead times and late changes to orders, which can push suppliers toward excessive overtime or unauthorized subcontracting.' },
      controlledField(800),
    ],
    controlledEntities: S211_GUIDANCE_B_CONTROLLED,
    strongExample: 'Our Supplier Code of Conduct, approved by the board in March 2024, prohibits forced labour and child labour and applies to all direct suppliers. It is part of our standard purchase terms, and 44 of our 46 direct suppliers had signed it by the end of 2025. Our sourcing team screens each new supplier before the first order and reviews existing suppliers once a year. The Vice-President, Operations is accountable and reports to the board\'s audit committee twice a year. We do not yet apply the code to indirect suppliers.',
    weakExample: 'We have zero tolerance for forced labour and expect all our partners to share our values.',
    weakWhy: 'It names no policy, no process and no one accountable, and "zero tolerance" describes an attitude, not an action.',
    nothingToReport: 'We did not have a policy on forced labour or child labour during the financial year, and we did not carry out due diligence on these risks.',
    nothingToReportNote: 'If work has started, add what and when. The guidance encourages entities to say where they are in developing their response.',
    characterGuidance: '1,200 to 3,000 characters.',
  },
  {
    key: 'risks', number: 4, title: 'Parts of the business and supply chains at risk, and the steps taken to assess and manage that risk',
    actQuote: act([para('c')], 'Act, s.11(3)(c)'),
    mapsTo: 'Act s.11(3)(c). Template area 3.',
    plainTerms: 'Say where forced labour or child labour could occur in the entity\'s own operations and its supply chain, and what the entity did to find out and respond. Naming a risk is not an admission that it has happened.',
    readersLookFor: 'Specific risks tied to specific goods, countries or supply chain steps, and the method used to find them. A report that says "we identified no risks" without saying how it looked is unlikely to be credible to a reader.',
    context: [guidance(S211_GUIDANCE_C[0]), guidance(S211_GUIDANCE_C[1]), guidance(S211_GUIDANCE_C[2]), guidance(S211_GUIDANCE_C[5])],
    fields: [
      { key: 'risk_assessment_done', label: 'The entity assessed these risks during the year', type: 'ynp', options: YNP, source: 'act', required: true, hint: '' },
      { key: 'assessment_methods', label: 'How the risks were assessed', type: 'checklist', source: 'guidance',
        options: ['Supply chain mapping', 'Risk assessment', 'Desk-based research', 'Audits', 'Supplier questionnaires', 'Engagement with trade unions or NGOs', 'Other'], hint: 'Tick all that apply.' },
      { key: 'risk_areas', label: 'Risk areas', type: 'rows', source: 'act',
        columns: [{ key: 'area', label: 'Area (a sector, country or region, good, or supply chain step)' }, { key: 'why', label: 'Why it carries a risk' }, { key: 'worker_groups', label: 'Worker groups affected (template, optional)' }, { key: 'action', label: 'What was done' }],
        hint: 'One row per risk area.' },
      { key: 'own_operations_risk', label: 'Risks in the entity\'s own operations', type: 'textarea', maxChars: 800, source: 'good-practice',
        hint: 'Including agency or temporary labour at the entity\'s own sites.' },
      { key: 'management_steps', label: 'How the entity dealt with the risks it found', type: 'textarea', maxChars: 1500, source: 'act', required: true, waivedByNothingToReport: true, hint: '' },
      { key: 'assessment_timing', label: 'When the risk assessment was done, and how often it is updated', type: 'text', source: 'template', hint: 'For example "September 2025; reviewed every year".' },
      { key: 'assessment_role', label: 'Role responsible for the risk assessment', type: 'text', source: 'template', hint: NO_NAMES },
      { key: 'stakeholder_engagement', label: 'Stakeholders engaged to identify risks', type: 'textarea', maxChars: 600, source: 'template',
        hint: 'For example workers, suppliers, trade unions or NGOs.' },
      controlledField(800),
    ],
    controlledEntities: S211_GUIDANCE_C_CONTROLLED,
    strongExample: 'In 2025 we assessed all 46 direct suppliers using a questionnaire and public country risk information. We identified two areas of higher risk: sewn goods from three factories in Vietnam that use labour agencies to recruit migrant workers, and cotton fabric whose origin we cannot yet trace. For the three factories we commissioned an independent audit in September 2025. It found recruitment fees charged to workers at one factory. We describe our response in section 5. For cotton, we asked our fabric suppliers to name their mills and received answers from four of seven.',
    weakExample: 'We have assessed our supply chain and consider the risk of forced labour to be low.',
    weakWhy: 'It gives no method and no reasoning, and "low" cannot be checked.',
    nothingToReport: 'We did not assess the risk of forced labour or child labour in our business or supply chains during the financial year.',
    nothingToReportNote: 'If an assessment was done and found no specific risk area, do not use this sentence: say what was assessed and how. The guidance says no sector is assumed to be free of risk.',
    characterGuidance: '1,500 to 4,000 characters. One short paragraph per risk area.',
  },
  {
    key: 'remediation', number: 5, title: 'Measures taken to remediate forced labour or child labour',
    actQuote: act([para('d')], 'Act, s.11(3)(d)'),
    mapsTo: 'Act s.11(3)(d). Template area 4.',
    plainTerms: 'Remediation means putting right harm that has happened. If the entity found forced labour or child labour in its operations or supply chain, this section says what it did for the people affected. It also covers the channels through which a problem can be reported.',
    readersLookFor: 'Whether there is a way to raise a concern, whether anyone has used it, and what happened next. Readers look for what changed for the workers affected, not only for whether a supplier was dropped.',
    context: [guidance(S211_GUIDANCE_D[0]), guidance(S211_GUIDANCE_D[2]), guidance(S211_GUIDANCE_D[3]), guidance(S211_GUIDANCE_D[4])],
    fields: [
      { key: 'instances_identified', label: 'Were instances of forced labour or child labour identified?', type: 'choice', source: 'act', required: true,
        options: ['Yes, instances were identified', 'No instances were identified', 'Not assessed'], hint: 'For the financial year.' },
      { key: 'remediation_taken', label: 'Remediation measures were taken', type: 'choice', options: ['Yes', 'No', 'Not applicable'], source: 'act', required: true,
        hint: 'Not applicable only where no instances were identified.' },
      { key: 'remediation_description', label: 'What was done', type: 'textarea', maxChars: 1500, source: 'act',
        required: c => c.remediation_taken === 'Yes', waivedByNothingToReport: true,
        hint: 'For whom in general terms, and the outcome. Do not identify any person.' },
      { key: 'grievance_mechanism', label: 'A channel for workers or others to report concerns', type: 'ynp', options: YNP, source: 'guidance', hint: '' },
      { key: 'grievance_description', label: 'How the channel works', type: 'textarea', maxChars: 800, source: 'guidance',
        hint: 'Who can use it, how they are told about it, and who handles reports.' },
      controlledField(800),
    ],
    controlledEntities: S211_GUIDANCE_D_CONTROLLED,
    strongExample: 'The September 2025 audit found that one factory\'s recruitment agent had charged fees to 38 migrant workers. We required the factory to repay the fees. An independent auditor confirmed in December 2025 that all 38 workers had been repaid. The factory now pays recruitment costs directly, and we re-audit it every six months. We stayed with the supplier because leaving would not have helped the workers. Workers at our suppliers can report concerns through a telephone line run by an independent provider in their own language. It received two reports in 2025, neither about forced labour or child labour.',
    weakExample: 'We would terminate any supplier found to be using forced labour.',
    weakWhy: 'It describes a future intention, not a measure taken, and ending a contract does nothing for the workers.',
    nothingToReport: 'We identified no instances of forced labour or child labour in our activities or supply chains during the financial year, so no remediation measures were taken.',
    nothingToReportNote: 'If instances were found but nothing was done, the guidance says it is sufficient to state that instead.',
    characterGuidance: '600 to 2,500 characters.',
  },
  {
    key: 'remediation_income_loss', number: 6, title: 'Measures taken to remediate the loss of income to the most vulnerable families',
    actQuote: act([para('e')], 'Act, s.11(3)(e)'),
    mapsTo: 'Act s.11(3)(e). Template area 4.',
    plainTerms: 'Steps to remove forced labour or child labour can leave a family with less income. For example, a child who stops working no longer brings in a wage. This section asks whether the entity\'s own measures caused that kind of loss, and what it did about it.',
    readersLookFor: 'That the entity understood the question. Many reports answer it with a general statement about fair wages, which is a different subject. Readers look for a clear yes or no, and the reasoning.',
    context: [guidance(S211_GUIDANCE_E[0]), guidance(S211_GUIDANCE_E[1])],
    fields: [
      { key: 'measures_caused_loss', label: 'Did any measure the entity took lead to a loss of income for families?', type: 'choice', source: 'act', required: true,
        options: ['Yes', 'No', 'Not assessed', 'Not applicable (no measures were taken to eliminate forced labour or child labour)'], hint: '' },
      { key: 'income_remediation_taken', label: 'Measures were taken to remediate the lost income', type: 'choice', options: ['Yes', 'No', 'Not applicable'], source: 'act',
        required: c => c.measures_caused_loss === 'Yes', hint: 'Not applicable where no loss of income was identified.' },
      { key: 'income_remediation_description', label: 'What was done', type: 'textarea', maxChars: 1200, source: 'act',
        required: c => c.income_remediation_taken === 'Yes', waivedByNothingToReport: true,
        hint: 'For which families in general terms, and the outcome. Do not identify any person.' },
      controlledField(600),
    ],
    controlledEntities: S211_GUIDANCE_E_CONTROLLED,
    strongExample: 'In 2025 one of our suppliers stopped employing 11 children below the legal minimum working age after our audit. With a local organization, the supplier paid school costs for those children and offered work to an adult member of each household. We paid half the cost for the first year and will review the arrangement in 2026.',
    weakExample: 'We pay fair wages to all our employees.',
    weakWhy: 'The section is about families who lost income because of a measure the entity took. It is not about the entity\'s own pay.',
    nothingToReport: 'We took no measures during the financial year that resulted in a loss of income to vulnerable families, so no remediation of lost income was needed.',
    nothingToReportNote: 'If the question was not assessed, say that instead: "We have not assessed whether our measures caused a loss of income to vulnerable families."',
    characterGuidance: '300 to 1,500 characters. A short, direct answer is enough here.',
  },
  {
    key: 'training', number: 7, title: 'Training provided to employees',
    actQuote: act([para('f')], 'Act, s.11(3)(f)'),
    mapsTo: 'Act s.11(3)(f). Template area 5.',
    plainTerms: 'Say what training the entity\'s own employees received on forced labour and child labour: who was trained, on what, and how often.',
    readersLookFor: 'Whether the people who choose and manage suppliers were trained, how many people completed the training, and whether it is repeated. A single mention of "awareness" with no numbers tells a reader little.',
    context: [guidance(S211_GUIDANCE_F[0]), guidance(S211_GUIDANCE_F[1])],
    fields: [
      { key: 'training_provided', label: 'Training on forced labour or child labour was given in the year', type: 'ynp', options: YNP, source: 'act', required: true, hint: '' },
      { key: 'mandatory', label: 'Mandatory or optional', type: 'choice', options: ['Mandatory', 'Optional', 'Mandatory for some roles'], source: 'guidance', hint: '' },
      { key: 'audience', label: 'Who received it', type: 'checklist', source: 'guidance',
        options: ['All employees', 'Procurement and sourcing', 'Senior management', 'Human resources', 'Other roles'], hint: 'Employees only.' },
      { key: 'covers', label: 'What it covers', type: 'checklist', options: ['Forced labour', 'Child labour', 'Risks specific to the entity\'s sector'], source: 'guidance', hint: '' },
      { key: 'developed_by', label: 'Who developed it', type: 'choice', options: ['Internally', 'External organization', 'Both'], source: 'guidance', hint: '' },
      { key: 'developer_name', label: 'Name of the external organization that developed it', type: 'text', source: 'template',
        hint: 'An organization, not a person.', showWhen: c => c.developed_by === 'External organization' || c.developed_by === 'Both' },
      { key: 'frequency_and_length', label: 'Length and frequency', type: 'text', source: 'guidance', hint: 'For example "45 minutes, once a year".' },
      { key: 'employees_trained', label: 'Employees who completed it in the year', type: 'number', source: 'guidance', hint: 'A count.' },
      { key: 'assessment', label: 'The training ends with a test or other check', type: 'yn', source: 'guidance', hint: '' },
      { key: 'training_description', label: 'What the training covers, and how it is reviewed', type: 'textarea', maxChars: 1200, source: 'act',
        required: c => c.training_provided === 'Yes', waivedByNothingToReport: true, hint: '' },
      controlledField(600),
    ],
    controlledEntities: S211_GUIDANCE_F_CONTROLLED,
    strongExample: 'All 14 members of our sourcing and quality teams completed a 90-minute course on recognizing forced labour and child labour in May 2025. An external organization wrote the course for the apparel and outdoor goods sector. It covers recruitment fees, withheld documents and age verification, and ends with a short test. New members of those teams take it within three months of joining. We have not yet trained other employees, and plan an online introduction for all staff in 2026.',
    weakExample: 'Our employees are made aware of our commitment to human rights.',
    weakWhy: 'It does not say who was trained, on what, for how long, or how many people completed it.',
    nothingToReport: 'We did not provide training to employees on forced labour or child labour during the financial year.',
    nothingToReportNote: null,
    characterGuidance: '500 to 1,800 characters.',
  },
  {
    key: 'effectiveness', number: 8, title: 'How the entity assesses its effectiveness',
    actQuote: act([para('g')], 'Act, s.11(3)(g)'),
    mapsTo: 'Act s.11(3)(g). Template area 6.',
    plainTerms: 'Say how the entity checks whether its actions are working. The Act asks about the method of checking, not the results.',
    readersLookFor: 'Measures that can be tracked from one year to the next, and goals with dates. Readers compare this section with last year\'s report to see whether the entity did what it said it would.',
    context: [guidance(S211_GUIDANCE_G[2]), guidance(S211_GUIDANCE_G[0])],
    fields: [
      { key: 'assesses_effectiveness', label: 'The entity has a way of checking that its actions work', type: 'ynp', options: YNP, source: 'act', required: true, hint: '' },
      { key: 'methods', label: 'How effectiveness is checked', type: 'checklist', source: 'guidance',
        options: [...S211_GUIDANCE_G_EXAMPLE_STEPS, 'Other'], hint: 'The guidance gives the first four as examples. The list is not exhaustive.' },
      { key: 'indicators', label: 'Indicators tracked', type: 'rows', source: 'guidance',
        columns: [{ key: 'indicator', label: 'Indicator' }, { key: 'this_year', label: 'This year' }, { key: 'last_year', label: 'Last year' }],
        hint: 'For example the share of suppliers that signed the code, or audits completed.' },
      { key: 'effectiveness_description', label: 'How the checks are done, by whom and how often', type: 'textarea', maxChars: 1200, source: 'act',
        required: c => c.assesses_effectiveness === 'Yes', waivedByNothingToReport: true, hint: NO_NAMES },
      { key: 'goal_horizons', label: 'What you mean by short, medium and long term', type: 'text', maxChars: 200, source: 'good-practice',
        hint: 'Say what you mean by short, medium and long term (for example: within one year, one to three years, beyond three years).' },
      { key: 'goals_short_term', label: 'Short-term goals', type: 'textarea', maxChars: 500, source: 'guidance', hint: 'With dates.' },
      { key: 'goals_medium_term', label: 'Medium-term goals', type: 'textarea', maxChars: 500, source: 'guidance', hint: 'With dates.' },
      { key: 'goals_long_term', label: 'Long-term goals', type: 'textarea', maxChars: 500, source: 'guidance', hint: '' },
      { key: 'progress_since_last_report', label: 'Progress against the goals in the last report', type: 'textarea', maxChars: 800, source: 'guidance',
        hint: 'Leave blank for a first report.' },
      { key: 'findings_changed_practice', label: 'How findings changed business practice', type: 'textarea', maxChars: 600, source: 'template',
        hint: 'For example a change to contracts or to how suppliers are chosen.' },
      controlledField(600),
    ],
    controlledEntities: S211_GUIDANCE_G_CONTROLLED,
    strongExample: 'We track four measures each quarter: the share of direct suppliers that have signed our code (96% in 2025, 81% in 2024), the number of supplier audits completed (9, up from 4), the share of sourcing staff trained (100%, up from 60%), and reports received through the worker telephone line (2, up from 0). The audit committee reviews these twice a year. Goal for 2026: every direct supplier signs the code. By 2028: name the fabric mill for every product. Longer term: independent audits at every higher-risk supplier every two years. Against our 2024 goals, we met the training goal and missed the code goal by two suppliers.',
    weakExample: 'We continually monitor and improve our approach.',
    weakWhy: 'It names no measure, no goal and no date, so nothing can be compared next year.',
    nothingToReport: 'We did not assess the effectiveness of our actions during the financial year.',
    nothingToReportNote: null,
    characterGuidance: '800 to 2,500 characters, plus the indicator table.',
  },
  {
    key: 'steps_taken', number: 9, title: 'Steps taken during the previous financial year to prevent and reduce the risk',
    actQuote: act([S211_ACT_SECTION_11_1], 'Act, s.11(1)'),
    mapsTo: 'Act s.11(1), the general requirement. The template\'s seven areas together cover it.',
    plainTerms: 'This is the core of the report: a clear account of what the entity did during the year. The other sections supply the detail. This one brings the actions together so a reader can see them in one place.',
    readersLookFor: 'A short list of concrete actions with dates, limited to the financial year. Public Safety Canada\'s questionnaire asks the same question first.',
    context: [guidance(S211_GUIDANCE_CONCRETE_ACTIONS)],
    fields: [
      { key: 'steps_summary', label: 'Summary of the steps taken', type: 'textarea', maxChars: 2000, source: 'act', required: true, waivedByNothingToReport: true,
        hint: 'Built from your answers in sections 3 to 8. Read and edit it before marking this section complete.' },
      { key: 'scope_of_actions', label: 'Scope of the actions', type: 'choice', source: 'guidance',
        options: ['Applied to the whole entity and supply chain', 'Applied to specific parts'], hint: S211_GUIDANCE_STEPS_EXAMPLES[0] },
      { key: 'governance', label: 'Who is responsible, and the senior oversight', type: 'textarea', maxChars: 600, source: 'guidance', hint: NO_NAMES },
      { key: 'external_engagement', label: 'Work with industry initiatives, NGOs, trade unions or government agencies', type: 'textarea', maxChars: 600, source: 'guidance', hint: 'Optional.' },
      controlledField(800),
    ],
    controlledEntities: S211_GUIDANCE_STEPS_CONTROLLED,
    strongExample: 'During 2025 we took five steps. We made our Supplier Code of Conduct part of our purchase terms, and 44 of 46 direct suppliers signed it. We assessed all direct suppliers for forced labour and child labour risk. We commissioned an independent audit of three higher-risk factories in Vietnam. We required one factory to repay recruitment fees to 38 workers and confirmed the repayment. We trained all 14 sourcing and quality staff. The Vice-President, Operations led this work and reported to the board\'s audit committee in June and December.',
    weakExample: 'We are committed to continuous improvement and are developing a comprehensive human rights framework.',
    weakWhy: 'It describes no step taken in the year. The guidance asks for concrete actions rather than purely aspirational statements.',
    nothingToReport: 'We did not take steps during the financial year to prevent and reduce the risk that forced labour or child labour is used in our activities or supply chains.',
    nothingToReportNote: 'The Act requires the report even if no steps were taken. If work has started since, add a second sentence saying what and when, clearly dated after the year end.',
    characterGuidance: '800 to 2,500 characters.',
  },
  {
    key: 'other_information', number: 10, title: 'Other relevant information', optional: true,
    actQuote: null,
    mapsTo: 'No provision of the Canadian Act. Template area 7, which rests on the Australian Act only.',
    plainTerms: 'Space for anything useful that does not fit elsewhere, such as wider human rights work, links to published documents, or challenges the entity faced. The Canadian Act does not ask for this section, so answer No below if there is nothing to add.',
    readersLookFor: 'Links that work and documents that are public. Readers skip general statements of values.',
    context: [guidance(S211_GUIDANCE_LINKS), guidance(S211_GUIDANCE_WIDER_ACTIONS)],
    fields: [
      { key: 'has_other_information', label: 'Is there anything to add?', type: 'yn', source: 'good-practice', required: true,
        hint: 'No leaves this section out of the report.' },
      { key: 'other_description', label: 'Other relevant information', type: 'textarea', maxChars: 1500, source: 'template',
        required: c => c.has_other_information === 'Yes', showWhen: c => c.has_other_information === 'Yes', hint: '' },
      { key: 'challenges', label: 'Challenges faced in meeting the requirements', type: 'textarea', maxChars: 600, source: 'template',
        showWhen: c => c.has_other_information === 'Yes', hint: 'For example mapping a complex supply chain.' },
      { key: 'steps_planned_next', label: 'Steps planned before the next report', type: 'textarea', maxChars: 600, source: 'template',
        showWhen: c => c.has_other_information === 'Yes', hint: '' },
      { key: 'links', label: 'Links to public documents', type: 'rows', source: 'guidance',
        columns: [{ key: 'title', label: 'Title' }, { key: 'url', label: 'Web address' }],
        showWhen: c => c.has_other_information === 'Yes', hint: 'Public documents only. Check each link opens.' },
    ],
    controlledEntities: null,
    strongExample: 'Our Supplier Code of Conduct and our list of finished-goods factories are published on our website. We are a member of an industry group on responsible sourcing in outdoor goods and took part in its 2025 working group on recruitment fees.',
    weakExample: 'Sustainability is at the heart of everything we do.',
    weakWhy: 'It adds no information a reader can use.',
    nothingToReport: null,
    nothingToReportNote: 'This is the one section that may be left out. Answer No above and the report omits it.',
    characterGuidance: 'Up to 1,500 characters.',
  },
  {
    key: 'approval_attestation', number: 11, title: 'Approval and attestation',
    actQuote: { lines: [...letteredLines(S211_ACT_SECTION_11_4), '', ...letteredLines(S211_ACT_SECTION_11_5)], ref: 'Act, s.11(4) and (5)' },
    mapsTo: 'Act s.11(4) and (5). Template: administrative reporting requirements.',
    plainTerms: 'The governing body, usually the board of directors, must approve the report before it is submitted. The report must say which body approved it and carry the signature of at least one member of that body. The signed statement is called the attestation.',
    readersLookFor: 'Public Safety Canada checks three things: a statement of approval, the basis for it, and a signature.',
    context: [guidance(S211_ATTESTATION_MANDATORY), guidance(S211_GUIDANCE_GOVERNING_BODY_CHOICE), guidance(S211_GUIDANCE_PROPER_SIGNATURE), guidance(S211_ATTESTATION_AUTHORITY)],
    fields: [
      { key: 'governing_body', label: 'Governing body that approved the report', type: 'text', source: 'act', required: true, hint: 'For example "Board of Directors".' },
      { key: 'approval_basis', label: 'Basis of approval', type: 'choice', source: 'act', required: true, options: ['single', 'joint_each', 'joint_controlling'],
        hint: 'The Act requires the statement to say which. The choices depend on the report type in section 1.' },
      { key: 'approval_date', label: 'Date the governing body approved the report', type: 'date', source: 'act', required: true, hint: '' },
      { key: 'signatory_name', label: 'Full name of the member who signs', type: 'text', source: 'guidance', required: true,
        hint: 'The only person named in the report.' },
      { key: 'signatory_title', label: 'Their title', type: 'text', source: 'guidance', required: true, hint: 'For example "Chair of the Board".' },
      { key: 'attestation_text', label: 'Attestation', type: 'textarea', maxChars: 1200, source: 'guidance', required: true,
        hint: 'Pre-filled with Public Safety Canada\'s example. You may edit it.' },
      { key: 'authority_to_bind', label: 'The signer has the authority to bind the entity', type: 'confirm', source: 'guidance', required: true, hint: '' },
    ],
    controlledEntities: null,
    strongExample: 'Approved by the Board of Directors of Harrowgate Outdoor Equipment Inc. on April 14, 2026 under subparagraph 11(4)(b)(ii) of the Act, as the governing body of the entity that controls each entity included in this report. Signed by a named director, with the title "Chair of the Board", the date, and the statement "I have the authority to bind Harrowgate Outdoor Equipment Inc."',
    weakExample: 'Approved by management. No signature.',
    weakWhy: 'Management is not the governing body, the basis for approval is missing, and an unsigned report will not be published.',
    nothingToReport: null, nothingToReportNote: null,
    characterGuidance: 'The example attestation is about 560 characters. Keep edits close to that length.',
  },
]

export const sectionDef = (key: SectionKey): SectionDef => SECTIONS.find(s => s.key === key)!

// ── Section 11 defaults ─────────────────────────────────────────────────────────────────────────────
export const ATTESTATION_DEFAULT = S211_ATTESTATION_EXAMPLE
export const ATTESTATION_EXAMPLE_NOTE =
  `This is Public Safety Canada's example wording. The guidance introduces it with "${S211_ATTESTATION_INTRO}" It is not a prescribed form, and you may edit it. What the Act requires is a statement of how the report was approved and the signature of at least one member of the governing body.`
export const ATTESTATION_SIGNATURE_LINES = S211_ATTESTATION_SIGNATURE_BLOCK
export const BUILDER_NOTE_ON_SIGNING =
  'The builder produces the report for signing. It does not sign it and cannot confirm that the governing body approved it.'

// ── Section 2 context used by the OECD step rows in section 3 ───────────────────────────────────────
export const OECD_STEPS = S211_GUIDANCE_B_OECD_STEPS
export const EXAMPLES_LABEL = 'Fictional examples. No company named here exists.'
