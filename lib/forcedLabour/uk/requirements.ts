// lib/forcedLabour/uk/requirements.ts
// What the UK asks of a commercial organisation under section 54 of the Modern Slavery Act 2015
// ("Transparency in supply chains etc."), recorded VERBATIM from the statute, the regulations made under
// it, the Home Office's statutory guidance, and the GOV.UK pages that describe the registry.
//
// READ ON 1 OCT 2026, and copied from the downloaded text of each source, not retyped from memory. A script
// checked that every string below appears word for word in its source before this file was written.
// lib/forcedLabour/uk/requirements.test.ts pins every string, so an edit here is a visible act.
//
// ⚠️ VERBATIM MEANS VERBATIM. The statute's em-dashes, its straight apostrophes ("organisation's") and the
// guidance's curly ones ("organisation’s"), British spelling, and the lower-case start of a bullet are all
// the sources' own. lib/emDashCopy.test.ts exempts this file for that reason; it holds quotations only.
// Never put our own copy in this file.
//
// ⚠️ STATUTE AND GUIDANCE ARE SEPARATE, AND THE DIFFERENCE DECIDES WHAT IS REQUIRED. Under s.54 as in force
// the only required content is (4): the steps taken, or a statement that none were. The six areas in
// s.54(5) "may" be included. The six-month timing is the guidance's "should", not a statutory deadline,
// and the registry is "encouraged", not required. Names say which is which: UK_MSA_ and UK_REGS_ are law;
// UK_GUIDANCE_ is the statutory guidance issued under s.54(9); UK_GOVUK_ and UK_REGISTRY_ are GOV.UK
// service pages, which restate rather than add.
//
// ⚠️ THE LAW IS EXPECTED TO CHANGE. The Immigration and Asylum Bill would amend s.54 (mandated content
// areas, a registry, a deadline, civil penalties). Nothing in it is law today, and nothing from it is in
// this file. lib/forcedLabour/pendingReforms.ts records it, dated, separately.

import {
  MODERN_SLAVERY_UK_S54_URL, UK_TISC_REGULATIONS_URL, UK_TISC_GUIDANCE_URL, UK_MSS_PUBLISH_GUIDANCE_URL,
  UK_MSS_REGISTRY_GUIDANCE_URL,
} from '../../sources'


/** The day every source below was read. */
export const UK_REQUIREMENTS_VERIFIED = '2026-10-01'

export const UK_MSA_S54_SOURCE_URL = MODERN_SLAVERY_UK_S54_URL
/**
 * s.54 as legislation.gov.uk showed it when read: in force from 29 Oct 2015, last changed 17 Dec 2016 (a
 * Scottish consequential amendment), and no outstanding or prospective effects listed against it. A later
 * date here means: read it again.
 */
export const UK_MSA_S54_IN_FORCE = '2015-10-29'
export const UK_MSA_S54_LAST_AMENDED = '2016-12-17'

/** SI 2015/1833, the Modern Slavery Act 2015 (Transparency in Supply Chains) Regulations 2015. No amendments shown. */
export const UK_REGS_SOURCE_URL = UK_TISC_REGULATIONS_URL

/**
 * "Transparency in supply chains: a practical guide", the statutory guidance, read in its accessible HTML
 * version. The collection was last updated 1 Dec 2025 (a Welsh version added); the guidance text read is
 * the version the 30 Jul 2025 update published.
 */
export const UK_GUIDANCE_SOURCE_URL = UK_TISC_GUIDANCE_URL
export const UK_GUIDANCE_PAGE_UPDATED = '2025-12-01'

/** GOV.UK "Publish an annual modern slavery statement". Last updated 25 Apr 2024. */
export const UK_GOVUK_PUBLISH_SOURCE_URL = UK_MSS_PUBLISH_GUIDANCE_URL
export const UK_GOVUK_PUBLISH_PAGE_UPDATED = '2024-04-25'

/** GOV.UK "Add your modern slavery statement to the statement registry". First published 23 Feb 2021, not since updated. */
export const UK_REGISTRY_GUIDANCE_SOURCE_URL = UK_MSS_REGISTRY_GUIDANCE_URL

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// STATUTE: Modern Slavery Act 2015, section 54
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// legislation.gov.uk, revised text. Straight apostrophes, as published.

/** s.54(1): the duty. */
export const UK_MSA_S54_1 =
  'A commercial organisation within subsection (2) must prepare a slavery and human trafficking statement for each financial year of the organisation.'

/** s.54(2): who is in scope. The amount is in the 2015 Regulations, reg. 2. */
export const UK_MSA_S54_2 = {
  leadIn: 'A commercial organisation is within this subsection if it—',
  paragraphs: [
    { letter: 'a', text: 'supplies goods or services, and' },
    { letter: 'b', text: 'has a total turnover of not less than an amount prescribed by regulations made by the Secretary of State.' },
  ],
} as const

