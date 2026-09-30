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

import { S211_GUIDANCE_URL, S211_TEMPLATE_URL } from '../sources'

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

// ════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2a (30 Sep 2026): what the report builder quotes.
//
// Every string below was COPIED BY A SCRIPT out of the downloaded page text, between a start and an
// end phrase, and then checked again to appear word for word in that text. None was retyped. The Act
// strings come from the Justice Laws page (CANADA_S211_URL), the guidance strings from Public Safety
// Canada's "Guidance for entities" (S211_GUIDANCE_URL, page dated 2025-12-18), and the template strings
// from the International Reporting Template page (S211_TEMPLATE_URL, page dated 2026-07-28).
//
// ⚠️ SPELLING IS THE SOURCE'S. The guidance writes "organization" and the template "organisation";
// each is held as printed. Our own text around them uses Canadian English.
// ════════════════════════════════════════════════════════════════════════════════════════════════

// ── The Act: definitions (s.2) ─────────────────────────────────────────────────────────────────────
// The Act prints each definition with its French term in brackets after the last paragraph, for
// example "(travail forcé)". That cross-reference is left out here; the English text is complete.
/** s.2, "child labour". */
export const S211_ACT_DEFINITION_CHILD_LABOUR = {
  leadIn: 'child labour means labour or services provided or offered to be provided by persons under the age of 18 years and that',
  paragraphs: [
    { letter: 'a', text: 'are provided or offered to be provided in Canada under circumstances that are contrary to the laws applicable in Canada;' },
    { letter: 'b', text: 'are provided or offered to be provided under circumstances that are mentally, physically, socially or morally dangerous to them;' },
    { letter: 'c', text: 'interfere with their schooling by depriving them of the opportunity to attend school, obliging them to leave school prematurely or requiring them to attempt to combine school attendance with excessively long and heavy work; or' },
    { letter: 'd', text: 'constitute the worst forms of child labour as defined in article 3 of the Worst Forms of Child Labour Convention, 1999, adopted at Geneva on June 17, 1999.' },
  ],
} as const
/** s.2, "forced labour". */
export const S211_ACT_DEFINITION_FORCED_LABOUR = {
  leadIn: 'forced labour means labour or service provided or offered to be provided by a person under circumstances that',
  paragraphs: [
    { letter: 'a', text: 'could reasonably be expected to cause the person to believe their safety or the safety of a person known to them would be threatened if they failed to provide or offer to provide the labour or service; or' },
    { letter: 'b', text: 'constitute forced or compulsory labour as defined in article 2 of the Forced Labour Convention, 1930, adopted in Geneva on June 28, 1930.' },
  ],
} as const
/**
 * s.2, "entity", as the Act prints it. S211_ENTITY_DEFINITION above is the guidance's restatement of it,
 * with the same words and the lettering left off; this is the Act's own text, with its lettering.
 */
export const S211_ACT_DEFINITION_ENTITY = {
  leadIn: 'entity means a corporation or a trust, partnership or other unincorporated organization that',
  paragraphs: [
    { letter: 'a', text: 'is listed on a stock exchange in Canada;' },
    { letter: 'b', text: 'has a place of business in Canada, does business in Canada or has assets in Canada and that, based on its consolidated financial statements, meets at least two of the following conditions for at least one of its two most recent financial years:', sub: [
      { numeral: 'i', text: 'it has at least $20 million in assets,' },
      { numeral: 'ii', text: 'it has generated at least $40 million in revenue, and' },
      { numeral: 'iii', text: 'it employs an average of at least 250 employees; or' },
    ] },
    { letter: 'c', text: 'is prescribed by regulations.' },
  ],
} as const
/** s.2, "governing body". */
export const S211_ACT_DEFINITION_GOVERNING_BODY =
  'governing body means the body or group of members of the entity with primary responsibility for the governance of the entity.'
/** s.2, "production of goods". */
export const S211_ACT_DEFINITION_PRODUCTION_OF_GOODS =
  'production of goods includes the manufacturing, growing, extracting and processing of goods.'

