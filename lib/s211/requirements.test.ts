import { describe, it, expect } from 'vitest'
import {
  S211_ATTESTATION_EXAMPLE, S211_ATTESTATION_INTRO, S211_ATTESTATION_SIGNATURE_BLOCK, S211_STEPS_REQUIREMENT,
  S211_LETTERED_REQUIREMENTS, S211_REPORT_REQUIREMENTS, S211_ENTITY_DEFINITION, S211_GUIDANCE_REPORTING_OBLIGATION,
  S211_ACT_SECTION_11_1, S211_ACT_SECTION_11_3, S211_ACT_SECTION_10_1, S211_ACT_CURRENT_TO, S211_ACT_LAST_AMENDED,
  S211_GUIDANCE_SOURCE_URL, S211_GUIDANCE_VERIFIED, S211_GUIDANCE_PAGE_MODIFIED,
} from './requirements'
import { S211_GUIDANCE_URL, S211_TEMPLATE_URL } from '../sources'
import * as R from './requirements'

// These strings were copied from Public Safety Canada's "Guidance for entities" on 30 Sep 2026 and
// checked, that day, to appear word for word in the downloaded page. They are pinned here so that a
// later edit to lib/s211/requirements.ts is a change someone has to make twice, on purpose.

describe('provenance', () => {
  it('names its source, the date it was read, and the page date it was read at', () => {
    expect(S211_GUIDANCE_SOURCE_URL).toBe(S211_GUIDANCE_URL)
    // The host and the page, not the URL retyped: a regulatory link belongs in lib/sources.ts only, and
    // lib/sources.test.ts fails on a second copy of one, this file included.
    expect(new URL(S211_GUIDANCE_URL).hostname).toBe('www.publicsafety.gc.ca')
    expect(S211_GUIDANCE_URL).toMatch(/\/frcd-lbr-cndn-spply-chns\/prpr-rprt-en\.aspx$/)
    expect(S211_GUIDANCE_VERIFIED).toBe('2026-09-30')
    expect(S211_GUIDANCE_PAGE_MODIFIED).toBe('2025-12-18')
  })
})

describe('the example attestation', () => {
  it('is the page text, word for word', () => {
    expect(S211_ATTESTATION_EXAMPLE).toBe(
      'In accordance with the requirements of the Fighting Against Forced Labour and Child Labour in Supply Chains Act (Act), and in particular section 11 thereof, I, in the capacity of [title], attest that I have reviewed the information contained in the report on behalf of the governing body of the entity [or entities] listed above. Based on my knowledge, and having exercised reasonable diligence, I attest that the information in the report is true, accurate and complete in all material respects for the purposes of the Act, for the reporting year listed within this report.')
  })

  it('is offered as an example, and is not the wording the module was first briefed with', () => {
    expect(S211_ATTESTATION_INTRO).toBe('The following may be used as an example:')
    expect(S211_ATTESTATION_EXAMPLE).toContain('I, in the capacity of [title], attest')
    expect(S211_ATTESTATION_EXAMPLE).toContain('on behalf of the governing body of the entity [or entities] listed above')
    expect(S211_ATTESTATION_EXAMPLE).toContain('for the reporting year listed within this report.')
    expect(S211_ATTESTATION_EXAMPLE).not.toContain('for the reporting year listed above')
    expect(S211_ATTESTATION_EXAMPLE).not.toContain('for the entity or entities listed above')
  })

  it('the signature block: four lines, the last as published', () => {
    expect([...S211_ATTESTATION_SIGNATURE_BLOCK]).toEqual([
      'Full name', 'Title', 'Date', 'Signature, accompanied by the statement "I have the authority to bind \'Name of Entity.\'',
    ])
  })
})