/** s.54(3). */
export const UK_MSA_S54_3 =
  'For the purposes of subsection (2)(b), an organisation\'s total turnover is to be determined in accordance with regulations made by the Secretary of State.'

/** s.54(4): what the statement is. The only content the Act requires. */
export const UK_MSA_S54_4 = {
  leadIn: 'A slavery and human trafficking statement for a financial year is—',
  paragraphs: [
    { letter: 'a', text: 'a statement of the steps the organisation has taken during the financial year to ensure that slavery and human trafficking is not taking place—', sub: [
      { numeral: 'i', text: 'in any of its supply chains, and' },
      { numeral: 'ii', text: 'in any part of its own business, or' },
    ] },
    { letter: 'b', text: 'a statement that the organisation has taken no such steps.' },
  ],
} as const

/** s.54(5): "may include". Recommended, not required, in the Act as in force. */
export const UK_MSA_S54_5 = {
  leadIn: 'An organisation\'s slavery and human trafficking statement may include information about—',
  paragraphs: [
    { letter: 'a', text: 'the organisation\'s structure, its business and its supply chains;' },
    { letter: 'b', text: 'its policies in relation to slavery and human trafficking;' },
    { letter: 'c', text: 'its due diligence processes in relation to slavery and human trafficking in its business and supply chains;' },
    { letter: 'd', text: 'the parts of its business and supply chains where there is a risk of slavery and human trafficking taking place, and the steps it has taken to assess and manage that risk;' },
    { letter: 'e', text: 'its effectiveness in ensuring that slavery and human trafficking is not taking place in its business or supply chains, measured against such performance indicators as it considers appropriate;' },
    { letter: 'f', text: 'the training about slavery and human trafficking available to its staff.' },
  ],
} as const

/** s.54(6): approval and signing, by kind of organisation. */
export const UK_MSA_S54_6 = {
  leadIn: 'A slavery and human trafficking statement—',
  paragraphs: [
    { letter: 'a', text: 'if the organisation is a body corporate other than a limited liability partnership, must be approved by the board of directors (or equivalent management body) and signed by a director (or equivalent);' },
    { letter: 'b', text: 'if the organisation is a limited liability partnership, must be approved by the members and signed by a designated member;' },
    { letter: 'c', text: 'if the organisation is a limited partnership registered under the Limited Partnerships Act 1907, must be signed by a general partner;' },
    { letter: 'd', text: 'if the organisation is any other kind of partnership, must be signed by a partner.' },
  ],
} as const

/** s.54(7): publication. */
export const UK_MSA_S54_7 = {
  leadIn: 'If the organisation has a website, it must—',
  paragraphs: [
    { letter: 'a', text: 'publish the slavery and human trafficking statement on that website, and' },
    { letter: 'b', text: 'include a link to the slavery and human trafficking statement in a prominent place on that website\'s homepage.' },
  ],
} as const

/** s.54(8). */
export const UK_MSA_S54_8 =
  'If the organisation does not have a website, it must provide a copy of the slavery and human trafficking statement to anyone who makes a written request for one, and must do so before the end of the period of 30 days beginning with the day on which the request is received.'

/** s.54(9): the power under which the statutory guidance is issued. */
export const UK_MSA_S54_9 = {
  leadIn: 'The Secretary of State—',
  paragraphs: [
    { letter: 'a', text: 'may issue guidance about the duties imposed on commercial organisations by this section;' },
    { letter: 'b', text: 'must publish any such guidance in a way the Secretary of State considers appropriate.' },
  ],
} as const

/** s.54(10). */
export const UK_MSA_S54_10 =
  'The guidance may in particular include further provision about the kind of information which may be included in a slavery and human trafficking statement.'

/** s.54(11): the only enforcement route in force. */
export const UK_MSA_S54_11 =
  'The duties imposed on commercial organisations by this section are enforceable by the Secretary of State bringing civil proceedings in the High Court for an injunction or, in Scotland, for specific performance of a statutory duty under section 45 of the Court of Session Act 1988.'

/** s.54(12). The two items are unlettered in the Act. */
export const UK_MSA_S54_12_COMMERCIAL_ORGANISATION = {
  leadIn: '“commercial organisation” means—',
  items: [
    'a body corporate (wherever incorporated) which carries on a business, or part of a business, in any part of the United Kingdom, or',
    'a partnership (wherever formed) which carries on a business, or part of a business, in any part of the United Kingdom,',
  ],
  tail: 'and for this purpose “business” includes a trade or profession;',
} as const