// ── The Act: s.11(2), (4), (5) and s.12(2) ─────────────────────────────────────────────────────────
// Held with the Act's own lettering, so a report or a screen can print (a), (b), (i), (ii) as the Act
// does. s.11(4)(b) has two sub-paragraphs.
/** s.11(2): single or joint report. */
export const S211_ACT_SECTION_11_2 = {
  leadIn: 'An entity may comply with subsection (1) either',
  paragraphs: [
    { letter: 'a', text: 'by providing a report in respect of the entity; or' },
    { letter: 'b', text: 'by being party to a joint report in respect of more than one entity.' },
  ],
} as const
/** s.11(4): who must approve the report. */
export const S211_ACT_SECTION_11_4 = {
  leadIn: 'The report must be approved,',
  paragraphs: [
    { letter: 'a', text: 'in the case of a report in respect of a single entity, by its governing body; or' },
    { letter: 'b', text: 'in the case of a joint report, either', sub: [
      { numeral: 'i', text: 'by the governing body of each entity included in the report, or' },
      { numeral: 'ii', text: 'by the governing body of the entity, if any, that controls each entity included in the report.' },
    ] },
  ],
} as const
/** s.11(5): how the approval is evidenced (the attestation). */
export const S211_ACT_SECTION_11_5 = {
  leadIn: 'The approval of the report must be evidenced by',
  paragraphs: [
    { letter: 'a', text: 'a statement that sets out whether it was approved pursuant to paragraph (4)(a) or subparagraph (4)(b)(i) or (ii); and' },
    { letter: 'b', text: 'the signature of one or more members of the governing body of each entity that approved the report.' },
  ],
} as const
/**
 * s.12(2): what a revised report must add. ⚠️ s.7(2), for government institutions, has the same words
 * except "subsection 6(2)". The first transcription picked up s.7(2) by mistake, and only the pinned
 * test caught it; the source check could not, because those words are in the Act too.
 */
export const S211_ACT_SECTION_12_2 =
  'The revised version of the report must, in addition to the information required under subsection 11(3), indicate the date of the revision and include a description of the changes made to the original report.'

// ── Guidance: key terms ─────────────────────────────────────────────────────────────────────────────
export const S211_GUIDANCE_SUPPLY_CHAIN =
  'The supply chain includes suppliers of goods that contribute to the entity\'s business activities, from sourcing the raw materials to the final product. It includes direct and indirect suppliers, both in Canada and outside Canada. An entity\'s supply chain does not include the end users or customers who purchase its products.'
export const S211_GUIDANCE_DUE_DILIGENCE =
  'Due diligence is a process to identify and respond to the real and potential adverse impacts of activities throughout the supply chain.'

// ── Guidance: rules that apply to the whole report ──────────────────────────────────────────────────
/** Three sentences: concrete actions, the previous financial year, and work still in progress. */
export const S211_GUIDANCE_CONCRETE_ACTIONS =
  'Entities are expected to provide responses which describe concrete actions they have taken to address risks of forced labour and child labour, rather than purely aspirational statements. The report should focus on actions taken during the previous financial year. However, entities are also encouraged to note where they are in the process of developing their response to forced labour and child labour, even if the measures have not yet been fully implemented.'
export const S211_GUIDANCE_PLAIN_LANGUAGE =
  'The report will be a public-facing document, and entities are encouraged to use simple, clear language in their responses and to explain unfamiliar terms to make their report accessible.'
export const S211_GUIDANCE_COMPLETE_REPORT =
  'A complete report will contain information that responds to each of the Act\'s requirements and that is consistent with the responses provided in the questionnaire. A complete report will also include the attestation with the required signature(s).'
export const S211_GUIDANCE_LEVEL_OF_DETAIL =
  'There is no prescribed level of detail. Entities should use their discretion in determining the appropriate level of detail proportionate to their size and risk profile, respecting the specified size requirements for the report.'
/** The only size rule in the current guidance. It states no page limit. */
export const S211_GUIDANCE_FORMAT =
  'The report must be submitted in PDF format and must not exceed 100MB in size.'
