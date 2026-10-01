// lib/forcedLabour/requirementsMap.ts
// The UK and Australian requirements, topic by topic, and a crosswalk of the international reporting
// template's seven areas against Canada's builder sections, the UK's content and Australia's mandatory
// criteria. Stage A research (1 Oct 2026): nothing renders this yet.
//
// ⚠️ EVERY CELL IS TRACED TO A CONSTANT. `finding` is our plain summary; `refs` names the verbatim
// constants it rests on, as 'uk:NAME', 'au:NAME' or 'ca:NAME' (lib/forcedLabour/uk/requirements.ts,
// lib/forcedLabour/au/requirements.ts, lib/s211/requirements.ts), with an optional paragraph letter after a
// '#'. requirementsMap.test.ts resolves every one, so a renamed or removed constant fails here rather than
// leaving a claim with nothing under it. A finding with no source says so in `basis` and has no refs.
//
// ⚠️ `basis` SAYS WHERE THE RULE LIVES, AND THAT IS THE POINT OF THE MAP. 'statute' is law in force;
// 'guidance' is a recommendation or an administrative practice; 'none found' means the sources read on
// 1 Oct 2026 say nothing, which is a finding and not a gap filled from memory.
//
// ⚠️ PENDING REFORMS ARE NOT IN HERE. lib/forcedLabour/pendingReforms.ts records them, and names the cells
// below that each would change.

export type Basis = 'statute' | 'guidance' | 'statute and guidance' | 'none found'
export type Cell = { finding: string; basis: Basis; refs: readonly string[] }

export const MAP_TOPICS = [
  'who', 'content', 'approval', 'joint', 'timing', 'publication', 'personalInformation', 'penalties',
] as const
export type MapTopic = typeof MAP_TOPICS[number]

export const MAP_TOPIC_LABEL: Record<MapTopic, string> = {
  who: 'Who must report',
  content: 'What the statement must contain',
  approval: 'Approval and signing',
  joint: 'Joint or group statements',
  timing: 'Deadline and timing',
  publication: 'Publication, lodgement, format and language',
  personalInformation: 'Personal information and other content restrictions',
  penalties: 'Consequences in force',
}