/** s.54(12). */
export const UK_MSA_S54_12_PARTNERSHIP = {
  leadIn: '“partnership” means—',
  items: [
    'a partnership within the Partnership Act 1890,',
    'a limited partnership registered under the Limited Partnerships Act 1907, or',
    'a firm, or an entity of a similar character, formed under the law of a country outside the United Kingdom;',
  ],
} as const

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// STATUTE: The Modern Slavery Act 2015 (Transparency in Supply Chains) Regulations 2015 (SI 2015/1833)
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// The threshold and how turnover is measured. £36 million, "not less than" in s.54(2)(b): an organisation at
// exactly £36 million is in scope.

/** SI 2015/1833 reg. 1(2)(b). */
export const UK_REGS_1_2_B =
  '“subsidiary undertaking” has the meaning given by section 1162 of the Companies Act 2006.'

/** SI 2015/1833 reg. 2: the threshold. */
export const UK_REGS_2 =
  'The amount of total turnover prescribed for the purposes of section 54(2)(b) of the 2015 Act is £36 million.'

/** SI 2015/1833 reg. 3(1): group turnover counts. */
export const UK_REGS_3_1 = {
  leadIn: 'For the purposes of section 54(2)(b) of the 2015 Act the total turnover of a commercial organisation is—',
  paragraphs: [
    { letter: 'a', text: 'the turnover of that organisation; and' },
    { letter: 'b', text: 'the turnover of any of its subsidiary undertakings.' },
  ],
} as const

/** SI 2015/1833 reg. 3(2). */
export const UK_REGS_3_2 = {
  leadIn: 'In paragraph (1), “turnover” means the amount derived from the provision of goods and services falling within the ordinary activities of the commercial organisation or subsidiary undertaking, after deduction of—',
  paragraphs: [
    { letter: 'a', text: 'trade discounts;' },
    { letter: 'b', text: 'value added tax; and' },
    { letter: 'c', text: 'any other taxes based on the amounts so derived.' },
  ],
} as const

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// STATUTORY GUIDANCE: Transparency in supply chains: a practical guide (Home Office)
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// Issued under s.54(9). Where it says "should" or "best practice" it recommends; where it says "must" it is
// restating s.54.

/** Guidance 5.2.1. */
export const UK_GUIDANCE_WHO = {
  leadIn: 'Any commercial organisation in any part of a group structure will be required to comply with the provision and produce a statement if they meet all of the following criteria:',
  items: [
    'are a body corporate or a partnership (described as an “organisation” in this document), wherever incorporated',
    'carry on a business, or part of a business, in the UK',
    'supply goods or services',
    'have an annual turnover of £36 million or more',
  ],
} as const

/** Guidance 5.2.1. */
export const UK_GUIDANCE_DETERMINE =
  'Organisations are responsible for determining whether the legislation applies to them. You may wish to seek legal advice to decide if your organisation needs to produce an annual statement.'

/** Guidance 5.2.1, the second limb of total turnover. */
export const UK_GUIDANCE_TURNOVER_SUBSIDIARIES =
  'the turnover of any of its subsidiary undertakings (including those operating wholly outside the UK).'

/** Guidance 5.2.1, overseas organisations. */
export const UK_GUIDANCE_PRESENCE =
  'If your organisation has a demonstrable business presence in the UK and you meet the other criteria, you should publish an annual statement.'

/** Guidance 5.1. */
export const UK_GUIDANCE_NO_STEPS =
  'This means that if an organisation has taken no steps to ensure modern slavery is not taking place, they must still publish a statement stating this to be the case.'

/** Guidance 5.2.1, groups of companies. */
export const UK_GUIDANCE_GROUP_ONE_STATEMENT =
  'Where a parent organisation and one or more subsidiaries in the same group are required to produce a statement, the parent organisation may produce one statement that subsidiaries can use to meet this requirement (provided that the statement fully covers the steps that each of the organisations required to produce a statement have taken in the relevant financial year).'

/** Guidance 5.2.1. */
export const UK_GUIDANCE_GROUP_STATEMENT = {
  leadIn: 'If a group chooses to publish one statement, it:',
  items: [
    'must cover the steps taken to prevent modern slavery in all the organisations within that group that meet the criteria, and their supply chains',
    'should clearly name the parent and subsidiary organisations it is covering',
    'should be published on the UK websites of all the organisations covered by the statement',
  ],
} as const

/** Guidance section 4: the six areas, in the guidance's order and wording. */
export const UK_GUIDANCE_CONTENT_AREAS = {
  leadIn: 'Section 54(5) of the Modern Slavery Act 2015 sets out the content that may be included in a modern slavery statement:',
  items: [
    'organisational structure, its business and its supply chains',
    'organisational policies',
    'assessing and managing risk',
    'due diligence in relation to modern slavery (including approach to remediation)',
    'training',
    'monitoring and evaluation (understanding and demonstrating effectiveness)',
  ],
} as const

