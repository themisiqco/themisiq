// Every string in lib/forcedLabour/uk/requirements.ts, pinned. Each was checked, on 1 Oct 2026, to appear word
// for word in the source it is attributed to. A change to one is a change someone has to make twice, on
// purpose. Where a source is later found to differ, update the constant AND the date it was read.

import { describe, it, expect } from 'vitest'
import * as R from './requirements'
import {
  MODERN_SLAVERY_UK_S54_URL, UK_TISC_REGULATIONS_URL, UK_TISC_GUIDANCE_URL, UK_MSS_PUBLISH_GUIDANCE_URL,
  UK_MSS_REGISTRY_GUIDANCE_URL,
} from '../../sources'


describe('provenance', () => {
  it('names each source by host and path, and the dates it was read at', () => {
    // The host and the path, not the URL retyped: a regulatory link belongs in lib/sources.ts only.
    expect(R.UK_MSA_S54_SOURCE_URL).toBe(MODERN_SLAVERY_UK_S54_URL)
    expect(new URL(R.UK_MSA_S54_SOURCE_URL).hostname).toBe('www.legislation.gov.uk')
    expect(R.UK_MSA_S54_SOURCE_URL).toMatch(/\/ukpga\/2015\/30\/section\/54$/)
    expect(R.UK_REGS_SOURCE_URL).toBe(UK_TISC_REGULATIONS_URL)
    expect(R.UK_REGS_SOURCE_URL).toMatch(/\/uksi\/2015\/1833$/)
    expect(R.UK_GUIDANCE_SOURCE_URL).toBe(UK_TISC_GUIDANCE_URL)
    expect(new URL(R.UK_GUIDANCE_SOURCE_URL).hostname).toBe('www.gov.uk')
    expect(R.UK_GOVUK_PUBLISH_SOURCE_URL).toBe(UK_MSS_PUBLISH_GUIDANCE_URL)
    expect(R.UK_REGISTRY_GUIDANCE_SOURCE_URL).toBe(UK_MSS_REGISTRY_GUIDANCE_URL)
    expect(R.UK_REQUIREMENTS_VERIFIED).toBe('2026-10-01')
    expect(R.UK_MSA_S54_IN_FORCE).toBe('2015-10-29')
    expect(R.UK_MSA_S54_LAST_AMENDED).toBe('2016-12-17')
    expect(R.UK_GUIDANCE_PAGE_UPDATED).toBe('2025-12-01')
    expect(R.UK_GOVUK_PUBLISH_PAGE_UPDATED).toBe('2024-04-25')
  })
})

describe('statute and guidance are kept apart', () => {
  const names = Object.keys(R)
  it('every exported quotation is prefixed with the kind of source it comes from', () => {
    const unlabelled = names.filter(n => !/^UK_(MSA_|REGS_|GUIDANCE_|GOVUK_|REGISTRY_|REQUIREMENTS_VERIFIED$)/.test(n))
    expect(unlabelled).toEqual([])
  })
  it('the content areas are "may include" in the Act, and the six months is a "should"', () => {
    expect(R.UK_MSA_S54_5.leadIn).toContain('may include')
    expect(R.UK_GUIDANCE_WHEN).toContain('should')
    expect(names.some(n => n.startsWith('UK_MSA_') && /DEADLINE|WHEN/.test(n))).toBe(false)
  })
})