export const UK_MAP: Record<MapTopic, readonly Cell[]> = {
  who: [
    { finding: 'A body corporate or partnership, wherever incorporated or formed, that carries on a business or part of one in any part of the UK, and supplies goods or services.', basis: 'statute', refs: ['uk:UK_MSA_S54_1', 'uk:UK_MSA_S54_2#a', 'uk:UK_MSA_S54_12_COMMERCIAL_ORGANISATION', 'uk:UK_MSA_S54_12_PARTNERSHIP'] },
    { finding: 'Total turnover of not less than £36 million: at exactly £36 million an organization is in scope.', basis: 'statute', refs: ['uk:UK_MSA_S54_2#b', 'uk:UK_REGS_2'] },
    { finding: 'Total turnover is the organization’s own plus that of its subsidiary undertakings (Companies Act 2006 s.1162), net of trade discounts, VAT and other taxes on it. The guidance adds that subsidiaries wholly outside the UK count.', basis: 'statute and guidance', refs: ['uk:UK_MSA_S54_3', 'uk:UK_REGS_3_1', 'uk:UK_REGS_3_2', 'uk:UK_REGS_1_2_B', 'uk:UK_GUIDANCE_TURNOVER_SUBSIDIARIES'] },
    { finding: 'Currency is pounds sterling. Neither the regulations nor the guidance say how turnover reported in another currency is converted.', basis: 'statute', refs: ['uk:UK_REGS_2'] },
    { finding: 'Any organization in a group that meets the criteria must comply. A demonstrable business presence in the UK is the guidance’s test for an overseas organization. The organization decides whether the Act applies to it.', basis: 'guidance', refs: ['uk:UK_GUIDANCE_WHO', 'uk:UK_GUIDANCE_PRESENCE', 'uk:UK_GUIDANCE_DETERMINE'] },
  ],
  content: [
    { finding: 'Mandatory: a statement of the steps taken during the financial year to ensure slavery and human trafficking is not taking place in its supply chains and its own business, or a statement that no such steps were taken.', basis: 'statute and guidance', refs: ['uk:UK_MSA_S54_4', 'uk:UK_GUIDANCE_NO_STEPS'] },
    { finding: 'Recommended: six areas the statement "may include" (structure and supply chains, policies, due diligence, risk, effectiveness against performance indicators, training). The guidance adds remediation under due diligence.', basis: 'statute and guidance', refs: ['uk:UK_MSA_S54_5', 'uk:UK_GUIDANCE_CONTENT_AREAS', 'uk:UK_GOVUK_SIX_AREAS', 'uk:UK_MSA_S54_10'] },
    { finding: 'Recommended: simple language that is easy to understand.', basis: 'guidance', refs: ['uk:UK_GUIDANCE_PLAIN_LANGUAGE'] },
  ],
  approval: [
    { finding: 'Body corporate other than an LLP: approved by the board of directors (or equivalent) and signed by a director (or equivalent). LLP: approved by the members, signed by a designated member. Limited partnership: signed by a general partner. Other partnership: signed by a partner.', basis: 'statute', refs: ['uk:UK_MSA_S54_6'] },
    { finding: 'Best practice: the signing director sits on the approving board, and the statement gives the approval date. GOV.UK: state that board approval was given, with the date; give the signer’s name, job title and the date; no physical signature is needed.', basis: 'guidance', refs: ['uk:UK_GUIDANCE_APPROVAL', 'uk:UK_GUIDANCE_APPROVAL_DATE', 'uk:UK_GOVUK_APPROVAL_STATEMENT', 'uk:UK_GOVUK_SIGN_OFF'] },
  ],
  joint: [
    { finding: 'The Act has no joint statement provision. The guidance lets a parent publish one statement that in-scope subsidiaries use, if it covers the steps of every in-scope organization; it should name them and be published on each one’s UK website.', basis: 'guidance', refs: ['uk:UK_GUIDANCE_GROUP_ONE_STATEMENT', 'uk:UK_GUIDANCE_GROUP_STATEMENT'] },
  ],
  timing: [
    { finding: 'One statement for each financial year. No statutory deadline.', basis: 'statute', refs: ['uk:UK_MSA_S54_1'] },
    { finding: 'Recommended: as soon as possible after year end, at most within six months, and give the year-end date.', basis: 'guidance', refs: ['uk:UK_GUIDANCE_WHEN', 'uk:UK_GOVUK_WHEN'] },
  ],
  publication: [
    { finding: 'With a website: publish the statement on it and link to it from a prominent place on the homepage. Without one: send a copy within 30 days of a written request.', basis: 'statute and guidance', refs: ['uk:UK_MSA_S54_7', 'uk:UK_MSA_S54_8', 'uk:UK_GUIDANCE_PUBLISH', 'uk:UK_GUIDANCE_PROMINENT'] },
    { finding: 'The government registry is encouraged, not required; its summary questions are optional.', basis: 'guidance', refs: ['uk:UK_GUIDANCE_REGISTRY', 'uk:UK_REGISTRY_SERVICE', 'uk:UK_GOVUK_REGISTRY_QUESTIONS'] },
    { finding: 'Language: should be in English, and may also be in other languages. No file format is prescribed.', basis: 'guidance', refs: ['uk:UK_GUIDANCE_LANGUAGE'] },
  ],
  personalInformation: [
    { finding: 'No restriction on personal information was found in the Act, the regulations, the statutory guidance or the GOV.UK pages read.', basis: 'none found', refs: [] },
  ],
  penalties: [
    { finding: 'Civil proceedings by the Secretary of State for an injunction (in Scotland, specific performance). Breaching an injunction is contempt of court, punishable with an unlimited fine. No fine for the failure itself.', basis: 'statute and guidance', refs: ['uk:UK_MSA_S54_11', 'uk:UK_GUIDANCE_FAILURE'] },
  ],
}

