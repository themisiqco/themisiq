// lib/s211/requirements.ts
// What the Fighting Against Forced Labour and Child Labour in Supply Chains Act asks of a reporting
// entity, recorded VERBATIM from Public Safety Canada's "Guidance for entities".
//
// SOURCE: S211_GUIDANCE_URL in lib/sources.ts. The page was fetched on 30 Sep 2026 and these strings
// were copied from its text, not retyped from memory. The page's own footer read "Date modified:
// 2025-12-18". lib/s211/requirements.test.ts pins every string, so an edit here is a visible act.
//
// ⚠️ VERBATIM MEANS VERBATIM. Nothing below is tidied: "its previous financial year" after a plural
// subject, the unbalanced quotation marks in the signature line, and the square-bracket placeholders
// are all the page's. A report that prints a "corrected" version is printing something the regulator
// did not publish.
//
// ⚠️ THIS IS GUIDANCE, NOT THE STATUTE. The entity definition and the requirement list are Public
// Safety Canada's restatement of sections 2 and 11. The statute itself is CANADA_S211_URL. Where a
// figure decides something (the three thresholds) lib/s211/entity.ts cites the Act.

import { S211_GUIDANCE_URL } from '../sources'

export const S211_GUIDANCE_SOURCE_URL = S211_GUIDANCE_URL
export const S211_GUIDANCE_VERIFIED = '2026-09-30'
/** The "Date modified" the page showed when it was read. A later date there means: read it again. */
export const S211_GUIDANCE_PAGE_MODIFIED = '2025-12-18'

// ── Attestation ────────────────────────────────────────────────────────────────────────────────────
// ⚠️ AN EXAMPLE, NOT A PRESCRIBED FORM. The page introduces it with "The following may be used as an
// example:". What IS mandatory is a signed attestation: "The attestation is a mandatory requirement.
// Reports submitted without a statement and signature will not be published on Public Safety Canada's
// catalogue."
//
// ⚠️ IT IS NOT THE WORDING THIS MODULE WAS FIRST BRIEFED WITH. That version read "I attest that I have
// reviewed ... for the entity or entities listed above ... for the reporting year listed above". The
// page names the Act in full, carries a capacity placeholder, speaks "on behalf of the governing body",
// and ends "listed within this report". The three placeholders are the page's: [title], [or entities].
export const S211_ATTESTATION_INTRO = 'The following may be used as an example:'
export const S211_ATTESTATION_EXAMPLE =
  'In accordance with the requirements of the Fighting Against Forced Labour and Child Labour in Supply Chains Act (Act), and in particular section 11 thereof, I, in the capacity of [title], attest that I have reviewed the information contained in the report on behalf of the governing body of the entity [or entities] listed above. Based on my knowledge, and having exercised reasonable diligence, I attest that the information in the report is true, accurate and complete in all material respects for the purposes of the Act, for the reporting year listed within this report.'
/** The four lines under the example, in the page's order. The last one's quotation marks are as published. */
export const S211_ATTESTATION_SIGNATURE_BLOCK = [
  'Full name',
  'Title',
  'Date',
  'Signature, accompanied by the statement "I have the authority to bind \'Name of Entity.\'',
] as const
export const S211_ATTESTATION_AUTHORITY =
  'A statement confirming that the approving member has the legal authority to bind the entity should also be included in the attestation.'
export const S211_ATTESTATION_SIGNATURE_FORMS =
  'The signed attestation must be included in the PDF version of an entity\'s report. The questionnaire requires entities to confirm that their report has received the required approvals and includes a signed attestation. Appropriate attestations include a wet signature or an electronic signature.'
export const S211_APPROVAL_SINGLE =
  'For reports submitted on behalf of a single entity, approval by the entity\'s governing body is required. This approval must be documented prior to submission through a statement confirming that the report was approved by the governing body, and must include the signature of one or more of its members that approved the report.'
export const S211_APPROVAL_JOINT =
  'In the case of a joint report, however, the approval must be evidenced by a statement that states whether it was approved by the governing body of each entity included in the report or by the governing body of the entity, if any, that controls each entity included in the report, and include the signature of one or more members of the governing body(ies) that approved the report. It is up to each entity to determine the appropriate governing body or bodies to approve the report.'