describe('STATUTE: Modern Slavery Act 2015, section 54', () => {
  it('UK_MSA_S54_1', () => {
    expect(R.UK_MSA_S54_1).toBe('A commercial organisation within subsection (2) must prepare a slavery and human trafficking statement for each financial year of the organisation.')
  })
  it('UK_MSA_S54_2', () => {
    expect(R.UK_MSA_S54_2).toEqual({
      leadIn: 'A commercial organisation is within this subsection if it—',
      paragraphs: [
        { letter: 'a', text: 'supplies goods or services, and' },
        { letter: 'b', text: 'has a total turnover of not less than an amount prescribed by regulations made by the Secretary of State.' },
      ],
    })
  })
  it('UK_MSA_S54_3', () => {
    expect(R.UK_MSA_S54_3).toBe('For the purposes of subsection (2)(b), an organisation\'s total turnover is to be determined in accordance with regulations made by the Secretary of State.')
  })
  it('UK_MSA_S54_4', () => {
    expect(R.UK_MSA_S54_4).toEqual({
      leadIn: 'A slavery and human trafficking statement for a financial year is—',
      paragraphs: [
        { letter: 'a', text: 'a statement of the steps the organisation has taken during the financial year to ensure that slavery and human trafficking is not taking place—', sub: [
          { numeral: 'i', text: 'in any of its supply chains, and' },
          { numeral: 'ii', text: 'in any part of its own business, or' },
        ] },
        { letter: 'b', text: 'a statement that the organisation has taken no such steps.' },
      ],
    })
  })
  it('UK_MSA_S54_5', () => {
    expect(R.UK_MSA_S54_5).toEqual({
      leadIn: 'An organisation\'s slavery and human trafficking statement may include information about—',
      paragraphs: [
        { letter: 'a', text: 'the organisation\'s structure, its business and its supply chains;' },
        { letter: 'b', text: 'its policies in relation to slavery and human trafficking;' },
        { letter: 'c', text: 'its due diligence processes in relation to slavery and human trafficking in its business and supply chains;' },
        { letter: 'd', text: 'the parts of its business and supply chains where there is a risk of slavery and human trafficking taking place, and the steps it has taken to assess and manage that risk;' },
        { letter: 'e', text: 'its effectiveness in ensuring that slavery and human trafficking is not taking place in its business or supply chains, measured against such performance indicators as it considers appropriate;' },
        { letter: 'f', text: 'the training about slavery and human trafficking available to its staff.' },
      ],
    })
  })
  it('UK_MSA_S54_6', () => {
    expect(R.UK_MSA_S54_6).toEqual({
      leadIn: 'A slavery and human trafficking statement—',
      paragraphs: [
        { letter: 'a', text: 'if the organisation is a body corporate other than a limited liability partnership, must be approved by the board of directors (or equivalent management body) and signed by a director (or equivalent);' },
        { letter: 'b', text: 'if the organisation is a limited liability partnership, must be approved by the members and signed by a designated member;' },
        { letter: 'c', text: 'if the organisation is a limited partnership registered under the Limited Partnerships Act 1907, must be signed by a general partner;' },
        { letter: 'd', text: 'if the organisation is any other kind of partnership, must be signed by a partner.' },
      ],
    })
  })
  it('UK_MSA_S54_7', () => {
    expect(R.UK_MSA_S54_7).toEqual({
      leadIn: 'If the organisation has a website, it must—',
      paragraphs: [
        { letter: 'a', text: 'publish the slavery and human trafficking statement on that website, and' },
        { letter: 'b', text: 'include a link to the slavery and human trafficking statement in a prominent place on that website\'s homepage.' },
      ],
    })
  })
  it('UK_MSA_S54_8', () => {
    expect(R.UK_MSA_S54_8).toBe('If the organisation does not have a website, it must provide a copy of the slavery and human trafficking statement to anyone who makes a written request for one, and must do so before the end of the period of 30 days beginning with the day on which the request is received.')
  })
  it('UK_MSA_S54_9', () => {
    expect(R.UK_MSA_S54_9).toEqual({
      leadIn: 'The Secretary of State—',
      paragraphs: [
        { letter: 'a', text: 'may issue guidance about the duties imposed on commercial organisations by this section;' },
        { letter: 'b', text: 'must publish any such guidance in a way the Secretary of State considers appropriate.' },
      ],
    })
  })
  it('UK_MSA_S54_10', () => {
    expect(R.UK_MSA_S54_10).toBe('The guidance may in particular include further provision about the kind of information which may be included in a slavery and human trafficking statement.')
  })
  it('UK_MSA_S54_11', () => {
    expect(R.UK_MSA_S54_11).toBe('The duties imposed on commercial organisations by this section are enforceable by the Secretary of State bringing civil proceedings in the High Court for an injunction or, in Scotland, for specific performance of a statutory duty under section 45 of the Court of Session Act 1988.')
  })
  it('UK_MSA_S54_12_COMMERCIAL_ORGANISATION', () => {
    expect(R.UK_MSA_S54_12_COMMERCIAL_ORGANISATION).toEqual({
      leadIn: '“commercial organisation” means—',
      items: [
        'a body corporate (wherever incorporated) which carries on a business, or part of a business, in any part of the United Kingdom, or',
        'a partnership (wherever formed) which carries on a business, or part of a business, in any part of the United Kingdom,',
      ],
      tail: 'and for this purpose “business” includes a trade or profession;',
    })
  })
  it('UK_MSA_S54_12_PARTNERSHIP', () => {
    expect(R.UK_MSA_S54_12_PARTNERSHIP).toEqual({
      leadIn: '“partnership” means—',
      items: [
        'a partnership within the Partnership Act 1890,',
        'a limited partnership registered under the Limited Partnerships Act 1907, or',
        'a firm, or an entity of a similar character, formed under the law of a country outside the United Kingdom;',
      ],
    })
  })
})

