// lib/forcedLabour/au/requirements.ts
// What Australia asks of a reporting entity under the Modern Slavery Act 2018 (Cth), recorded VERBATIM from
// the Act (the authorised compilation on the Federal Register of Legislation) and from the
// Attorney-General's Department's guidance published on the Modern Slavery Statements Register.
//
// READ ON 1 OCT 2026, and copied from the downloaded text of each source, not retyped from memory. A script
// checked that every string below appears word for word in its source before this file was written.
// lib/forcedLabour/au/requirements.test.ts pins every string, so an edit here is a visible act.
//
// ⚠️ VERBATIM MEANS VERBATIM. The Act's em-dashes, "$100 million" without a currency (the guidance writes
// AU$), "Sub- Committee" with its space, and "e.g." are the sources' own. lib/emDashCopy.test.ts exempts
// this file for that reason; it holds quotations only. Never put our own copy in this file.
//
// ⚠️ STATUTE AND GUIDANCE ARE SEPARATE. In Australia the content criteria, the approval and signing, and
// the six-month deadline are all in the Act (ss.13, 14, 16), so they are requirements, not
// recommendations. The guidance adds what the Department will and will not publish, and how. Names say
// which is which: AU_MSA_ is the Act; AU_GUIDANCE_ is the Department's guidance (the May 2023 guidance and
// the March 2026 supplements); AU_SUBMISSION_ is the register's submission process.
//
// ⚠️ THERE IS NO FINANCIAL PENALTY IN THE ACT AS COMPILED. s.16A (a request, then naming) is the only
// consequence. An announcement of 17 July 2026 could not be reached from an official source when this was
// read; see lib/forcedLabour/pendingReforms.ts. Nothing announced is in this file.

import {
  MODERN_SLAVERY_AU_URL, AU_MSA_GUIDANCE_URL, AU_MSA_PGB_GUIDANCE_URL, AU_MSA_SIGNATURE_GUIDANCE_URL,
  AU_MSS_SUBMISSION_URL,
} from '../../sources'


/** The day every source below was read. */
export const AU_REQUIREMENTS_VERIFIED = '2026-10-01'

/**
 * The Act as the Federal Register of Legislation's "latest" compilation stood when read: Compilation No. 2,
 * compilation date 7 Nov 2024, register ID C2024C00747, incorporating amendments up to Act No. 42, 2024,
 * with no unincorporated amendments listed. A different compilation number there means: read it again.
 */
export const AU_MSA_SOURCE_URL = MODERN_SLAVERY_AU_URL
export const AU_MSA_COMPILATION_NO = 2
export const AU_MSA_COMPILATION_DATE = '2024-11-07'
export const AU_MSA_REGISTER_ID = 'C2024C00747'

/** "Commonwealth Modern Slavery Act 2018: Guidance for Reporting Entities", dated May 2023. */
export const AU_GUIDANCE_SOURCE_URL = AU_MSA_GUIDANCE_URL
export const AU_GUIDANCE_VERSION = 'May 2023'
/** The two supplementary guidance notes, each dated March 2026. */
export const AU_GUIDANCE_PGB_SOURCE_URL = AU_MSA_PGB_GUIDANCE_URL
export const AU_GUIDANCE_SIGNATURE_SOURCE_URL = AU_MSA_SIGNATURE_GUIDANCE_URL
export const AU_GUIDANCE_SUPPLEMENTARY_VERSION = 'March 2026'
/** The register's submission process overview, dated August 2025. */
export const AU_SUBMISSION_SOURCE_URL = AU_MSS_SUBMISSION_URL
export const AU_SUBMISSION_VERSION = 'August 2025'

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// STATUTE: Modern Slavery Act 2018 (Cth)
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// Compilation No. 2. Section numbers are the Act's. Definitions are s.4.

