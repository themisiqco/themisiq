// Every string in lib/forcedLabour/au/requirements.ts, pinned. Each was checked, on 1 Oct 2026, to appear word
// for word in the source it is attributed to. A change to one is a change someone has to make twice, on
// purpose. Where a source is later found to differ, update the constant AND the date it was read.

import { describe, it, expect } from 'vitest'
import * as R from './requirements'
import {
  MODERN_SLAVERY_AU_URL, AU_MSA_GUIDANCE_URL, AU_MSA_PGB_GUIDANCE_URL, AU_MSA_SIGNATURE_GUIDANCE_URL,
  AU_MSS_SUBMISSION_URL, AU_MSS_ANNEX_URL,
} from '../../sources'


describe('provenance', () => {
  it('names each source by host and path, and the compilation and versions it was read at', () => {
    expect(R.AU_MSA_SOURCE_URL).toBe(MODERN_SLAVERY_AU_URL)
    expect(new URL(R.AU_MSA_SOURCE_URL).hostname).toBe('www.legislation.gov.au')
    expect(R.AU_MSA_SOURCE_URL).toMatch(/\/C2018A00153\/latest\/text$/)
    for (const [k, v] of [[R.AU_GUIDANCE_SOURCE_URL, AU_MSA_GUIDANCE_URL], [R.AU_GUIDANCE_PGB_SOURCE_URL, AU_MSA_PGB_GUIDANCE_URL],
      [R.AU_GUIDANCE_SIGNATURE_SOURCE_URL, AU_MSA_SIGNATURE_GUIDANCE_URL], [R.AU_SUBMISSION_SOURCE_URL, AU_MSS_SUBMISSION_URL],
      [R.AU_REGISTER_ANNEX_SOURCE_URL, AU_MSS_ANNEX_URL]]) {
      expect(k).toBe(v)
      expect(new URL(k).hostname).toBe('modernslaveryregister.gov.au')
      expect(k).toMatch(/\/resources\/[^/]+\.pdf$/)
    }
    expect(R.AU_REQUIREMENTS_VERIFIED).toBe('2026-10-01')
    expect(R.AU_MSA_COMPILATION_NO).toBe(2)
    expect(R.AU_MSA_COMPILATION_DATE).toBe('2024-11-07')
    expect(R.AU_MSA_REGISTER_ID).toBe('C2024C00747')
    expect(R.AU_GUIDANCE_VERSION).toBe('May 2023')
    expect(R.AU_GUIDANCE_SUPPLEMENTARY_VERSION).toBe('March 2026')
    expect(R.AU_SUBMISSION_VERSION).toBe('August 2025')
    expect(R.AU_REGISTER_ANNEX_PDF_CREATED).toBe('2021-07-27')
  })
  it('records the register’s "over" against the Act’s "at least", and the Act decides', () => {
    expect(R.AU_MSA_S5_1.paragraphs[0].text).toContain('at least $100 million')
    expect(R.AU_SUBMISSION_REVENUE_DECLARATION).toContain('over AU$100 million')
    expect(R.AU_SUBMISSION_STATEMENT_TYPES[0].text).toContain('at least AU$100 million')
  })
})