describe('the eight report requirements', () => {
  it('one general requirement and seven lettered (a) to (g), in the page order', () => {
    expect(S211_REPORT_REQUIREMENTS).toHaveLength(8)
    expect(S211_REPORT_REQUIREMENTS[0]).toBe(S211_STEPS_REQUIREMENT)
    expect(S211_LETTERED_REQUIREMENTS.map(r => r.letter).join('')).toBe('abcdefg')
  })

  it('each is the page text, word for word', () => {
    expect([...S211_REPORT_REQUIREMENTS]).toEqual([
      'Entities must describe in their annual reports the steps taken during its previous financial year to prevent and reduce the risk that forced labour or child labour is used at any step of the production of goods in Canada or elsewhere by the entity or of goods imported into Canada by the entity.',
      'Its structure, activities and supply chains',
      'Its policies and due diligence processes in relation to forced labour and child labour',
      'The parts of its business and supply chains that carry a risk of forced labour or child labour being used and the steps it has taken to assess and manage that risk',
      'Any measures taken to remediate any forced labour or child labour',
      'Any measures taken to remediate the loss of income to the most vulnerable families that results from any measure taken to eliminate the use of forced labour or child labour in its activities and supply chains',
      'The training provided to employees on forced labour and child labour',
      'How the entity assesses its effectiveness in ensuring that forced labour and child labour are not being used in its business and supply chains',
    ])
    expect(S211_LETTERED_REQUIREMENTS.map(r => r.title)).toEqual([
      'Structure, activities and supply chains', 'Policies and due diligence processes', 'Forced labour and child labour risks',
      'Remediation measures', 'Remediation of loss of income', 'Training', 'Assessing effectiveness',
    ])
  })
})

describe('the entity definition and the reporting obligation', () => {
  it('three routes, the second with three conditions, word for word', () => {
    expect(S211_ENTITY_DEFINITION.leadIn).toBe('The Act defines an entity as a corporation or a trust, partnership or other unincorporated organization that:')
    expect([...S211_ENTITY_DEFINITION.routes]).toEqual([
      'is listed on a stock exchange in Canada;',
      'has a place of business in Canada, does business in Canada or has assets in Canada and that, based on its consolidated financial statements, meets at least two of the following conditions for at least one of its two most recent financial years:',
      'is prescribed by regulations.',
    ])
    expect([...S211_ENTITY_DEFINITION.conditions]).toEqual([
      'it has at least $20 million in assets,', 'it has generated at least $40 million in revenue, and', 'it employs an average of at least 250 employees; or',
    ])
  })

  it('the guidance Step 2 is recorded under a name that says it is guidance', () => {
    expect([...S211_GUIDANCE_REPORTING_OBLIGATION.activities]).toEqual([
      'produce goods in Canada or elsewhere;', 'import goods produced outside Canada; or', 'control another entity that produces or imports goods.',
    ])
    expect(S211_GUIDANCE_REPORTING_OBLIGATION.after).toBe('If an organization is not involved in any of the prescribed activities, then it does not need to report, even if it meets the definition of entity.')
  })
})

describe('the Act, recorded beside the guidance', () => {
  it('the page state it was read at', () => {
    expect([S211_ACT_CURRENT_TO, S211_ACT_LAST_AMENDED]).toEqual(['2026-09-21', '2024-01-01'])
  })

  it('s.11(1) and s.11(3), word for word, and the two places they differ from the guidance', () => {
    expect(S211_ACT_SECTION_11_1).toMatch(/^Every entity must, on or before May 31 of each year, report to the Minister on the steps the entity has taken during its previous financial year/)
    expect(S211_ACT_SECTION_11_3.paragraphs.map(p => p.letter).join('')).toBe('abcdefg')
    expect(S211_ACT_SECTION_11_3.paragraphs[1].text).toBe('its policies and its due diligence processes in relation to forced labour and child labour;')
    expect(S211_LETTERED_REQUIREMENTS[1].text).toBe('Its policies and due diligence processes in relation to forced labour and child labour')
    // Apart from that second "its", each paragraph is the guidance item with a lower-case first letter and the Act's punctuation.
    S211_ACT_SECTION_11_3.paragraphs.forEach((p, i) => {
      if (i === 1) return
      const g = S211_LETTERED_REQUIREMENTS[i].text
      expect(p.text.replace(/(; and|[;.])$/, '')).toBe(g.charAt(0).toLowerCase() + g.slice(1))
    })
  })

  it('s.10(1) on control', () => {
    expect(S211_ACT_SECTION_10_1).toBe('For the purposes of this Part and subject to the regulations, an entity is controlled by another entity if it is directly or indirectly controlled by that other entity in any manner.')
  })
})