export const S211_GUIDANCE_LINKS =
  'If desired, entities may supplement the information provided in their reports by adding links to relevant websites and publicly available documents.'
export const S211_GUIDANCE_WIDER_ACTIONS =
  'Public Safety Canada recognizes that entities may be taking a range of actions related to human rights due diligence, environmental, social and governance (ESG) initiatives and other aspects of responsible business conduct (RBC) that are not specifically or exclusively focused on forced labour or child labour. Entities can include in their reports a description of these actions as they relate to purposes of the Act.'
/** From the questionnaire's list of submission information. */
export const S211_GUIDANCE_FINANCIAL_YEAR =
  'Financial reporting year: Identify the financial year for which the report is being submitted, which should be the entity\'s previous financial year ending before May 31'

// ── Guidance: personal information ──────────────────────────────────────────────────────────────────
export const S211_GUIDANCE_PERSONAL_INFORMATION = [
  'Entities must not provide personal information, as defined in section 3 of the Privacy Act, in the open text box fields of the questionnaire or within their annual reports.',
  'Prior to submitting an annual report, entities must ensure the PDF does not contain any personal information. Submissions including personal information cannot be published in the library catalogue, and entities will need to resubmit. Among other things, personal information can include addresses, phone numbers, e-mail addresses, IP addresses, Social Insurance Numbers and other personal identifiers.',
  'To protect privacy, do not include the personal information of employees of the organization or any other persons.',
  'Do not disclose personal or commercially sensitive information that could create legal risk or compromise the privacy of any persons.',
] as const

// ── Guidance: joint reports ─────────────────────────────────────────────────────────────────────────
export const S211_GUIDANCE_JOINT_REPORT = [
  'An entity may choose to submit a joint report covering its actions and those of any entities it controls (i.e., its subsidiaries), or that covers multiple entities belonging to the same corporate group.',
  'Joint reports must clearly identify the legal name of each entity covered by the report. The questionnaire only needs to be completed by the entity that submits the report.',
  'Only submit a joint report if the information provided generally applies to all entities covered by the report.',
  'A joint report should not be submitted in cases where entities have risk profiles or policies that differ significantly and in a way that would make it difficult to prepare a report accurately describing all entities.',
] as const

// ── Guidance: approval and signature ────────────────────────────────────────────────────────────────
export const S211_GUIDANCE_PROPER_SIGNATURE =
  'A proper signature includes a wet, typed or digitally inserted signature of a member of the governing body. Leaving a blank space in the signature block does not constitute a signature.'
export const S211_GUIDANCE_GOVERNING_BODY_CHOICE =
  'It is up to each entity to determine the appropriate governing body or bodies to approve the report.'

// ── Guidance: under each requirement ────────────────────────────────────────────────────────────────
// The passages the builder shows beside each section. Each *_CONTROLLED constant is the sentence the guidance adds
// under the steps requirement and under (b) to (g): what an entity that controls others must also
// describe. There is none under (a).
/** Three of the examples the guidance gives of what a report may say about the steps taken. */
export const S211_GUIDANCE_STEPS_EXAMPLES = [
  'Whether the actions were applied broadly or to specific parts of the entity\'s activities and supply chains',
  'Who in the organization is responsible for identifying, assessing and responding to risks, and the governance structure that provides senior level oversight',
  'How the organization engages with external stakeholders such as industry initiatives, NGO, trade unions, or government agencies on preventing supply chain risks',
] as const
export const S211_GUIDANCE_STEPS_CONTROLLED =
  'If an entity controls other entities, it must also describe the steps that these controlled entities have taken to prevent and reduce risks of forced labour and child labour.'