describe('STATUTE: The Modern Slavery Act 2015 (Transparency in Supply Chains) Regulations 2015 (SI 2015/1833)', () => {
  it('UK_REGS_1_2_B', () => {
    expect(R.UK_REGS_1_2_B).toBe('“subsidiary undertaking” has the meaning given by section 1162 of the Companies Act 2006.')
  })
  it('UK_REGS_2', () => {
    expect(R.UK_REGS_2).toBe('The amount of total turnover prescribed for the purposes of section 54(2)(b) of the 2015 Act is £36 million.')
  })
  it('UK_REGS_3_1', () => {
    expect(R.UK_REGS_3_1).toEqual({
      leadIn: 'For the purposes of section 54(2)(b) of the 2015 Act the total turnover of a commercial organisation is—',
      paragraphs: [
        { letter: 'a', text: 'the turnover of that organisation; and' },
        { letter: 'b', text: 'the turnover of any of its subsidiary undertakings.' },
      ],
    })
  })
  it('UK_REGS_3_2', () => {
    expect(R.UK_REGS_3_2).toEqual({
      leadIn: 'In paragraph (1), “turnover” means the amount derived from the provision of goods and services falling within the ordinary activities of the commercial organisation or subsidiary undertaking, after deduction of—',
      paragraphs: [
        { letter: 'a', text: 'trade discounts;' },
        { letter: 'b', text: 'value added tax; and' },
        { letter: 'c', text: 'any other taxes based on the amounts so derived.' },
      ],
    })
  })
})

describe('STATUTORY GUIDANCE: Transparency in supply chains: a practical guide (Home Office)', () => {
  it('UK_GUIDANCE_WHO', () => {
    expect(R.UK_GUIDANCE_WHO).toEqual({
      leadIn: 'Any commercial organisation in any part of a group structure will be required to comply with the provision and produce a statement if they meet all of the following criteria:',
      items: [
        'are a body corporate or a partnership (described as an “organisation” in this document), wherever incorporated',
        'carry on a business, or part of a business, in the UK',
        'supply goods or services',
        'have an annual turnover of £36 million or more',
      ],
    })
  })
  it('UK_GUIDANCE_DETERMINE', () => {
    expect(R.UK_GUIDANCE_DETERMINE).toBe('Organisations are responsible for determining whether the legislation applies to them. You may wish to seek legal advice to decide if your organisation needs to produce an annual statement.')
  })
  it('UK_GUIDANCE_TURNOVER_SUBSIDIARIES', () => {
    expect(R.UK_GUIDANCE_TURNOVER_SUBSIDIARIES).toBe('the turnover of any of its subsidiary undertakings (including those operating wholly outside the UK).')
  })
  it('UK_GUIDANCE_PRESENCE', () => {
    expect(R.UK_GUIDANCE_PRESENCE).toBe('If your organisation has a demonstrable business presence in the UK and you meet the other criteria, you should publish an annual statement.')
  })
  it('UK_GUIDANCE_NO_STEPS', () => {
    expect(R.UK_GUIDANCE_NO_STEPS).toBe('This means that if an organisation has taken no steps to ensure modern slavery is not taking place, they must still publish a statement stating this to be the case.')
  })
  it('UK_GUIDANCE_GROUP_ONE_STATEMENT', () => {
    expect(R.UK_GUIDANCE_GROUP_ONE_STATEMENT).toBe('Where a parent organisation and one or more subsidiaries in the same group are required to produce a statement, the parent organisation may produce one statement that subsidiaries can use to meet this requirement (provided that the statement fully covers the steps that each of the organisations required to produce a statement have taken in the relevant financial year).')
  })
  it('UK_GUIDANCE_GROUP_STATEMENT', () => {
    expect(R.UK_GUIDANCE_GROUP_STATEMENT).toEqual({
      leadIn: 'If a group chooses to publish one statement, it:',
      items: [
        'must cover the steps taken to prevent modern slavery in all the organisations within that group that meet the criteria, and their supply chains',
        'should clearly name the parent and subsidiary organisations it is covering',
        'should be published on the UK websites of all the organisations covered by the statement',
      ],
    })
  })
  it('UK_GUIDANCE_CONTENT_AREAS', () => {
    expect(R.UK_GUIDANCE_CONTENT_AREAS).toEqual({
      leadIn: 'Section 54(5) of the Modern Slavery Act 2015 sets out the content that may be included in a modern slavery statement:',
      items: [
        'organisational structure, its business and its supply chains',
        'organisational policies',
        'assessing and managing risk',
        'due diligence in relation to modern slavery (including approach to remediation)',
        'training',
        'monitoring and evaluation (understanding and demonstrating effectiveness)',
      ],
    })
  })
  it('UK_GUIDANCE_APPROVAL', () => {
    expect(R.UK_GUIDANCE_APPROVAL).toBe('For a body corporate (other than a limited liability partnership), the statement must be approved by the board of directors and signed by a director (or equivalent). Where this is the case, it is best practice for the director who signs the statement to also sit on the board that approved the statement.')
  })
  it('UK_GUIDANCE_APPROVAL_DATE', () => {
    expect(R.UK_GUIDANCE_APPROVAL_DATE).toBe('It is best practice for the statement to include the date on which the board or members approved the statement.')
  })
  it('UK_GUIDANCE_PLAIN_LANGUAGE', () => {
    expect(R.UK_GUIDANCE_PLAIN_LANGUAGE).toBe('To aid transparency, the statement should be written in simple language that is easily understood (the Plain English Campaign is well placed to assist with this).')
  })
  it('UK_GUIDANCE_LANGUAGE', () => {
    expect(R.UK_GUIDANCE_LANGUAGE).toBe('the statement should be in English but may also be provided in other languages, relevant to the organisation’s business and supply chains')
  })
  it('UK_GUIDANCE_PUBLISH', () => {
    expect(R.UK_GUIDANCE_PUBLISH).toBe('Section 54(7) requires each organisation to publish a modern slavery statement on their website and include a link in a prominent place on its homepage.')
  })
  it('UK_GUIDANCE_PROMINENT', () => {
    expect(R.UK_GUIDANCE_PROMINENT).toBe('A prominent place may mean a modern slavery link that is directly visible on the home page or part of an obvious drop-down menu on that page.')
  })
  it('UK_GUIDANCE_REGISTRY', () => {
    expect(R.UK_GUIDANCE_REGISTRY).toBe('The government encourages all organisations to upload their modern slavery statements to the modern slavery statement registry.')
  })
  it('UK_GUIDANCE_WHEN', () => {
    expect(R.UK_GUIDANCE_WHEN).toBe('Organisations should publish their statement as soon as possible after their financial year end. This should be, at most, within six months of the organisation’s financial year end.')
  })
  it('UK_GUIDANCE_FAILURE', () => {
    expect(R.UK_GUIDANCE_FAILURE).toEqual([
      'If a business fails to produce a modern slavery statement for a particular financial year, the Secretary of State may bring civil proceedings in the High Court for an injunction or, in Scotland, for specific performance of a statutory duty under section 45 of the Court of Session Act 1988 requiring the organisation to comply.',
      'If the organisation fails to comply with the injunction, they will be in contempt of a court order, which is punishable with an unlimited fine.',
    ])
  })
})