export const S211_ATTESTATION_MANDATORY =
  'The attestation is a mandatory requirement. Reports submitted without a statement and signature will not be published on Public Safety Canada\'s catalogue.'

// ── The eight report requirements ──────────────────────────────────────────────────────────────────
// ONE general requirement (the steps taken) and SEVEN items the page letters (a) to (g). The page
// heads them "Mandatory information", gives the first as a sentence and the seven as a list under
// "Entities must also include information on:". `title` is the page's own heading for each lettered
// requirement ("Requirement (a)" and so on), without the dash it prints between the two.
export const S211_STEPS_REQUIREMENT =
  'Entities must describe in their annual reports the steps taken during its previous financial year to prevent and reduce the risk that forced labour or child labour is used at any step of the production of goods in Canada or elsewhere by the entity or of goods imported into Canada by the entity.'
export const S211_ALSO_INCLUDE_INTRO = 'Entities must also include information on:'
export const S211_LETTERED_REQUIREMENTS = [
  { letter: 'a', title: 'Structure, activities and supply chains', text: 'Its structure, activities and supply chains' },
  { letter: 'b', title: 'Policies and due diligence processes', text: 'Its policies and due diligence processes in relation to forced labour and child labour' },
  { letter: 'c', title: 'Forced labour and child labour risks', text: 'The parts of its business and supply chains that carry a risk of forced labour or child labour being used and the steps it has taken to assess and manage that risk' },
  { letter: 'd', title: 'Remediation measures', text: 'Any measures taken to remediate any forced labour or child labour' },
  { letter: 'e', title: 'Remediation of loss of income', text: 'Any measures taken to remediate the loss of income to the most vulnerable families that results from any measure taken to eliminate the use of forced labour or child labour in its activities and supply chains' },
  { letter: 'f', title: 'Training', text: 'The training provided to employees on forced labour and child labour' },
  { letter: 'g', title: 'Assessing effectiveness', text: 'How the entity assesses its effectiveness in ensuring that forced labour and child labour are not being used in its business and supply chains' },
] as const
/** All eight, in the page's order: the steps requirement, then (a) to (g). */
export const S211_REPORT_REQUIREMENTS: readonly string[] = [S211_STEPS_REQUIREMENT, ...S211_LETTERED_REQUIREMENTS.map(r => r.text)]

// ── The entity definition (Step 1 of the page's two-step test) ─────────────────────────────────────
// The page prints it as a nested list. It is held as that list: the lead-in, then three routes, the
// second of which carries three conditions. The page refers to the first two routes as "criteria (a)
// and (b)" in the sentence after the list, though the list itself is not lettered.
export const S211_ENTITY_DEFINITION = {
  leadIn: 'The Act defines an entity as a corporation or a trust, partnership or other unincorporated organization that:',
  routes: [
    'is listed on a stock exchange in Canada;',
    'has a place of business in Canada, does business in Canada or has assets in Canada and that, based on its consolidated financial statements, meets at least two of the following conditions for at least one of its two most recent financial years:',
    'is prescribed by regulations.',
  ],
  /** Under the second route. */
  conditions: [
    'it has at least $20 million in assets,',
    'it has generated at least $40 million in revenue, and',
    'it employs an average of at least 250 employees; or',
  ],
  after: 'If an organization meets either of criteria (a) or (b), then it is an entity for the purposes of the Act. Criteria (a) and (b) are exclusive. For example, a company listed on the TSX Venture Exchange is an entity, even if it does not have a place of business in Canada or meet any of the size-related thresholds.',
} as const
export const S211_CONSOLIDATION_NOTE =
  'Organizations should use consolidated financial statements to assess their revenue, assets and employees against the prescribed thresholds. An organization\'s consolidated financial statements include the revenue, assets and employees of any entity it controls (i.e., its subsidiaries). An organization\'s consolidated financial statements do not include the revenue, assets and employees of any organization that controls it (i.e., its parent).'