/** Requirement (a): three of the details it lists, and the passage on visibility of the supply chain. */
export const S211_GUIDANCE_A = [
  'Legal structure, including legal classification',
  'Number of employees, both in Canada and outside Canada',
  'Locations of operation (countries or regions)',
  'Public Safety Canada understands that supply chains can be very complex and entities may not have visibility over all the activities and business relationships that feed into their products. However, entities should work to identify and report the source countries or regions of origin of each of the goods used in the entities\' supply chain, to demonstrate progress and continuous improvement in enhancing visibility.',
] as const
/** Requirement (b): the six steps of the OECD Due Diligence Guidance, as the guidance lists them. The OECD guidance is voluntary. */
export const S211_GUIDANCE_B_OECD_STEPS = [
  'Embedding responsible business conduct (RBC) into policies and management systems',
  'Identifying and assessing adverse impacts in operations, supply chains and business relationships',
  'Ceasing, preventing or mitigating adverse impacts',
  'Tracking implementation and results',
  'Communicating how impacts are addressed',
  'Providing for or cooperating in remediation when appropriate',
] as const
export const S211_GUIDANCE_B_OVERLAP =
  'There may be overlap between the steps entities identify in this section and responses to subsequent, more specific questions, such as the questions on due diligence and on training for employees. This is expected and acceptable.'
export const S211_GUIDANCE_B_CONTROLLED =
  'If an entity controls other entities, it must also describe the policies and due diligence processes that these controlled entities have in place.'
/** Requirement (c). */
export const S211_GUIDANCE_C = [
  'Identifying parts of an entity\'s activities and supply chains that carry a risk does not mean indicating that forced labour or child labour was or is actually being used.',
  'No sectors or industries involving the production or importation of goods are assumed to be entirely free of forced labour and child labour risks.',
  'The purpose of reporting is not to certify that an entity is "risk-free," but rather to demonstrate that the entity has taken steps to identify and address risks if steps have been taken.',
  'Entities may specify that they have identified potential risks related to a particular sector, industry, country or region; the production or importation of a particular good; or a particular step in the supply chain.',
  'Entities should explain if and how they have identified potential risks (i.e., by mapping supply chains, conducting a risk assessment, etc.) and how they have dealt with the risks. Entities may do this for specific potential risks identified, or choose to provide a general description of how they assess and manage potential risks. Entities may also describe what sources it uses, including: desk based research and key sources, audits, engagements with trade unions and NGO, and supplier questionnaires.',
  'Entities are not required to report on specific cases or allegations of forced labour or child labour. If this information is included in the report, entities should ensure it does not compromise any individual\'s privacy.',
] as const
export const S211_GUIDANCE_C_CONTROLLED =
  'If an entity controls other entities, it must also describe the steps that these controlled entities have taken to identify, assess and manage potential forced labour or child labour risks in their activities and supply chains.'
/** Requirement (d). */
export const S211_GUIDANCE_D = [
  'Remediation and remedy refer to both the processes of providing remedy for an adverse impact and to the substantive outcomes that can counteract, or "make good", the adverse impact.',
  'Entities may provide details of the organization\'s remediation mechanisms, policies and processes, including: details on grievance mechanisms to assist whistleblowers, how the processes integrate with relevant judicial processes, and how the remediation mechanism has been communicated to stakeholders.',
  'As with reporting on risks of forced labour and child labour, the purpose of requiring entities to describe the measures they have taken to remediate any forced labour or child labour is to encourage transparency, not to penalize reporting entities.',
  'If there is evidence of forced labour or child labour in the entity\'s activities or supply chains, but no remediation measures have been taken, it is sufficient to state this in the report.',
  'If an entity has assessed that there is no evidence of instances of forced labour or child labour in its activities and supply chains, entities can select "not applicable" as a response in the questionnaire and state that is the case in their report.',
] as const
export const S211_GUIDANCE_D_CONTROLLED =
  'If an entity controls other entities, it must also describe the remediation measures that these controlled entities have taken, if applicable.'
/** Requirement (e). */
export const S211_GUIDANCE_E = [
  'Efforts to prevent and reduce risks of forced labour and child labour can have the unintended consequence of contributing to a loss of income for vulnerable families.',
  'As with requirement (d), if an entity has judged that vulnerable families have not experienced loss of income as a result of steps the entity has taken to eliminate forced labour or child labour risks, or if no remediation measures have been taken, then stating this in the report is sufficient to address this requirement.',
] as const
export const S211_GUIDANCE_E_CONTROLLED =
  'If an entity controls other entities, it must also describe the measures that these controlled entities have taken to remediate loss of income, if applicable.'