describe('GOV.UK SERVICE GUIDANCE: Publish an annual modern slavery statement; the statement registry', () => {
  it('UK_GOVUK_SIX_AREAS', () => {
    expect(R.UK_GOVUK_SIX_AREAS).toEqual({
      leadIn: 'The Modern Slavery Act recommends that you cover the following 6 areas in your statement:',
      items: [
        'Organisation structure and supply chains',
        'Policies in relation to slavery and human trafficking',
        'Due diligence processes',
        'Risk assessment and management',
        'Key performance indicators to measure effectiveness of steps being taken',
        'Training on modern slavery and trafficking',
      ],
    })
  })
  it('UK_GOVUK_APPROVAL_STATEMENT', () => {
    expect(R.UK_GOVUK_APPROVAL_STATEMENT).toBe('To demonstrate that you have met this legal requirement, your statement should clearly state that board approval has been given with the date of approval.')
  })
  it('UK_GOVUK_SIGN_OFF', () => {
    expect(R.UK_GOVUK_SIGN_OFF).toBe('Include their name, job title and the date. You do not need to include a physical signature, but you should still clearly state that it has been signed.')
  })
  it('UK_GOVUK_WHEN', () => {
    expect(R.UK_GOVUK_WHEN).toBe('Statutory guidance states that you should do this within 6 months of your organisation’s financial year-end. You should also include the date your financial year ended.')
  })
  it('UK_GOVUK_REGISTRY_QUESTIONS', () => {
    expect(R.UK_GOVUK_REGISTRY_QUESTIONS).toBe('These questions are optional, however you are encouraged to answer all questions as fully as possible, to help improve understanding of modern slavery risks and best practice.')
  })
  it('UK_GOVUK_CHANGES_NOT_IN_EFFECT', () => {
    expect(R.UK_GOVUK_CHANGES_NOT_IN_EFFECT).toBe('These changes have not yet come into effect and organisations should continue to report under the current requirements set out on this page.')
  })
  it('UK_REGISTRY_SERVICE', () => {
    expect(R.UK_REGISTRY_SERVICE).toBe('This service allows you to add your modern slavery statement to the government-run online modern slavery statement registry.')
  })
})