// ── Stage 2a (30 Sep 2026): what the report builder quotes ────────────────────────────────────────
// Every string below was copied from the downloaded page text by a script and checked word for word
// the same day. These pins make a later edit a visible act; the source check is the provenance.
describe('the Act: definitions and the approval subsections, with the Act\'s lettering', () => {
  it('forced labour and child labour, s.2', () => {
    expect(R.S211_ACT_DEFINITION_FORCED_LABOUR.leadIn).toBe('forced labour means labour or service provided or offered to be provided by a person under circumstances that')
    expect(R.S211_ACT_DEFINITION_FORCED_LABOUR.paragraphs.map(p => p.letter).join('')).toBe('ab')
    expect(R.S211_ACT_DEFINITION_FORCED_LABOUR.paragraphs[1].text).toBe('constitute forced or compulsory labour as defined in article 2 of the Forced Labour Convention, 1930, adopted in Geneva on June 28, 1930.')
    expect(R.S211_ACT_DEFINITION_CHILD_LABOUR.leadIn).toBe('child labour means labour or services provided or offered to be provided by persons under the age of 18 years and that')
    expect(R.S211_ACT_DEFINITION_CHILD_LABOUR.paragraphs.map(p => p.letter).join('')).toBe('abcd')
  })

  it('entity, governing body and production of goods, s.2', () => {
    expect(R.S211_ACT_DEFINITION_ENTITY.paragraphs.map(p => p.letter).join('')).toBe('abc')
    expect(R.S211_ACT_DEFINITION_ENTITY.paragraphs[1].sub!.map(q => q.numeral)).toEqual(['i', 'ii', 'iii'])
    expect(R.S211_ACT_DEFINITION_GOVERNING_BODY).toBe('governing body means the body or group of members of the entity with primary responsibility for the governance of the entity.')
    expect(R.S211_ACT_DEFINITION_PRODUCTION_OF_GOODS).toBe('production of goods includes the manufacturing, growing, extracting and processing of goods.')
  })

  it('s.11(2), (4) and (5) keep (a), (b), (i), (ii) as the Act prints them', () => {
    expect(R.S211_ACT_SECTION_11_2.paragraphs.map(p => `(${p.letter}) ${p.text}`)).toEqual([
      '(a) by providing a report in respect of the entity; or', '(b) by being party to a joint report in respect of more than one entity.',
    ])
    expect(R.S211_ACT_SECTION_11_4.leadIn).toBe('The report must be approved,')
    expect(R.S211_ACT_SECTION_11_4.paragraphs[1].text).toBe('in the case of a joint report, either')
    expect(R.S211_ACT_SECTION_11_4.paragraphs[1].sub.map(q => `(${q.numeral}) ${q.text}`)).toEqual([
      '(i) by the governing body of each entity included in the report, or',
      '(ii) by the governing body of the entity, if any, that controls each entity included in the report.',
    ])
    expect(R.S211_ACT_SECTION_11_5.paragraphs[1].text).toBe('the signature of one or more members of the governing body of each entity that approved the report.')
    expect(R.S211_ACT_SECTION_12_2).toBe('The revised version of the report must, in addition to the information required under subsection 11(3), indicate the date of the revision and include a description of the changes made to the original report.')
  })
})