export const S211_PLACE_OF_BUSINESS =
  'Place of business means any premises, facility or installation used to carry on business, whether or not it is used exclusively for that purpose. Premises, facilities or installations may be considered to be a place of business whether they are owned or rented, or, in some cases, where they are simply available to the business. Doing business in Canada does not require having a place of business in Canada.'
export const S211_DOING_BUSINESS =
  'An organization may determine if it does business in Canada by evaluating the factors considered by the Canada Revenue Agency when determining if a person is "carrying on business in Canada" for GST/HST purposes.'
export const S211_ASSETS_IN_CANADA =
  'Having assets in Canada refers to any tangible property in Canada owned by a person or business. An organization should not include intangibles such as intellectual property, securities and goodwill in its assessment, when determining whether it has assets in Canada.'

// ── Who must report: the Act, and the guidance, which do NOT say the same thing ────────────────────
//
// ⚠️ CORRECTED 30 SEP 2026 (Stage 1b). This file first recorded only the guidance's version, and a
// summary built on it said the obligation turns on producing goods, importing goods, or controlling an
// entity that does. THE ACT IS WIDER. Section 9 applies Part 2 to an entity "producing, selling or
// distributing goods", and the guidance leaves "selling or distributing" out of its list and then says
// such entities "are not expected to report". Both texts are below, each under its own name, so nothing
// downstream can quote one as the other.
//
// THE ACT, s.9, from the Justice Laws page (CANADA_S211_URL), read 30 Sep 2026. That page showed "Act
// current to 2026-09-21 and last amended on 2024-01-01".
export const S211_ACT_CURRENT_TO = '2026-09-21'
export const S211_ACT_LAST_AMENDED = '2024-01-01'
export const S211_ACT_SECTION_9 = {
  leadIn: 'This Part applies to any entity',
  paragraphs: [
    { letter: 'a', text: 'producing, selling or distributing goods in Canada or elsewhere;' },
    { letter: 'b', text: 'importing into Canada goods produced outside Canada; or' },
    { letter: 'c', text: 'controlling an entity engaged in any activity described in paragraph (a) or (b).' },
  ],
} as const
/** s.10, on what "control" means for paragraph 9(c). */
export const S211_ACT_SECTION_10_1 =
  'For the purposes of this Part and subject to the regulations, an entity is controlled by another entity if it is directly or indirectly controlled by that other entity in any manner.'
export const S211_ACT_SECTION_10_2 =
  'An entity that controls another entity is deemed to control any entity that is controlled or deemed to be controlled by the other entity.'

// THE ACT, s.11(1) and s.11(3), for comparison with the guidance's restatement above. They agree in
// substance. The wording differs in two places a report that QUOTES the Act would get wrong from the
// guidance: s.11(1) opens "Every entity must, on or before May 31 of each year, report to the
// Minister", and s.11(3)(b) reads "its policies and its due diligence processes" (a second "its").
export const S211_ACT_SECTION_11_1 =
  'Every entity must, on or before May 31 of each year, report to the Minister on the steps the entity has taken during its previous financial year to prevent and reduce the risk that forced labour or child labour is used at any step of the production of goods in Canada or elsewhere by the entity or of goods imported into Canada by the entity.'
export const S211_ACT_SECTION_11_3 = {
  leadIn: 'The report must also include the following information in respect of each entity subject to the report:',
  paragraphs: [
    { letter: 'a', text: 'its structure, activities and supply chains;' },
    { letter: 'b', text: 'its policies and its due diligence processes in relation to forced labour and child labour;' },
    { letter: 'c', text: 'the parts of its business and supply chains that carry a risk of forced labour or child labour being used and the steps it has taken to assess and manage that risk;' },
    { letter: 'd', text: 'any measures taken to remediate any forced labour or child labour;' },
    { letter: 'e', text: 'any measures taken to remediate the loss of income to the most vulnerable families that results from any measure taken to eliminate the use of forced labour or child labour in its activities and supply chains;' },
    { letter: 'f', text: 'the training provided to employees on forced labour and child labour; and' },
    { letter: 'g', text: 'how the entity assesses its effectiveness in ensuring that forced labour and child labour are not being used in its business and supply chains.' },
  ],
} as const