describe('statute and guidance are kept apart', () => {
  it('every exported quotation is prefixed with the kind of source it comes from', () => {
    const unlabelled = Object.keys(R).filter(n => !/^AU_(MSA_|GUIDANCE_|REGISTER_|SUBMISSION_|REQUIREMENTS_VERIFIED$)/.test(n))
    expect(unlabelled).toEqual([])
  })
  it('the annexure indexes the same seven criteria, a) to g)', () => {
    expect(R.AU_REGISTER_ANNEX_CRITERIA.paragraphs.map(p => p.letter)).toEqual(R.AU_MSA_S16_1.paragraphs.map(p => p.letter))
    expect(R.AU_REGISTER_ANNEX_NOTE_F).toContain('‘Do not own or control any other entities’')
  })
  it('the seven criteria are mandatory in the Act itself, (a) to (g)', () => {
    expect(R.AU_MSA_S16_1.leadIn).toContain('must')
    expect(R.AU_MSA_S16_1.paragraphs.map(p => p.letter)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  })
})

describe('STATUTE: Modern Slavery Act 2018 (Cth)', () => {
  it('AU_MSA_S5_1', () => {
    expect(R.AU_MSA_S5_1).toEqual({
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
    })
  })
  it('AU_MSA_S5_2', () => {
    expect(R.AU_MSA_S5_2).toEqual({
      leadIn: 'An entity carries on business in Australia if the entity:',
      paragraphs: [
        { letter: 'a', text: 'in the case of a body corporate—carries on business in Australia, a State or a Territory within the meaning of the Corporations Act 2001 (see section 21 of that Act); or' },
        { letter: 'b', text: 'in any other case—would be taken to do so within the meaning of that Act if the entity were a body corporate.' },
      ],
    })
  })
  it('AU_MSA_S13_1', () => {
    expect(R.AU_MSA_S13_1).toBe('A reporting entity must give the Minister a modern slavery statement for the entity, for a reporting period, unless a modern slavery statement has been given covering the entity for that period under section 14 (joint modern slavery statements) or 15 (Commonwealth modern slavery statements).')
  })
  it('AU_MSA_S13_2', () => {
    expect(R.AU_MSA_S13_2).toEqual({
      leadIn: 'The reporting entity must ensure that the statement:',
      paragraphs: [
        { letter: 'a', text: 'complies with section 16; and' },
        { letter: 'b', text: 'is prepared in a form approved by the Minister; and' },
        { letter: 'c', text: 'is approved by the principal governing body of the entity; and' },
        { letter: 'd', text: 'is signed by a responsible member of the entity; and' },
        { letter: 'e', text: 'is given to the Minister within 6 months after the end of the reporting period for the entity, in a manner approved by the Minister.' },
      ],
    })
  })
  it('AU_MSA_SIGNED_ELECTRONICALLY', () => {
    expect(R.AU_MSA_SIGNED_ELECTRONICALLY).toBe('The statement may be signed electronically: see section 10 of the Electronic Transactions Act 1999.')
  })
  it('AU_MSA_S14_1', () => {
    expect(R.AU_MSA_S14_1).toBe('An entity, other than the Commonwealth, may give the Minister a modern slavery statement covering one or more reporting entities (which may include the entity giving the statement), for a reporting period for those reporting entities.')
  })
  it('AU_MSA_S14_2', () => {
    expect(R.AU_MSA_S14_2).toEqual({
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
    })
  })
  it('AU_MSA_S16_1', () => {
    expect(R.AU_MSA_S16_1).toEqual({
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
    })
  })
  it('AU_MSA_S16_1_EXAMPLE', () => {
    expect(R.AU_MSA_S16_1_EXAMPLE).toBe('For paragraph (d), actions taken by an entity may include the development of policies and processes to address modern slavery risks, and providing training for staff about modern slavery.')
  })
  it('AU_MSA_S16_2', () => {
    expect(R.AU_MSA_S16_2).toEqual({
      leadIn: 'A modern slavery statement, other than a statement to be given under section 15 (Commonwealth modern slavery statements), must include:',
      paragraphs: [
        { letter: 'a', text: 'for a statement to be given under section 13 (modern slavery statements for single reporting entities)—details of approval by the principal governing body of the reporting entity; or' },
        { letter: 'b', text: 'for a statement to be given under section 14 (joint modern slavery statements):', sub: [
          { numeral: 'i', text: 'details of approval by the relevant principal governing body or bodies; and' },
          { numeral: 'ii', text: 'if subparagraph 14(2)(d)(iii) applies—an explanation of why it is not practicable to comply with subparagraph 14(2)(d)(i) or (ii).' },
        ] },
      ],
    })
  })
  it('AU_MSA_S16A_1', () => {
    expect(R.AU_MSA_S16A_1).toEqual({
      leadIn: 'If the Minister is reasonably satisfied that an entity has failed to comply with a requirement under section 13 or 14 (which deal with requirements to give modern slavery statements), the Minister may give a written request to the entity to do either or both of the following:',
      paragraphs: [
        { letter: 'a', text: 'provide an explanation for the failure to comply within a specified period of 28 days or longer after the request is given;' },
        { letter: 'b', text: 'undertake specified remedial action in relation to that requirement in accordance with the request within a specified period of 28 days or longer after the request is given.' },
      ],
    })
  })
  it('AU_MSA_S16A_4', () => {
    expect(R.AU_MSA_S16A_4).toEqual({
      leadIn: 'If the Minister is reasonably satisfied that an entity has failed to comply with a request under subsection (1), the Minister may publish the following information on the register, or in any other way the Minister considers appropriate:',
      paragraphs: [
        { letter: 'a', text: 'the identity of the entity;' },
        { letter: 'b', text: 'if the request relates to the entity’s failure to comply with subsection 14(2) (joint modern slavery statements) in relation to a modern slavery statement—the identities of the reporting entities covered by the statement;' },
        { letter: 'c', text: 'the date the request was given, and details of any extension given under subsection (2);' },
        { letter: 'd', text: 'details of the explanation or remedial action requested, and the period or periods specified in the request;' },
        { letter: 'e', text: 'the reasons why the Minister is satisfied that the entity has failed to comply with the request.' },
      ],
    })
  })
  it('AU_MSA_S18', () => {
    expect(R.AU_MSA_S18).toEqual([
      'The Minister must maintain a register of modern slavery statements, to be known as the Modern Slavery Statements Register.',
      'The register must be made available for public inspection, without charge, on the internet.',
    ])
  })
  it('AU_MSA_S19_1', () => {
    expect(R.AU_MSA_S19_1).toEqual({
      leadIn: 'The Minister must register a modern slavery statement:',
      paragraphs: [
        { letter: 'a', text: 'given in accordance with section 13 (modern slavery statements for single reporting entities) or 14 (joint modern slavery statements); or' },
        { letter: 'b', text: 'prepared in accordance with section 15 (Commonwealth modern slavery statements).' },
      ],
    })
  })
  it('AU_MSA_S19_NOTE', () => {
    expect(R.AU_MSA_S19_NOTE).toBe('However, the Minister may elect not to register a modern slavery statement if the entity does not comply with those requirements.')
  })
  it('AU_MSA_DEF_CONSOLIDATED_REVENUE', () => {
    expect(R.AU_MSA_DEF_CONSOLIDATED_REVENUE).toEqual({
      leadIn: 'consolidated revenue, of an entity, means:',
      paragraphs: [
        { letter: 'a', text: 'the total revenue of the entity, for a reporting period; or' },
        { letter: 'b', text: 'if the entity controls another entity or entities—the total revenue of the entity and all of the controlled entities, considered as a group, for a reporting period of the controlling entity;' },
      ],
      tail: 'worked out in accordance with the accounting standards, even if those standards do not otherwise apply to such an entity (including a controlling entity) or group.',
    })
  })
  it('AU_MSA_DEF_CONTROL', () => {
    expect(R.AU_MSA_DEF_CONTROL).toBe('control, of an entity by another entity, means control of the entity within the meaning of the accounting standards.')
  })
  it('AU_MSA_DEF_AUSTRALIAN_ENTITY', () => {
    expect(R.AU_MSA_DEF_AUSTRALIAN_ENTITY).toEqual({
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
    })
  })
  it('AU_MSA_DEF_PRINCIPAL_GOVERNING_BODY', () => {
    expect(R.AU_MSA_DEF_PRINCIPAL_GOVERNING_BODY).toEqual({
      leadIn: 'principal governing body, of an entity, means:',
      paragraphs: [
        { letter: 'a', text: 'the body, or group of members of the entity, with primary responsibility for the governance of the entity; or' },
        { letter: 'b', text: 'if the entity is of a kind prescribed by rules made for the purposes of this paragraph—a prescribed body within the entity, or a prescribed member or members of the entity.' },
      ],
    })
  })
  it('AU_MSA_DEF_RESPONSIBLE_MEMBER', () => {
    expect(R.AU_MSA_DEF_RESPONSIBLE_MEMBER).toEqual({
      leadIn: 'responsible member, of an entity, means:',
      paragraphs: [
        { letter: 'a', text: 'an individual member of the entity’s principal governing body who is authorised to sign modern slavery statements for the purposes of this Act; or' },
        { letter: 'b', text: 'if the entity is a trust administered by a sole trustee—that trustee; or' },
        { letter: 'c', text: 'if the entity is a corporation sole—the individual constituting the corporation; or' },
        { letter: 'd', text: 'if the entity is under administration within the meaning of the Corporations Act 2001—the administrator; or' },
        { letter: 'e', text: 'if the entity is of a kind prescribed by rules made for the purposes of this paragraph—a prescribed member of the entity.' },
      ],
    })
  })
  it('AU_MSA_DEF_REPORTING_PERIOD', () => {
    expect(R.AU_MSA_DEF_REPORTING_PERIOD).toBe('reporting period, of an entity, means a financial year, or another annual accounting period applicable to the entity, which starts after the commencement of this section.')
  })
})

describe('GUIDANCE: Commonwealth Modern Slavery Act 2018, Guidance for Reporting Entities (May 2023)', () => {
  it('AU_GUIDANCE_THRESHOLD', () => {
    expect(R.AU_GUIDANCE_THRESHOLD).toBe('The reporting requirement applies to commercial and not for profit entities with annual consolidated revenue of at least AU$100 million.')
  })
  it('AU_GUIDANCE_SEVEN_CRITERIA', () => {
    expect(R.AU_GUIDANCE_SEVEN_CRITERIA).toBe('The Act sets out seven mandatory criteria for the content of statements.')
  })
  it('AU_GUIDANCE_HEADINGS', () => {
    expect(R.AU_GUIDANCE_HEADINGS).toBe('If you are unsure about how to structure your statement, you can use each of the seven criteria as topic headings.')
  })
  it('AU_GUIDANCE_DEADLINE', () => {
    expect(R.AU_GUIDANCE_DEADLINE).toBe('You will also need to submit your statement to the Attorney-General’s Department via the online central register within six months after the end of your reporting period.')
  })
  it('AU_GUIDANCE_PUBLISH', () => {
    expect(R.AU_GUIDANCE_PUBLISH).toBe('All statements must be published on the central register. However, you can also choose to publish your statement in other ways, including on your website or in your annual report.')
  })
  it('AU_GUIDANCE_REFUSE', () => {
    expect(R.AU_GUIDANCE_REFUSE).toBe('The Minister may refuse to publish your statement if it does not meet all the requirements under the Act.')
  })
  it('AU_GUIDANCE_NAMING', () => {
    expect(R.AU_GUIDANCE_NAMING).toBe('Under the Act, the Government has the power to publicly name entities that fail to comply with the reporting requirement.')
  })
  it('AU_GUIDANCE_PERSONAL_INFORMATION_DO_NOT', () => {
    expect(R.AU_GUIDANCE_PERSONAL_INFORMATION_DO_NOT).toEqual([
      'report on the allegation or case if doing so could put the victim at risk',
      'provide the name, age, or other personal information about the victim',
      'breach any privacy obligations that may apply to the collection and disclosure of personal data.',
    ])
  })
})

describe('GUIDANCE: Supplementary guidance, principal governing body approval and signature of a responsible member (March 2026)', () => {
  it('AU_GUIDANCE_PGB_NO_DELEGATION', () => {
    expect(R.AU_GUIDANCE_PGB_NO_DELEGATION).toBe('The Act does not permit delegation of approval authority, including to an Individual, Executive Committee, Sub- Committee, or Work group. A statement will not be published if approval is not provided by the principal governing body or if it is unclear that approval has been provided.')
  })
  it('AU_GUIDANCE_PGB_DATE', () => {
    expect(R.AU_GUIDANCE_PGB_DATE).toBe('The Act does not require the date of approval to be included in the statement, but it is recommended that statements include the approval date as good practice.')
  })
  it('AU_GUIDANCE_SIGNATURE_NOT_PUBLISHED', () => {
    expect(R.AU_GUIDANCE_SIGNATURE_NOT_PUBLISHED).toBe('A statement will not be published if it has not been clearly signed by a responsible member of the entity.')
  })
  it('AU_GUIDANCE_SIGNATURE_INCLUDES', () => {
    expect(R.AU_GUIDANCE_SIGNATURE_INCLUDES).toEqual({
      leadIn: 'It is important to ensure that approval from a responsible member shows that individual has the authority to approve the statement and includes:',
      items: [
        'The approver’s name',
        'The approver’s title or position (e.g. CEO, Director, member of the board)',
        'A copy of their signature or wording to explicitly show their approval of the statement.',
      ],
    })
  })
  it('AU_GUIDANCE_SIGNATURE_IN_STATEMENT', () => {
    expect(R.AU_GUIDANCE_SIGNATURE_IN_STATEMENT).toBe('Entities should ensure the approval of a responsible member is included in the statement and not in an external document.')
  })
})

describe('REGISTER GUIDANCE: Modern Slavery Statement Annexure (undated; PDF created 27 Jul 2021)', () => {
  it('AU_REGISTER_ANNEX_TITLE', () => {
    expect(R.AU_REGISTER_ANNEX_TITLE).toBe('MODERN SLAVERY ACT 2018 (CTH) – STATEMENT ANNEXURE')
  })
  it('AU_REGISTER_ANNEX_APPROVAL', () => {
    expect(R.AU_REGISTER_ANNEX_APPROVAL).toEqual({
      heading: 'Principal Governing Body Approval',
      segments: [
        'This modern slavery statement was approved by the principal governing body of',
        'as defined by the Modern Slavery Act 2018 (Cth) (“the Act”) on',
      ],
    })
  })
  it('AU_REGISTER_ANNEX_SIGNATURE', () => {
    expect(R.AU_REGISTER_ANNEX_SIGNATURE).toEqual({
      heading: 'Signature of Responsible Member',
      segments: [
        'This modern slavery statement is signed by a responsible member of',
        'as defined by the Act:',
      ],
    })
  })
  it('AU_REGISTER_ANNEX_CRITERIA_INTRO', () => {
    expect(R.AU_REGISTER_ANNEX_CRITERIA_INTRO).toBe('Please indicate the page number/s of your statement that addresses each of the mandatory criteria in section 16 of the Act:')
  })
  it('AU_REGISTER_ANNEX_CRITERIA_COLUMNS', () => {
    expect(R.AU_REGISTER_ANNEX_CRITERIA_COLUMNS).toEqual([
      'Mandatory criteria',
      'Page number/s',
    ])
  })
  it('AU_REGISTER_ANNEX_CRITERIA', () => {
    expect(R.AU_REGISTER_ANNEX_CRITERIA).toEqual({
      leadIn: 'Mandatory criteria',
      paragraphs: [
        { letter: 'a', text: 'Identify the reporting entity.' },
        { letter: 'b', text: 'Describe the reporting entity’s structure, operations and supply chains.' },
        { letter: 'c', text: 'Describe the risks of modern slavery practices in the operations and supply chains of the reporting entity and any entities it owns or controls.' },
        { letter: 'd', text: 'Describe the actions taken by the reporting entity and any entities it owns or controls to assess and address these risks, including due diligence and remediation processes.' },
        { letter: 'e', text: 'Describe how the reporting entity assesses the effectiveness of these actions.' },
        { letter: 'f', text: 'Describe the process of consultation on the development of the statement with any entities the reporting entity owns or controls (a joint statement must also describe consultation with the entity covered by the statement).*' },
        { letter: 'g', text: 'Any other information that the reporting entity, or the entity giving the statement, considers relevant.**' },
      ],
    })
  })
  it('AU_REGISTER_ANNEX_NOTE_F', () => {
    expect(R.AU_REGISTER_ANNEX_NOTE_F).toBe('If your entity does not own or control any other entities and you are not submitting a joint statement, please include the statement ‘Do not own or control any other entities’ instead of a page number.')
  })
  it('AU_REGISTER_ANNEX_NOTE_G', () => {
    expect(R.AU_REGISTER_ANNEX_NOTE_G).toBe('You are not required to include information for this criterion if you consider your responses to the other six criteria are sufficient.')
  })
})

describe('REGISTER GUIDANCE: Modern Slavery Statements Register, submission process overview (August 2025)', () => {
  it('AU_SUBMISSION_PDF', () => {
    expect(R.AU_SUBMISSION_PDF).toBe('Upload one PDF statement (max 400MB; searchable PDF recommended).')
  })
  it('AU_SUBMISSION_SUPPORTING', () => {
    expect(R.AU_SUBMISSION_SUPPORTING).toBe('Supporting documents will not be made public.')
  })
  it('AU_SUBMISSION_CATEGORIES', () => {
    expect(R.AU_SUBMISSION_CATEGORIES).toBe('This page displays the three categories under which entities can submit a Modern Slavery Statement in accordance with the Act.')
  })
  it('AU_SUBMISSION_VOLUNTARY_NOTICE', () => {
    expect(R.AU_SUBMISSION_VOLUNTARY_NOTICE).toBe('Once selected, you will be prompted to confirm whether a voluntary notice has been submitted. As required under subsection 6(1) of the Act, this notice must be lodged before the end of the reporting period.')
  })
  it('AU_SUBMISSION_ENTITY_IDS', () => {
    expect(R.AU_SUBMISSION_ENTITY_IDS).toEqual([
      'For each entity, you must provide the ABN or ACN. This information will be validated, and the entity name will be auto-filled.',
      'If you enter an ARBN or select Other, you will need to manually enter the entity’s name.',
    ])
  })
  it('AU_SUBMISSION_REVENUE_DECLARATION', () => {
    expect(R.AU_SUBMISSION_REVENUE_DECLARATION).toBe('For each entity, you will be asked to confirm whether the annual consolidated revenue is over AU$100 million. Your answer determines whether the entity is a reporting entity with obligations under the Act, or an ‘other’ entity included in the statement.')
  })
  it('AU_SUBMISSION_COUNTRY_SECTOR', () => {
    expect(R.AU_SUBMISSION_COUNTRY_SECTOR).toBe('The country and industry sector questions must be completed for each reporting entity and the parent entity.')
  })
  it('AU_SUBMISSION_TYPE_CHECK', () => {
    expect(R.AU_SUBMISSION_TYPE_CHECK).toBe('For example, if you selected a single statement in Step 1 but included more than one entity with annual consolidated revenue over AU$100 million, an error notification will appear.')
  })
  it('AU_SUBMISSION_ALL_ENTITIES', () => {
    expect(R.AU_SUBMISSION_ALL_ENTITIES).toBe('Please ensure that all entities covered by the Modern Slavery Statement are included, helping to maintain complete and accurate reporting and supporting ongoing compliance.')
  })
  it('AU_SUBMISSION_REPORTING_PERIOD', () => {
    expect(R.AU_SUBMISSION_REPORTING_PERIOD).toEqual([
      'Please select the start date of your reporting period. The end date will be automatically calculated by adding 12 months. You can adjust the end date if needed.',
      'The selected reporting period will be compared with the most recent submitted or published statement for your entity. The system will alert you if any gaps, overlaps or duplicate periods are detected.',
    ])
  })
  it('AU_SUBMISSION_PERIOD_DISCREPANCY', () => {
    expect(R.AU_SUBMISSION_PERIOD_DISCREPANCY).toEqual({
      leadIn: 'If any discrepancy is identified, to proceed with your submission, you must either:',
      items: [
        'revise the reporting period, or',
        'provide additional information to explain the issue flagged by the system.',
      ],
    })
  })
  it('AU_SUBMISSION_ONE_PDF', () => {
    expect(R.AU_SUBMISSION_ONE_PDF).toBe('You can upload only one PDF file for the Modern Slavery Statement.')
  })
  it('AU_SUBMISSION_SUPPORTING_OPTIONAL', () => {
    expect(R.AU_SUBMISSION_SUPPORTING_OPTIONAL).toBe('Supporting documents are optional, and you may upload multiple PDF files.')
  })
  it('AU_SUBMISSION_APPROVED_PUBLISHED', () => {
    expect(R.AU_SUBMISSION_APPROVED_PUBLISHED).toBe('Approved Modern Slavery Statements will be published on the register.')
  })
  it('AU_SUBMISSION_SCREEN_INTRO', () => {
    expect(R.AU_SUBMISSION_SCREEN_INTRO).toBe('Under the Commonwealth Modern Slavery Act 2018, Australian entities, or any entity that carries on business in Australia, with an annual consolidated revenue of at least AU$100 million are required to submit a Modern Slavery Statement for each reporting period. A statement must set out the reporting entity\'s actions to assess and address modern slavery risks in their global operations and supply chains.')
  })
  it('AU_SUBMISSION_STATEMENT_TYPES', () => {
    expect(R.AU_SUBMISSION_STATEMENT_TYPES).toEqual([
      { name: 'Single statement', text: 'A single statement applies to one entity with annual consolidated revenue of at least AU$100 million.' },
      { name: 'Joint statement', text: 'A joint statement applies to two or more entities, each with annual consolidated revenue of at least AU$100 million.' },
      { name: 'Voluntary statement', text: 'A voluntary statement applies to entities that do not meet the AU$100 million annual consolidated revenue threshold but elect to comply with the Act\'s reporting requirements.' },
    ])
  })
})