export const AU_MAP: Record<MapTopic, readonly Cell[]> = {
  who: [
    { finding: 'An entity with consolidated revenue of at least $100 million for the reporting period that is an Australian entity, or carries on business in Australia, at any time in that period. Also the Commonwealth, certain Commonwealth entities, and volunteers.', basis: 'statute', refs: ['au:AU_MSA_S5_1', 'au:AU_MSA_S5_2', 'au:AU_MSA_DEF_AUSTRALIAN_ENTITY'] },
    { finding: 'Consolidated revenue is the entity’s total revenue, or with controlled entities as a group, worked out under the accounting standards; control is as the accounting standards define it.', basis: 'statute', refs: ['au:AU_MSA_DEF_CONSOLIDATED_REVENUE', 'au:AU_MSA_DEF_CONTROL'] },
    { finding: 'Currency: the Act writes $100 million; the guidance writes AU$100 million. Neither says how revenue reported in another currency is converted.', basis: 'statute and guidance', refs: ['au:AU_MSA_S5_1#a', 'au:AU_GUIDANCE_THRESHOLD'] },
    { finding: 'Reporting period: a financial year, or another annual accounting period applicable to the entity.', basis: 'statute', refs: ['au:AU_MSA_DEF_REPORTING_PERIOD'] },
  ],
  content: [
    { finding: 'Mandatory for each reporting entity covered: (a) identify it; (b) structure, operations and supply chains; (c) risks, including in entities it owns or controls; (d) actions to assess and address them, including due diligence and remediation; (e) how it assesses effectiveness; (f) the consultation process; (g) any other relevant information.', basis: 'statute and guidance', refs: ['au:AU_MSA_S16_1', 'au:AU_GUIDANCE_SEVEN_CRITERIA'] },
    { finding: 'Policies and staff training are examples of actions under (d), not separate criteria.', basis: 'statute', refs: ['au:AU_MSA_S16_1_EXAMPLE'] },
    { finding: 'Mandatory: details of approval by the principal governing body or bodies, and for a joint statement under (d)(iii), why the other bases were not practicable.', basis: 'statute', refs: ['au:AU_MSA_S16_2'] },
    { finding: 'Recommended: use the seven criteria as headings.', basis: 'guidance', refs: ['au:AU_GUIDANCE_HEADINGS'] },
  ],
  approval: [
    { finding: 'Approved by the principal governing body and signed by a responsible member (a member of that body authorized to sign, or the sole trustee, administrator and so on). May be signed electronically.', basis: 'statute', refs: ['au:AU_MSA_S13_2#c', 'au:AU_MSA_S13_2#d', 'au:AU_MSA_DEF_PRINCIPAL_GOVERNING_BODY', 'au:AU_MSA_DEF_RESPONSIBLE_MEMBER', 'au:AU_MSA_SIGNED_ELECTRONICALLY'] },
    { finding: 'Approval cannot be delegated (not to an individual, executive committee, sub-committee or working group); unclear approval or an unclear signature means the statement is not published. Recommended: give the approval date. The signature should show name, title, and a signature or explicit approval wording, inside the statement.', basis: 'guidance', refs: ['au:AU_GUIDANCE_PGB_NO_DELEGATION', 'au:AU_GUIDANCE_PGB_DATE', 'au:AU_GUIDANCE_SIGNATURE_NOT_PUBLISHED', 'au:AU_GUIDANCE_SIGNATURE_INCLUDES', 'au:AU_GUIDANCE_SIGNATURE_IN_STATEMENT'] },
  ],
  joint: [
    { finding: 'Any entity except the Commonwealth may give one statement covering several reporting entities, prepared in consultation with each. Approval by each entity’s body, or by a higher entity that controls them all, or, if neither is practicable, at least one, with signatures to match.', basis: 'statute', refs: ['au:AU_MSA_S14_1', 'au:AU_MSA_S14_2', 'au:AU_MSA_S16_2#b'] },
  ],
  timing: [
    { finding: 'Within 6 months after the end of the reporting period (or a period prescribed by rules, for a joint statement).', basis: 'statute and guidance', refs: ['au:AU_MSA_S13_2#e', 'au:AU_MSA_S14_2#f', 'au:AU_GUIDANCE_DEADLINE'] },
  ],
  publication: [
    { finding: 'Given to the Minister in an approved form and manner, and registered on the public Modern Slavery Statements Register. The Minister may decline to register a non-compliant statement. Other publication is optional.', basis: 'statute and guidance', refs: ['au:AU_MSA_S13_1', 'au:AU_MSA_S13_2#b', 'au:AU_MSA_S18', 'au:AU_MSA_S19_1', 'au:AU_MSA_S19_NOTE', 'au:AU_GUIDANCE_PUBLISH', 'au:AU_GUIDANCE_REFUSE'] },
    { finding: 'Format: one PDF, up to 400MB, searchable recommended. Supporting documents are not made public.', basis: 'guidance', refs: ['au:AU_SUBMISSION_PDF', 'au:AU_SUBMISSION_SUPPORTING'] },
    { finding: 'No language requirement was found in the Act or the guidance read.', basis: 'none found', refs: [] },
  ],
  personalInformation: [
    { finding: 'When reporting an allegation or case: do not report it if that could put the victim at risk, do not give the victim’s name, age or other personal information, and do not breach privacy obligations.', basis: 'guidance', refs: ['au:AU_GUIDANCE_PERSONAL_INFORMATION_DO_NOT'] },
  ],
  penalties: [
    { finding: 'The Minister may request an explanation or remedial action (28 days or more), and if the request is not met, publish the entity’s identity and details on the register. No financial penalty in the Act.', basis: 'statute and guidance', refs: ['au:AU_MSA_S16A_1', 'au:AU_MSA_S16A_4', 'au:AU_GUIDANCE_NAMING'] },
  ],
}

// ── Crosswalk ───────────────────────────────────────────────────────────────────────────────────────
// Rows are the joint international reporting template's seven areas (ca:S211_TEMPLATE_AREAS, in order).
// `fit` is how far one answer can serve all three countries:
//   'one answer'    one written answer meets all three, with nothing country-specific to add;
//   'differs'       one answer is the base, but the wording or scope differs and each country needs its part;
//   'country-only'  only one country asks.
// The UK column is always recommended content: under s.54 as in force only (4) is required.