/** Guidance 5.2.4. */
export const UK_GUIDANCE_APPROVAL =
  'For a body corporate (other than a limited liability partnership), the statement must be approved by the board of directors and signed by a director (or equivalent). Where this is the case, it is best practice for the director who signs the statement to also sit on the board that approved the statement.'

/** Guidance 5.2.4. */
export const UK_GUIDANCE_APPROVAL_DATE =
  'It is best practice for the statement to include the date on which the board or members approved the statement.'

/** Guidance 5.3.1. */
export const UK_GUIDANCE_PLAIN_LANGUAGE =
  'To aid transparency, the statement should be written in simple language that is easily understood (the Plain English Campaign is well placed to assist with this).'

/** Guidance 5.3.1. Lower case as printed: it is a bullet. */
export const UK_GUIDANCE_LANGUAGE =
  'the statement should be in English but may also be provided in other languages, relevant to the organisation’s business and supply chains'

/** Guidance 5.3.2. */
export const UK_GUIDANCE_PUBLISH =
  'Section 54(7) requires each organisation to publish a modern slavery statement on their website and include a link in a prominent place on its homepage.'

/** Guidance 5.3.2. */
export const UK_GUIDANCE_PROMINENT =
  'A prominent place may mean a modern slavery link that is directly visible on the home page or part of an obvious drop-down menu on that page.'

/** Guidance 5.3.2: the registry is encouraged, not required. */
export const UK_GUIDANCE_REGISTRY =
  'The government encourages all organisations to upload their modern slavery statements to the modern slavery statement registry.'

/** Guidance 5.4: a recommendation. The Act sets no deadline. */
export const UK_GUIDANCE_WHEN =
  'Organisations should publish their statement as soon as possible after their financial year end. This should be, at most, within six months of the organisation’s financial year end.'

/** Guidance 5.2.3. */
export const UK_GUIDANCE_FAILURE = [
  'If a business fails to produce a modern slavery statement for a particular financial year, the Secretary of State may bring civil proceedings in the High Court for an injunction or, in Scotland, for specific performance of a statutory duty under section 45 of the Court of Session Act 1988 requiring the organisation to comply.',
  'If the organisation fails to comply with the injunction, they will be in contempt of a court order, which is punishable with an unlimited fine.',
] as const

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// GOV.UK SERVICE GUIDANCE: Publish an annual modern slavery statement; the statement registry
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// Service pages. They restate the Act and the guidance and describe the registry. They are not a source of
// obligations.

/** GOV.UK guidance page. Its order differs from s.54(5) and from the statutory guidance. */
export const UK_GOVUK_SIX_AREAS = {
  leadIn: 'The Modern Slavery Act recommends that you cover the following 6 areas in your statement:',
  items: [
    'Organisation structure and supply chains',
    'Policies in relation to slavery and human trafficking',
    'Due diligence processes',
    'Risk assessment and management',
    'Key performance indicators to measure effectiveness of steps being taken',
    'Training on modern slavery and trafficking',
  ],
} as const

/** GOV.UK guidance page. */
export const UK_GOVUK_APPROVAL_STATEMENT =
  'To demonstrate that you have met this legal requirement, your statement should clearly state that board approval has been given with the date of approval.'

/** GOV.UK guidance page, on the director or designated member who signs. */
export const UK_GOVUK_SIGN_OFF =
  'Include their name, job title and the date. You do not need to include a physical signature, but you should still clearly state that it has been signed.'

/** GOV.UK guidance page. */
export const UK_GOVUK_WHEN =
  'Statutory guidance states that you should do this within 6 months of your organisation’s financial year-end. You should also include the date your financial year ended.'

/** GOV.UK guidance page, on the registry's summary questions. */
export const UK_GOVUK_REGISTRY_QUESTIONS =
  'These questions are optional, however you are encouraged to answer all questions as fully as possible, to help improve understanding of modern slavery risks and best practice.'

/**
 * GOV.UK guidance page. ⚠️ "These changes" are those in the 2020 transparency in supply chains consultation
 * response the page links to (the page was last substantively updated 25 Apr 2024), NOT the Immigration and
 * Asylum Bill. It is current only as a statement that the s.54 requirements still apply.
 */
export const UK_GOVUK_CHANGES_NOT_IN_EFFECT =
  'These changes have not yet come into effect and organisations should continue to report under the current requirements set out on this page.'

/** GOV.UK "Add your modern slavery statement to the statement registry". */
export const UK_REGISTRY_SERVICE =
  'This service allows you to add your modern slavery statement to the government-run online modern slavery statement registry.'
