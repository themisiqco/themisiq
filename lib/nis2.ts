// lib/nis2.ts
// SINGLE SOURCE for what the repo says about NIS2 — and the first thing it says is that DORA DOES
// NOT SWITCH NIS2 OFF. It disapplies particular provisions for particular entities. Every constant
// below is shaped by that distinction, because collapsing it is how a bank ends up told nothing.
//
// ✅ VERIFIED AGAINST THE DIRECTIVE TEXT, 12 August 2026 — the consolidated text of Directive (EU)
// 2022/2555 on EUR-Lex (CELEX 02022L2555-20221227). Article text, not a summary of it.
//
// ⚠️ A SECONDARY SOURCE GOT THIS WRONG AND WE ALMOST SHIPPED IT. READ THIS BEFORE EDITING ANYTHING
// BELOW. The claim under investigation was that a DORA-covered bank still owes the ART. 27
// REGISTRATION duty. IT DOES NOT. Art. 27 applies to a CLOSED LIST of digital-infrastructure entity
// types: DNS service providers, TLD name registries, entities providing domain name registration
// services, cloud computing service providers, data centre service providers, content delivery
// network providers, managed service providers, managed security service providers, and providers
// of online marketplaces, online search engines and social networking services platforms. A credit
// institution is not among them, and no reading of the list reaches one.
//   The duty that DOES reach a bank is ART. 3(4).
//   HOW THE ERROR WAS MADE, because the shape of it will recur: the secondary source QUOTED ART.
// 3(4)'S TEXT — the 17 April 2025 list date, the "within two weeks" change window — and LABELLED IT
// ART. 27. Art. 27 carries its own, different dates: 17 January 2025, and three months. So the
// substance was right and the article number was wrong, which is the hardest version to catch:
// every figure checks out against the quoted prose, and none of it checks out against the article
// cited. READ THE ARTICLE, NOT THE ARTICLE NUMBER SOMEONE ELSE ASSIGNED. A citation is a claim.
//
// ⚠️ TRANSPOSITION POSTURE, and the limit on it. A DIRECTIVE BINDS MEMBER STATES, NOT ENTITIES: what
// reaches a reader is their own national transposing law, so there is no single day on which duties
// attached to them. The deadline was 17 October 2024. Transposition is NOT complete in every Member
// State — and that fact is DELIBERATELY NOT ASSERTED in any constant here, because it is unsourced,
// carries no as-of date, and would go stale as states catch up. NIS2_TIMING therefore names the
// mechanism and the deadline, both stable, and nothing else. Contrast DORA, where 'Active since
// 17 January 2025' is literally true because a Regulation applies directly.
//
// WHY THIS FILE EXISTS. NIS2 had NO constants at all. The directive number, the Annex I/II scoping,
// the medium-enterprise thresholds, the transposition posture and the DORA interaction were all
// call-site literals in app/assess/page.tsx — five separate claims, none citable, on the page that
// emails a compliance determination to a named lead. It was the last regime on that page in the
// position SB 253 and SB 261 were in before their files existed.
// ANY SURFACE NAMING A NIS2 SCOPE TEST, TIMING POSTURE OR DORA INTERACTION IMPORTS FROM HERE.
//
// NOTE ON SCOPE. DISPLAY STRINGS ONLY. Whether NIS2 reaches a given company is decided by the
// /assess gate — an Annex I/II sector, the size limbs, and the per-sector DORA displacement test.
// Nothing here is read to decide applicability, and no threshold is restated as a number. Same
// split lib/sb253.ts keeps against THRESHOLD_TESTS['SB 253'].

// The instrument. Short form, for a Framework column, a findings label or a directory card — the
// slot where a regime is named without an obligation attached. The /assess entry carries the number
// inline today; this is the constant it should read.
export const NIS2_CITATION = 'Directive (EU) 2022/2555 (NIS2)'