/** Requirement (f). */
export const S211_GUIDANCE_F = [
  'Training on forced labour and child labour may take a range of forms, from formal training courses to awareness-raising activities.',
  'When reporting on the training provided to employees, entities may choose to provide the following details:',
] as const
export const S211_GUIDANCE_F_CONTROLLED =
  'If an entity controls other entities, it must also describe the training that these controlled entities provide to employees on forced labour and child labour, if applicable.'
/** Requirement (g). The first sentence is a recommendation ("should"), not a requirement of the Act. */
export const S211_GUIDANCE_G = [
  'Entities should set goals to ensure the organization makes year-on-year progress in identifying, preventing and responding to risks and demonstrate in their report the short, medium and long-term plans to achieve the desired goals.',
  'This list is not exhaustive, and entities are encouraged to provide additional information, such as how they use quantitative and qualitative data to assess the effectiveness of their measures.',
  'Entities are required to report on how they assess their effectiveness, not to give the results of that assessment.',
  'Entities may indicate that no actions have been taken to assess their effectiveness in preventing and reducing risks of forced labour and child labour.',
] as const
/** Requirement (g): the four example steps the guidance takes from the questionnaire. */
export const S211_GUIDANCE_G_EXAMPLE_STEPS = [
  'Setting up a regular review or audit of the organization\'s policies and procedures related to forced labour and child labour',
  'Tracking relevant key performance indicators, such as levels of employee awareness, numbers of cases reported and solved through grievance mechanisms and numbers of contracts with anti-forced labour and -child labour clauses',
  'Partnering with an external organization to conduct an independent review or audit of the organization\'s actions',
  'Working with suppliers to measure the effectiveness of their actions to address forced labour and child labour, including by tracking relevant performance indicators',
] as const
export const S211_GUIDANCE_G_CONTROLLED =
  'If an entity controls other entities, it must also describe how these controlled entities assess their effectiveness in ensuring that forced labour and child labour are not being used in their activities and supply chains.'

// ── The optional International Reporting Template (Canada, United Kingdom, Australia) ───────────────
// OPTIONAL, and the guidance says so. It groups the three countries' requirements into seven areas.
// Read 30 Sep 2026 from S211_TEMPLATE_URL; the page showed "Date modified: 2026-07-28" and the
// template "Version 1" of July 2025.
export const S211_TEMPLATE_PAGE_MODIFIED = '2026-07-28'
export const S211_TEMPLATE_VERIFIED = '2026-09-30'
/** From the guidance page, on the template. */
export const S211_GUIDANCE_TEMPLATE_OPTIONAL =
  'Entities reporting under the Supply Chains Act may use this optional template as a guide to implement good practices and continually improve when preparing their annual reports.'
/** The seven areas, in the template's order, as its numbered headings print them. */
export const S211_TEMPLATE_AREAS = [
  'A description of the organisation\'s structure, operations, activities and supply chains, including any organisations covered by this statement',
  'A description of the organisation\'s policies in relation to modern slavery, forced labour and child labour',
  'A description of any risk management processes in place to assess and address the risk of modern slavery, forced labour and child labour practices in the reporting organisation\'s supply chains',
  'A description of the organisation\'s due diligence processes in relation to modern slavery, forced labour and child labour in its supply chains',
  'A description of the training provided to employees on modern slavery, forced labour and child labour',
  'A description of how the organisation assesses the effectiveness of the actions it has taken to prevent and respond to modern slavery, forced labour and child labour, and its due diligence processes',
  'Any other information the organisation considers relevant',
] as const
/** Area 6, Level 2. The template does not define short, medium or long term. */
export const S211_TEMPLATE_GOAL_PLANS =
  'Demonstrate the organisation\'s short, medium and long-term plans to achieve the desired goals'

export const S211_TEMPLATE_SOURCE_URL = S211_TEMPLATE_URL