export type Fit = 'one answer' | 'differs' | 'country-only'
export type CrosswalkRow = {
  area: number
  canada: { sections: readonly string[]; refs: readonly string[] }
  uk: { refs: readonly string[]; required: false }
  au: { refs: readonly string[] }
  fit: Fit
  note: string
}

export const CROSSWALK: readonly CrosswalkRow[] = [
  { area: 1, canada: { sections: ['structure_activities_supply_chains'], refs: ['ca:S211_ACT_SECTION_11_3#a'] },
    uk: { refs: ['uk:UK_MSA_S54_5#a'], required: false }, au: { refs: ['au:AU_MSA_S16_1#a', 'au:AU_MSA_S16_1#b'] },
    fit: 'differs', note: 'One description serves all three. Australia also requires each reporting entity covered to be identified, and says "operations" where Canada says "activities" and the UK says "business".' },
  { area: 2, canada: { sections: ['policies_due_diligence'], refs: ['ca:S211_ACT_SECTION_11_3#b'] },
    uk: { refs: ['uk:UK_MSA_S54_5#b'], required: false }, au: { refs: ['au:AU_MSA_S16_1#d', 'au:AU_MSA_S16_1_EXAMPLE'] },
    fit: 'one answer', note: 'Australia has no separate policies criterion: policies are an example of an action under (d), so the same answer is placed there.' },
  { area: 3, canada: { sections: ['risks'], refs: ['ca:S211_ACT_SECTION_11_3#c'] },
    uk: { refs: ['uk:UK_MSA_S54_5#d'], required: false }, au: { refs: ['au:AU_MSA_S16_1#c', 'au:AU_MSA_S16_1#d'] },
    fit: 'differs', note: 'Australia requires the risks in entities the reporting entity owns or controls to be described as well. The UK and Canada ask about the parts of the business and supply chains at risk and the steps to assess and manage it.' },
  { area: 4, canada: { sections: ['policies_due_diligence', 'remediation', 'remediation_income_loss'], refs: ['ca:S211_ACT_SECTION_11_3#b', 'ca:S211_ACT_SECTION_11_3#d', 'ca:S211_ACT_SECTION_11_3#e'] },
    uk: { refs: ['uk:UK_MSA_S54_5#c', 'uk:UK_GUIDANCE_CONTENT_AREAS'], required: false }, au: { refs: ['au:AU_MSA_S16_1#d'] },
    fit: 'differs', note: 'Due diligence and remediation serve all three (the UK names remediation in its guidance only). Remediating the loss of income to vulnerable families, s.11(3)(e), is Canada-only.' },
  { area: 5, canada: { sections: ['training'], refs: ['ca:S211_ACT_SECTION_11_3#f'] },
    uk: { refs: ['uk:UK_MSA_S54_5#f'], required: false }, au: { refs: ['au:AU_MSA_S16_1_EXAMPLE'] },
    fit: 'one answer', note: 'Australia names training only as an example of an action under (d). Canada says "employees", the UK "staff", Australia "staff".' },
  { area: 6, canada: { sections: ['effectiveness'], refs: ['ca:S211_ACT_SECTION_11_3#g'] },
    uk: { refs: ['uk:UK_MSA_S54_5#e'], required: false }, au: { refs: ['au:AU_MSA_S16_1#e'] },
    fit: 'differs', note: 'The UK frames effectiveness against performance indicators the organization chooses; Canada and Australia ask how effectiveness is assessed.' },
  { area: 7, canada: { sections: ['other_information'], refs: [] },
    uk: { refs: [], required: false }, au: { refs: ['au:AU_MSA_S16_1#g'] },
    fit: 'country-only', note: 'Only Australia’s Act asks for it. The Canada builder section has no provision of the Canadian Act behind it.' },
]

/** What sits outside the seven areas, and who asks for it. */
export const OUTSIDE_THE_AREAS: readonly { topic: string; refs: readonly string[]; note: string }[] = [
  { topic: 'Steps taken during the year', refs: ['ca:S211_ACT_SECTION_11_1', 'uk:UK_MSA_S54_4'],
    note: 'Canada (builder section steps_taken) and the UK both require it; in the UK it is the only required content, and "no steps" is a valid statement. Australia covers it through (d).' },
  { topic: 'Consultation with owned or controlled entities', refs: ['au:AU_MSA_S16_1#f'], note: 'Australia only.' },
  { topic: 'Approval and signature', refs: ['ca:S211_ACT_SECTION_11_4', 'uk:UK_MSA_S54_6', 'au:AU_MSA_S13_2', 'au:AU_MSA_S14_2', 'au:AU_MSA_S16_2'],
    note: 'All three, different rules: Canada requires an attestation; the UK’s signer depends on the kind of organization; Australia requires approval details in the statement and does not allow delegation.' },
]