// The timing cell. LIFTED VERBATIM from the string already live at app/assess/page.tsx — this file
// is the consumer that string should have had from the start. It names the MECHANISM and the
// DEADLINE and stops there, for the reason in the transposition block above: anything about which
// Member States have finished is a claim with a clock on it, and this slot cannot carry an as-of
// date. Reads as a sibling to CSRD's 'In force (scope simplified by Omnibus)' rather than to DORA's
// 'Active since 17 January 2025', and that difference is the point.
export const NIS2_TIMING = 'Applies through national law — transposition deadline was 17 October 2024'

// The scope test, as prose for a body slot. BOTH LIMBS TOGETHER, because either alone over-calls:
// sector without size catches a two-person consultancy, size without sector catches a large retailer
// in no Annex at all. That pair was the /assess gate's original defect, and stating them apart here
// would invite it back at the next call site.
export const NIS2_SIZE_TEST =
  'NIS2 reaches entities in an Annex I or Annex II sector that exceed the medium-enterprise thresholds — 50 or more staff, or EUR 10,000,000 or more turnover.'

// WHAT DORA ACTUALLY DISPLACES, and — the load-bearing half — what it does not. Art. 4(1) disapplies
// the RELEVANT PROVISIONS of the Directive to entities covered by a sector-specific Union act
// imposing at least equivalent requirements, INCLUDING the supervision and enforcement provisions in
// Chapter VII. Art. 4(2) sets the equivalence test by reference to art. 21(1) and (2) for
// cybersecurity risk-management measures and art. 23(1) to (6) for incident notification.
//
// IT DOES NOT SAY NIS2 STOPS APPLYING, and this constant must never be edited into saying so. That
// sentence is the one a reader will take away, and it is false: the entity remains within the
// Directive's scope, identified under art. 3, with the provisions the sector-specific act does not
// replace still live. See NIS2_SURVIVING_DUTY for the concrete one.
export const NIS2_DORA_CARVE_OUT =
  'Where a sector-specific Union act imposes at least equivalent requirements, art. 4(1) disapplies the relevant provisions of NIS2 to the entities it covers, including the supervision and enforcement provisions in Chapter VII. Art. 4(2) sets the equivalence test by reference to art. 21(1) and (2) for cybersecurity risk-management measures and art. 23(1) to (6) for incident notification. NIS2 does not cease to apply: what is displaced is the provisions the sector-specific act replaces, not the Directive.'

// THE DUTY THAT SURVIVES FOR A DORA FINANCIAL ENTITY. Art. 3(4), not art. 27 — see the secondary-
// source warning at the head of this file, which exists because this is exactly the constant that
// would have carried the wrong article number. It is an identification-and-notification duty, which
// is why the art. 4(1) carve-out does not reach it: the carve-out replaces cybersecurity provisions,
// and this is not one.
export const NIS2_SURVIVING_DUTY =
  'An entity identified as essential or important submits to its Member State, under art. 3(4), its name, address and up-to-date contact details, the relevant sector and subsector, and the Member States where it provides services. Changes are notified without delay, and in any event within two weeks. Member States were to establish the list of these entities by 17 April 2025.'

// ── WHY A SURVIVING DUTY EXISTS AT ALL ───────────────────────────────────────────────────────────
//
// DORA art. 1(2) makes DORA a sector-specific Union act for art. 4 purposes 'in relation to financial
// entities identified as essential or important entities pursuant to national rules transposing
// Article 3'.
//
// READ THAT CONDITION. The carve-out is expressed BY REFERENCE TO the art. 3 identification — so the
// identification layer is the PRECONDITION for DORA displacing anything, not something the
// displacement removes. An entity has to be identified under art. 3 for art. 4 to bite at all; the
// art. 3(4) submission is how that identification is maintained. Reading the carve-out as switching
// off the whole Directive would remove the very thing the carve-out is conditioned on.
//
// That is the structural answer to "surely DORA covers all of this": it cannot, because DORA's own
// text points back at NIS2 art. 3 to say who it covers.