/** s.5(1): who reports. */
export const AU_MSA_S5_1 = {
  leadIn: 'Each of the following is a reporting entity in relation to a reporting period:',
  paragraphs: [
    { letter: 'a', text: 'an entity which has a consolidated revenue of at least $100 million for the reporting period, if the entity:', sub: [
      { numeral: 'i', text: 'is an Australian entity at any time in that reporting period; or' },
      { numeral: 'ii', text: 'carries on business in Australia at any time in that reporting period;' },
    ] },
    { letter: 'b', text: 'the Commonwealth;' },
    { letter: 'c', text: 'a corporate Commonwealth entity, or a Commonwealth company, within the meaning of the Public Governance, Performance and Accountability Act 2013, which has a consolidated revenue of at least $100 million for the reporting period;' },
    { letter: 'd', text: 'an entity which has volunteered to comply with the requirements of this Act under section 6 for that period.' },
  ],
} as const

/** s.5(2). */
export const AU_MSA_S5_2 = {
  leadIn: 'An entity carries on business in Australia if the entity:',
  paragraphs: [
    { letter: 'a', text: 'in the case of a body corporate—carries on business in Australia, a State or a Territory within the meaning of the Corporations Act 2001 (see section 21 of that Act); or' },
    { letter: 'b', text: 'in any other case—would be taken to do so within the meaning of that Act if the entity were a body corporate.' },
  ],
} as const

/** s.13(1). */
export const AU_MSA_S13_1 =
  'A reporting entity must give the Minister a modern slavery statement for the entity, for a reporting period, unless a modern slavery statement has been given covering the entity for that period under section 14 (joint modern slavery statements) or 15 (Commonwealth modern slavery statements).'

/** s.13(2): approval, signing, form and the deadline for a single entity. */
export const AU_MSA_S13_2 = {
  leadIn: 'The reporting entity must ensure that the statement:',
  paragraphs: [
    { letter: 'a', text: 'complies with section 16; and' },
    { letter: 'b', text: 'is prepared in a form approved by the Minister; and' },
    { letter: 'c', text: 'is approved by the principal governing body of the entity; and' },
    { letter: 'd', text: 'is signed by a responsible member of the entity; and' },
    { letter: 'e', text: 'is given to the Minister within 6 months after the end of the reporting period for the entity, in a manner approved by the Minister.' },
  ],
} as const

/** The note to s.13(2) and Note 1 to s.14(2). */
export const AU_MSA_SIGNED_ELECTRONICALLY =
  'The statement may be signed electronically: see section 10 of the Electronic Transactions Act 1999.'

/** s.14(1): joint statements. */
export const AU_MSA_S14_1 =
  'An entity, other than the Commonwealth, may give the Minister a modern slavery statement covering one or more reporting entities (which may include the entity giving the statement), for a reporting period for those reporting entities.'

/** s.14(2): approval and signing for a joint statement, with three bases. */
export const AU_MSA_S14_2 = {
  leadIn: 'The entity giving the statement must ensure that it:',
  paragraphs: [
    { letter: 'a', text: 'complies with section 16; and' },
    { letter: 'b', text: 'is prepared in a form approved by the Minister; and' },
    { letter: 'c', text: 'is prepared in consultation with each reporting entity covered by the statement; and' },
    { letter: 'd', text: 'is approved by the principal governing body of:', sub: [
      { numeral: 'i', text: 'each reporting entity covered by the statement; or' },
      { numeral: 'ii', text: 'an entity (the higher entity) which is in a position, directly or indirectly, to influence or control each reporting entity covered by the statement, whether or not the higher entity is itself covered by the statement; or' },
      { numeral: 'iii', text: 'if it is not practicable to comply with subparagraph (i) or (ii)—at least one reporting entity covered by the statement; and' },
    ] },
    { letter: 'e', text: 'is signed by a responsible member of:', sub: [
      { numeral: 'i', text: 'if subparagraph (d)(i) applies—each reporting entity covered by the statement; or' },
      { numeral: 'ii', text: 'if subparagraph (d)(ii) applies—the higher entity; or' },
      { numeral: 'iii', text: 'if subparagraph (d)(iii) applies—each reporting entity to which the subparagraph applies; and' },
    ] },
    { letter: 'f', text: 'is given to the Minister:', sub: [
      { numeral: 'i', text: 'within 6 months after the end of the reporting period for the entities covered by the statement, in a manner approved by the Minister; or' },
      { numeral: 'ii', text: 'within a period prescribed by rules made for the purposes of this subparagraph.' },
    ] },
  ],
} as const