describe('the guidance passages the builder quotes', () => {
  it('key terms: supply chain and due diligence', () => {
    expect(R.S211_GUIDANCE_DUE_DILIGENCE).toBe('Due diligence is a process to identify and respond to the real and potential adverse impacts of activities throughout the supply chain.')
    expect(R.S211_GUIDANCE_SUPPLY_CHAIN).toMatch(/^The supply chain includes suppliers of goods .* does not include the end users or customers who purchase its products\.$/)
  })

  it('the financial year, the size rule, and no page limit', () => {
    expect(R.S211_GUIDANCE_FINANCIAL_YEAR).toBe("Financial reporting year: Identify the financial year for which the report is being submitted, which should be the entity's previous financial year ending before May 31")
    expect(R.S211_GUIDANCE_FORMAT).toBe('The report must be submitted in PDF format and must not exceed 100MB in size.')
    // The current guidance states no page limit; earlier versions did (10 pages, then a recommendation).
    for (const v of Object.values(R)) expect(JSON.stringify(v)).not.toMatch(/\b10 pages\b/)
  })

  it('personal information and joint reports, each recorded whole', () => {
    expect(R.S211_GUIDANCE_PERSONAL_INFORMATION).toHaveLength(4)
    expect(R.S211_GUIDANCE_PERSONAL_INFORMATION[0]).toMatch(/^Entities must not provide personal information, as defined in section 3 of the Privacy Act/)
    expect(R.S211_GUIDANCE_JOINT_REPORT).toHaveLength(4)
    expect(R.S211_GUIDANCE_JOINT_REPORT[1]).toMatch(/^Joint reports must clearly identify the legal name of each entity covered by the report\./)
  })

  it('a passage under each requirement, and the controlled-entities sentence under the steps and (b) to (g)', () => {
    for (const k of ['S211_GUIDANCE_A', 'S211_GUIDANCE_B_OECD_STEPS', 'S211_GUIDANCE_C', 'S211_GUIDANCE_D', 'S211_GUIDANCE_E', 'S211_GUIDANCE_F', 'S211_GUIDANCE_G'] as const)
      expect((R[k] as readonly string[]).length, k).toBeGreaterThan(0)
    for (const k of ['S211_GUIDANCE_STEPS_CONTROLLED', 'S211_GUIDANCE_B_CONTROLLED', 'S211_GUIDANCE_C_CONTROLLED', 'S211_GUIDANCE_D_CONTROLLED',
      'S211_GUIDANCE_E_CONTROLLED', 'S211_GUIDANCE_F_CONTROLLED', 'S211_GUIDANCE_G_CONTROLLED'] as const)
      expect(R[k], k).toMatch(/^If an entity controls other entities, it must also describe /)
    expect(R.S211_GUIDANCE_B_OECD_STEPS).toHaveLength(6)
  })
})

describe('the optional International Reporting Template', () => {
  it('is registered, dated, and has seven areas in its own spelling', () => {
    expect(R.S211_TEMPLATE_SOURCE_URL).toBe(S211_TEMPLATE_URL)
    expect(new URL(S211_TEMPLATE_URL).hostname).toBe('www.publicsafety.gc.ca')
    expect([R.S211_TEMPLATE_PAGE_MODIFIED, R.S211_TEMPLATE_VERIFIED]).toEqual(['2026-07-28', '2026-09-30'])
    expect(R.S211_TEMPLATE_AREAS).toHaveLength(7)
    expect(R.S211_TEMPLATE_AREAS[6]).toBe('Any other information the organisation considers relevant')
    expect(R.S211_TEMPLATE_GOAL_PLANS).toBe("Demonstrate the organisation's short, medium and long-term plans to achieve the desired goals")
    expect(R.S211_GUIDANCE_TEMPLATE_OPTIONAL).toContain('this optional template')
  })
})

describe('s.13, publishing the report (added 30 Sep 2026)', () => {
  it('is recorded word for word', async () => {
    const R = await import('./requirements')
    expect(R.S211_ACT_SECTION_13_1).toBe('An entity must, on providing the Minister with a report under section 11 or a revised report under section 12, make the report available to the public, including by publishing it in a prominent place on its website.')
    expect(R.S211_ACT_SECTION_13_2).toBe('Any entity that is incorporated under the Canada Business Corporations Act or any other Act of Parliament must provide the report or revised report to each shareholder, along with its annual financial statements.')
  })
})