// THE GUIDANCE, Step 2 of its two-step test ("Determining if an entity must report"), as the page
// stood when read on 30 Sep 2026 (page dated 2025-12-18). Public Safety Canada's position, not the
// statute's words.
export const S211_GUIDANCE_REPORTING_OBLIGATION = {
  leadIn: 'The reporting obligation applies only to entities that:',
  activities: [
    'produce goods in Canada or elsewhere;',
    'import goods produced outside Canada; or',
    'control another entity that produces or imports goods.',
  ],
  after: 'If an organization is not involved in any of the prescribed activities, then it does not need to report, even if it meets the definition of entity.',
} as const
/** The guidance's position on an entity that only sells and distributes. */
export const S211_GUIDANCE_SELL_DISTRIBUTE_ONLY =
  'Entities solely involved in distributing and selling are not expected to report under the Act.'
// ⚠️ THAT SENTENCE USED TO HAVE A SECOND ONE AFTER IT, AND NO LONGER DOES. The page as it stood dated
// 2024-11-15 and again dated 2025-07-30 read: "Entities solely involved in distributing and selling are
// not expected to report under the Act. Public Safety Canada will not seek enforcement action in those
// instances." The version dated 2025-12-18, the one transcribed here, keeps the first sentence and has
// dropped the second. Read on 30 Sep 2026 from the Internet Archive's copies of the same URL, captured
// 9 Feb 2025 (20250209215435) and 28 Nov 2025 (20251128165318).
//   So the commitment not to enforce was withdrawn in the December 2025 revision. It is recorded
// because a seller or distributor deciding whether to file needs to know that the comfort is gone, not
// merely that it is absent.
export const S211_GUIDANCE_PRIOR_NO_ENFORCEMENT = 'Public Safety Canada will not seek enforcement action in those instances.'
/** The "Date modified" values of the page versions that carried it. */
export const S211_GUIDANCE_PRIOR_NO_ENFORCEMENT_PAGE_DATES = ['2024-11-15', '2025-07-30'] as const

export const S211_GUIDANCE_DIRECTLY_ENGAGED =
  'Only those entities directly engaged in the production of goods, importation of goods or controlling an entity engaged in these activities are required to submit a report.'
/** The guidance's position on "very minor dealings": three consecutive paragraphs, in the page's order. */
export const S211_GUIDANCE_VERY_MINOR_DEALINGS = [
  'There is no prescribed threshold for the minimum value of goods that an entity must produce or import to be subject to the reporting obligation. However, the terms as they are used in the Act should be understood as excluding "very minor dealings", which may be interpreted in accordance with generally accepted principles of de minimis and evaluated within the context of each entity\'s overall operations.',
  'If an entity\'s importing or producing activities are incidental, low-volume, or not central to its core business, they may qualify as very minor dealings.',
  'Entities should apply judgment based on the scale, frequency, and relevance of the activity within their broader operations.',
] as const
/** What the guidance means by goods, producing and importing. */
export const S211_GUIDANCE_GOODS =
  'Goods refers to tangible physical property that is the subject of trade and commerce, understood in the ordinary sense of the word. Real property, electricity, software services, and insurance plans are excluded from this definition.'
export const S211_GUIDANCE_PRODUCING = 'Producing goods includes the manufacturing, growing, extracting and processing of goods.'
export const S211_GUIDANCE_IMPORTING =
  'An entity is importing goods if the entity is the true importer that, in reality, caused the goods to be brought into Canada.'
export const S211_GUIDANCE_SUPPORT_SERVICES =
  'The terms producing and importing are not intended to capture services that solely support the production or importation of goods, such as marketing, administrative services, financial services, and software services.'
export const S211_GUIDANCE_SEEK_ADVICE =
  'It is the responsibility of the entity to assess how the Act applies to their specific circumstances. If an entity is unsure whether they meet any of the prescribed application criteria, they are encouraged to seek advice from their legal counsel.'