/** s.16(1): the mandatory criteria, (a) to (g). */
export const AU_MSA_S16_1 = {
  leadIn: 'A modern slavery statement must, in relation to each reporting entity covered by the statement:',
  paragraphs: [
    { letter: 'a', text: 'identify the reporting entity; and' },
    { letter: 'b', text: 'describe the structure, operations and supply chains of the reporting entity; and' },
    { letter: 'c', text: 'describe the risks of modern slavery practices in the operations and supply chains of the reporting entity, and any entities that the reporting entity owns or controls; and' },
    { letter: 'd', text: 'describe the actions taken by the reporting entity and any entity that the reporting entity owns or controls, to assess and address those risks, including due diligence and remediation processes; and' },
    { letter: 'e', text: 'describe how the reporting entity assesses the effectiveness of such actions; and' },
    { letter: 'f', text: 'describe the process of consultation with:', sub: [
      { numeral: 'i', text: 'any entities that the reporting entity owns or controls; and' },
      { numeral: 'ii', text: 'in the case of a reporting entity covered by a statement under section 14—the entity giving the statement; and' },
    ] },
    { letter: 'g', text: 'include any other information that the reporting entity, or the entity giving the statement, considers relevant.' },
  ],
} as const

/** The example under s.16(1). Policies and training are examples of actions, not separate criteria. */
export const AU_MSA_S16_1_EXAMPLE =
  'For paragraph (d), actions taken by an entity may include the development of policies and processes to address modern slavery risks, and providing training for staff about modern slavery.'

/** s.16(2): the approval details the statement itself must carry. */
export const AU_MSA_S16_2 = {
  leadIn: 'A modern slavery statement, other than a statement to be given under section 15 (Commonwealth modern slavery statements), must include:',
  paragraphs: [
    { letter: 'a', text: 'for a statement to be given under section 13 (modern slavery statements for single reporting entities)—details of approval by the principal governing body of the reporting entity; or' },
    { letter: 'b', text: 'for a statement to be given under section 14 (joint modern slavery statements):', sub: [
      { numeral: 'i', text: 'details of approval by the relevant principal governing body or bodies; and' },
      { numeral: 'ii', text: 'if subparagraph 14(2)(d)(iii) applies—an explanation of why it is not practicable to comply with subparagraph 14(2)(d)(i) or (ii).' },
    ] },
  ],
} as const

/** s.16A(1): the request. */
export const AU_MSA_S16A_1 = {
  leadIn: 'If the Minister is reasonably satisfied that an entity has failed to comply with a requirement under section 13 or 14 (which deal with requirements to give modern slavery statements), the Minister may give a written request to the entity to do either or both of the following:',
  paragraphs: [
    { letter: 'a', text: 'provide an explanation for the failure to comply within a specified period of 28 days or longer after the request is given;' },
    { letter: 'b', text: 'undertake specified remedial action in relation to that requirement in accordance with the request within a specified period of 28 days or longer after the request is given.' },
  ],
} as const

/** s.16A(4): naming. The only consequence in force; there is no financial penalty in the Act. */
export const AU_MSA_S16A_4 = {
  leadIn: 'If the Minister is reasonably satisfied that an entity has failed to comply with a request under subsection (1), the Minister may publish the following information on the register, or in any other way the Minister considers appropriate:',
  paragraphs: [
    { letter: 'a', text: 'the identity of the entity;' },
    { letter: 'b', text: 'if the request relates to the entity’s failure to comply with subsection 14(2) (joint modern slavery statements) in relation to a modern slavery statement—the identities of the reporting entities covered by the statement;' },
    { letter: 'c', text: 'the date the request was given, and details of any extension given under subsection (2);' },
    { letter: 'd', text: 'details of the explanation or remedial action requested, and the period or periods specified in the request;' },
    { letter: 'e', text: 'the reasons why the Minister is satisfied that the entity has failed to comply with the request.' },
  ],
} as const

/** s.18(1) and (2). */
export const AU_MSA_S18 = [
  'The Minister must maintain a register of modern slavery statements, to be known as the Modern Slavery Statements Register.',
  'The register must be made available for public inspection, without charge, on the internet.',
] as const

/** s.19(1). */
export const AU_MSA_S19_1 = {
  leadIn: 'The Minister must register a modern slavery statement:',
  paragraphs: [
    { letter: 'a', text: 'given in accordance with section 13 (modern slavery statements for single reporting entities) or 14 (joint modern slavery statements); or' },
    { letter: 'b', text: 'prepared in accordance with section 15 (Commonwealth modern slavery statements).' },
  ],
} as const

/** The note to s.19(2). */
export const AU_MSA_S19_NOTE =
  'However, the Minister may elect not to register a modern slavery statement if the entity does not comply with those requirements.'

/** s.4. */
export const AU_MSA_DEF_CONSOLIDATED_REVENUE = {
  leadIn: 'consolidated revenue, of an entity, means:',
  paragraphs: [
    { letter: 'a', text: 'the total revenue of the entity, for a reporting period; or' },
    { letter: 'b', text: 'if the entity controls another entity or entities—the total revenue of the entity and all of the controlled entities, considered as a group, for a reporting period of the controlling entity;' },
  ],
  tail: 'worked out in accordance with the accounting standards, even if those standards do not otherwise apply to such an entity (including a controlling entity) or group.',
} as const

/** s.4. */
export const AU_MSA_DEF_CONTROL =
  'control, of an entity by another entity, means control of the entity within the meaning of the accounting standards.'

/** s.4. */
export const AU_MSA_DEF_AUSTRALIAN_ENTITY = {
  leadIn: 'Australian entity means:',
  paragraphs: [
    { letter: 'a', text: 'a company which is a resident within the meaning of subsection 6(1) of the Income Tax Assessment Act 1936; or' },
    { letter: 'b', text: 'a trust, if the trust estate is a resident trust estate within the meaning of Division 6 of Part III of the Income Tax Assessment Act 1936; or' },
    { letter: 'c', text: 'a corporate limited partnership which is a resident within the meaning of section 94T of the Income Tax Assessment Act 1936; or' },
    { letter: 'd', text: 'any other partnership, or other entity, whether incorporated or unincorporated, if:', sub: [
      { numeral: 'i', text: 'the entity is formed or incorporated within Australia; or' },
      { numeral: 'ii', text: 'the central management or control of the entity is in Australia.' },
    ] },
  ],
} as const

/** s.4. */
export const AU_MSA_DEF_PRINCIPAL_GOVERNING_BODY = {
  leadIn: 'principal governing body, of an entity, means:',
  paragraphs: [
    { letter: 'a', text: 'the body, or group of members of the entity, with primary responsibility for the governance of the entity; or' },
    { letter: 'b', text: 'if the entity is of a kind prescribed by rules made for the purposes of this paragraph—a prescribed body within the entity, or a prescribed member or members of the entity.' },
  ],
} as const

/** s.4: who may sign. */
export const AU_MSA_DEF_RESPONSIBLE_MEMBER = {
  leadIn: 'responsible member, of an entity, means:',
  paragraphs: [
    { letter: 'a', text: 'an individual member of the entity’s principal governing body who is authorised to sign modern slavery statements for the purposes of this Act; or' },
    { letter: 'b', text: 'if the entity is a trust administered by a sole trustee—that trustee; or' },
    { letter: 'c', text: 'if the entity is a corporation sole—the individual constituting the corporation; or' },
    { letter: 'd', text: 'if the entity is under administration within the meaning of the Corporations Act 2001—the administrator; or' },
    { letter: 'e', text: 'if the entity is of a kind prescribed by rules made for the purposes of this paragraph—a prescribed member of the entity.' },
  ],
} as const

/** s.4. */
export const AU_MSA_DEF_REPORTING_PERIOD =
  'reporting period, of an entity, means a financial year, or another annual accounting period applicable to the entity, which starts after the commencement of this section.'

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// GUIDANCE: Commonwealth Modern Slavery Act 2018, Guidance for Reporting Entities (May 2023)
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// The Department’s restatement and advice. "Must" here restates the Act.

/** Guidance, Introduction. The guidance names the currency; the Act writes $100 million. */
export const AU_GUIDANCE_THRESHOLD =
  'The reporting requirement applies to commercial and not for profit entities with annual consolidated revenue of at least AU$100 million.'

/** Guidance, Chapter 1. */
export const AU_GUIDANCE_SEVEN_CRITERIA =
  'The Act sets out seven mandatory criteria for the content of statements.'

/** Guidance, Chapter 5. */
export const AU_GUIDANCE_HEADINGS =
  'If you are unsure about how to structure your statement, you can use each of the seven criteria as topic headings.'

/** Guidance, Chapter 4. */
export const AU_GUIDANCE_DEADLINE =
  'You will also need to submit your statement to the Attorney-General’s Department via the online central register within six months after the end of your reporting period.'

/** Guidance, Chapter 1. */
export const AU_GUIDANCE_PUBLISH =
  'All statements must be published on the central register. However, you can also choose to publish your statement in other ways, including on your website or in your annual report.'

/** Guidance, Chapter 1. */
export const AU_GUIDANCE_REFUSE =
  'The Minister may refuse to publish your statement if it does not meet all the requirements under the Act.'

/** Guidance, Chapter 1 summary. */
export const AU_GUIDANCE_NAMING =
  'Under the Act, the Government has the power to publicly name entities that fail to comply with the reporting requirement.'

/** Guidance, reporting on allegations or cases: three of the "DO NOT" items. */
export const AU_GUIDANCE_PERSONAL_INFORMATION_DO_NOT = [
  'report on the allegation or case if doing so could put the victim at risk',
  'provide the name, age, or other personal information about the victim',
  'breach any privacy obligations that may apply to the collection and disclosure of personal data.',
] as const

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// GUIDANCE: Supplementary guidance, principal governing body approval and signature of a responsible member (March 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// What the Department will not publish, and what it recommends.

/** Supplementary guidance, principal governing body approval. "Sub- Committee" is as printed. */
export const AU_GUIDANCE_PGB_NO_DELEGATION =
  'The Act does not permit delegation of approval authority, including to an Individual, Executive Committee, Sub- Committee, or Work group. A statement will not be published if approval is not provided by the principal governing body or if it is unclear that approval has been provided.'

/** Supplementary guidance. */
export const AU_GUIDANCE_PGB_DATE =
  'The Act does not require the date of approval to be included in the statement, but it is recommended that statements include the approval date as good practice.'

/** Supplementary guidance, signature of a responsible member. */
export const AU_GUIDANCE_SIGNATURE_NOT_PUBLISHED =
  'A statement will not be published if it has not been clearly signed by a responsible member of the entity.'

/** Supplementary guidance. The items are lettered a) to c) on the page. */
export const AU_GUIDANCE_SIGNATURE_INCLUDES = {
  leadIn: 'It is important to ensure that approval from a responsible member shows that individual has the authority to approve the statement and includes:',
  items: [
    'The approver’s name',
    'The approver’s title or position (e.g. CEO, Director, member of the board)',
    'A copy of their signature or wording to explicitly show their approval of the statement.',
  ],
} as const

/** Supplementary guidance. */
export const AU_GUIDANCE_SIGNATURE_IN_STATEMENT =
  'Entities should ensure the approval of a responsible member is included in the statement and not in an external document.'

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// GUIDANCE: Modern Slavery Statements Register, submission process overview (August 2025)
// ════════════════════════════════════════════════════════════════════════════════════════════════════

/** Submission process overview. */
export const AU_SUBMISSION_PDF =
  'Upload one PDF statement (max 400MB; searchable PDF recommended).'

/** Submission process overview. */
export const AU_SUBMISSION_SUPPORTING =
  'Supporting documents will not be made public.'
