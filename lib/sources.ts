// lib/sources.ts
// SINGLE REGISTRY for every outbound link to a regulator, standards body or official source — and
// the reason it exists is not that links rot. It is that WE CANNOT SEE THEM.
//
// WHY THIS FILE EXISTS. There are 25 regulatory URLs across app/ and lib/. TWENTY-TWO ARE CALL-SITE
// LITERALS, and TWENTY-THREE OF THEM SIT ON ONE PAGE — app/frameworks/page.tsx — where each renders
// under the label "Official source ↗". That is the strongest sourcing claim any surface in this repo
// makes: not "related reading", not "more information", but a promise that the thing on the other end
// is the authority for the card above it. Twenty-two of those promises were unreviewable, because
// nothing enumerated them and nothing said what each was supposed to point at.
//   TWO WERE FOUND DEAD BY READING, NOT BY TOOLING. Both were CARB links, both found because someone
// was checking a date and happened to click.
//
// ⚠️ THE FAILURE MODE IS NOT 404, AND THIS IS THE WHOLE DESIGN ARGUMENT. Both CARB links that broke
// RESOLVED. They returned a real page with a real heading; they simply pointed at the wrong or stale
// one — a programme page where the rulemaking record was needed, and a rulemaking page last reviewed
// 29 December 2025 still showing a Final Package at OAL that a withdrawal had overtaken months
// earlier. A LINK CHECKER WOULD HAVE PASSED BOTH. Status 200 is not a claim about relevance.
//   What catches that class is not a request. It is ONE PLACE TO LOOK, ONE PLACE TO FIX, AND A
// COMMENT ON EACH URL SAYING WHAT IT IS MEANT TO POINT AT — so a reader opening the link can tell
// whether it still does. Every constant below therefore carries its intent, not just its address.
//
// ⚠️ VERIFICATION STATUS, STATED PER CONSTANT AND NOT IMPLIED BY THIS FILE'S EXISTENCE. Only the two
// CARB URLs have been opened and checked, on 12 August 2026. EVERY OTHER URL HERE IS CARRIED OVER
// ⚠️ EVERY *_URL CARRIES AN @source-status TAG, AND lib/sources.test.ts ASSERTS IT. Four values, and
// the distinction between the middle two is the whole point:
//
//   unverified      never checked. Nobody has fetched it or opened it.
//   resolves <date> HTTP 200 on that date. THE PAGE WAS NOT READ, so this does NOT discharge whatever
//                   the comment above the constant claims the page says. A link that resolves to the
//                   WRONG page is worse than a 404: a 404 tells the reader something is broken, while a
//                   live page about the wrong regulation reads as confirmation.
//   form-verified <date>  cannot be fetched at all — iso.org 403s every automated client, headers or
//                   not — but the URL's SHAPE matches the publisher's documented convention.
//   verified <date> A HUMAN OPENED IT and the content matches the comment's claim. This is the only
//                   value that discharges the claim. See EPA_USEEIO_URL for what that looks like: it
//                   records what the page said AND what it failed to say.
//
// ⚠️ MOVING A TAG UP TO `verified` IS A CLAIM ABOUT HAVING READ SOMETHING. lib/sources.test.ts holds the
// expected status for every constant, so changing a tag fails the test until the list is edited in the
// same commit — which is the point. It makes clearing a marker a visible act rather than a quiet one.
// Before concluding a link is dead, see the METHOD section in docs/backlog.md: a bare curl gets 403 from
// sites that are perfectly alive, and two links here went 403 -> 200 on adding real browser headers.
//
// UNVERIFIED from the call site it replaces — moved, not validated. Collecting them into one file
// makes them checkable; it does not make them checked. A future reader must not read registry
// membership as a warrant. Each constant says which it is.
//
// NOTE ON SCOPE. LINKS ONLY — no dates, no thresholds, no posture. Those live with their regimes
// (lib/sb253.ts, lib/sb261.ts, lib/nis2.ts, lib/cs3d.ts, lib/aiAct.ts, lib/ifrsS2.ts), and a URL that
// documents a posture belongs there too, beside the reasoning it evidences. See the re-export note
// below, and the two deliberate exclusions:
//
//   · THE ECB FX REFERENCE PDF (lib/fx.ts, inside FX_SOURCE) STAYS OUT OF THIS REGISTRY. Its
//     path encodes the fixing date — .../2026/07/20260701.pdf — so it is not a stable source link but
//     a DATED ARTEFACT that must move whenever FX_AS_OF moves. That file's own comment already says
//     to bump both in the same edit. Lifting it into a registry would separate the URL from the date
//     it belongs to and invite exactly the drift the pairing prevents.
//   · THE SBTi CNZS V2.0 CRITERIA PDF is included below despite currently living only in a
//     provenance COMMENT in lib/sbti/params.ts. It is a regulatory source and a checker should reach
//     it; it simply has no rendered consumer yet.

// ── THE TWO VERIFIED URLs — RE-EXPORTED, NOT MOVED ───────────────────────────────────────────────
//
// PROPOSAL, and the reasoning is the same one that keeps thresholds out of this file: THEY STAY IN
// lib/sb253.ts AND lib/sb261.ts, AND ARE RE-EXPORTED HERE.
//   · Each sits beside the posture it evidences, and the comment above each explains a distinction
//     that only makes sense there — SB253_PROGRAMME_URL's note that this is the PROGRAMME page and
//     not the stale rulemaking page is unreadable away from the header describing the withdrawal.
//     Moving the URL strands the reasoning.
//   · Both files carry a dated ✅ VERIFIED AGAINST PRIMARY SOURCES header. The URL's verification is
//     part of that same check, on the same date, by the same reading. Splitting them puts half a
//     verification in each of two files.
//   · Re-exporting gives this file the property it exists for — one import, one enumeration, one
//     place a checker or a reader can see every link — without relocating anything or coupling the
//     posture files to this one.
// The cost is that the constants are named in two files. That is one line each, pointing at the
// definition, which is the cheap half of the trade.
export { SB253_PROGRAMME_URL } from './sb253'
export { SB261_DOCKET_URL } from './sb261'

// ── CLIMATE & EMISSIONS ──────────────────────────────────────────────────────────────────────────

// Intent: the GHG Protocol's own site, as the methodology the inventory is built on. A homepage is
// the right target here — the Corporate Standard is one of several and the card names the body, not
// a document. UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const GHG_PROTOCOL_URL = 'https://ghgprotocol.org'

// Intent: the IFRS Foundation's navigator entry for IFRS S2 specifically — the standard itself, not
// the ISSB landing page. If this ever resolves to a general sustainability index, it has drifted and
// the card's "Official source" claim is weaker than it reads.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const IFRS_S2_STANDARD_URL =
  'https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/ifrs-s2-climate-related-disclosures/'

// Intent: TCFD's own site. NOTE FOR WHOEVER VERIFIES THIS ONE FIRST: the TCFD was disbanded in 2023
// and its monitoring passed to the ISSB, so this host is the likeliest in the whole file to have
// become an archive or a redirect. That would still return 200 — the exact failure this file's
// header is about. UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const TCFD_URL = 'https://www.fsb-tcfd.org/'

// Intent: CDP's own site, as the body running the disclosure system.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const CDP_URL = 'https://www.cdp.net'

// Intent: the SBTi's own site, as the body setting the target criteria.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const SBTI_URL = 'https://sciencebasedtargets.org'

// Intent: the Corporate Net-Zero Standard V2.0 CRITERIA document, which lib/sbti/params.ts cites as
// the provenance for its category thresholds and ACA rates. A versioned PDF, so it will move when
// V2.1 lands and the params file's figures change with it — check both together.
// UNVERIFIED: carried over from a provenance comment in lib/sbti/params.ts, not opened. NO RENDERED
// CONSUMER TODAY — it is here so a checker can reach it and so the citation has one home.
// @source-status: unverified
export const SBTI_NET_ZERO_STANDARD_URL =
  'https://files.sciencebasedtargets.org/production/files/Corporate-Net-Zero-Standard-V2-Criteria.pdf'

// Intent: the EPA's eGRID Power Profiler, which the GHG wizard links so a user can look up their own
// grid region. The one link in this file attached to a TOOL rather than to a text.
// UNVERIFIED: carried over from app/dashboard/ghg/page.tsx, not opened.
// @source-status: unverified
export const EPA_EGRID_POWER_PROFILER_URL = 'https://www.epa.gov/egrid/power-profiler'

// Intent: the EPA's landing page for the USEEIO environmentally-extended input-output models, cited
// by SPEND_EF_SOURCES.useeio_us in lib/emissionFactors/spend.ts as the provenance for US
// spend-based factors.
// VERIFIED 14 September 2026: opened. It resolves and describes the model ("melds data on economic
// transactions between 389 industry sectors"), but names NO current version, NO release date and NO
// sector classification — which is exactly why those three fields are null on that source record.
// The "Current Versions and Other Technical Resources" page it links, /land-research/
// useeio-technical-content, returned 404 on the same date.
// @source-status: verified 2026-09-14
export const EPA_USEEIO_URL =
  'https://www.epa.gov/land-research/us-environmentally-extended-input-output-useeio-models'

// ── EU INSTRUMENTS ───────────────────────────────────────────────────────────────────────────────

// Intent: the Commission's CSDDD (CS3D) policy page — the due-diligence directive's official landing
// page, not EUR-Lex. lib/cs3d.ts holds the citation and dates; this is where a reader goes to read
// around them. UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const CS3D_COMMISSION_URL =
  'https://commission.europa.eu/business-economy-euro/doing-business-eu/sustainability-due-diligence-responsible-business/corporate-sustainability-due-diligence_en'

// Intent: the Commission's AI Act regulatory-framework page. lib/aiAct.ts holds the citation and the
// two application dates. UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const EU_AI_ACT_URL = 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai'

// Intent: the Commission's NIS2 directive page. lib/nis2.ts holds the citation, the size test and the
// DORA carve-out — this is the general reference beside them.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const NIS2_COMMISSION_URL = 'https://digital-strategy.ec.europa.eu/en/policies/nis2-directive'

// ── Border carbon ────────────────────────────────────────────────────────────────────────────────
// The regulation itself, as an ELI URI. VERIFIED 200 on 25 Sep 2026. Preferred over the Commission's
// topic page for the same reason as DORA below: an ELI URI is stable by design and is the legal text.
// @source-status: resolves 2026-09-25
export const CBAM_REGULATION_URL = 'https://eur-lex.europa.eu/eli/reg/2023/956/oj'

// ── Environmental claims ─────────────────────────────────────────────────────────────────────────
// The Empowering Consumers for the Green Transition Directive, Directive (EU) 2024/825, as an ELI
// URI: the legal text, linked from the EU line of the Deals environmental-claims finding
// (lib/deals/claimsRules.ts). Meant to open the directive itself on EUR-Lex, not a summary.
// VERIFIED 29 Sep 2026 by opening it: resolves to Directive (EU) 2024/825 of 28 February 2024 on
// empowering consumers for the green transition, the directive this constant is meant to open.
// @source-status: verified 2026-09-29
export const ECGT_DIRECTIVE_URL = 'https://eur-lex.europa.eu/eli/dir/2024/825/oj'

// The Commission's CBAM page, which is where the implementing regulations, sector rules and default
// values actually live — the regulation alone does not carry them. VERIFIED 200 on 25 Sep 2026.
// ⚠️ NOTE THE PATH HAS NO /taxation SEGMENT. The obvious
// taxation-customs.ec.europa.eu/taxation/carbon-border-adjustment-mechanism_en returns 404; the live
// path is one level shallower. Checked, not assumed.
// @source-status: resolves 2026-09-25
export const CBAM_COMMISSION_URL = 'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en'

// ── Assurance ────────────────────────────────────────────────────────────────────────────────────
// ISO 14064-3:2019, the GHG validation and verification standard the assurance pack is assembled for.
// ✅ FORM-VERIFIED 25 Sep 2026. 66455 is ISO 14064-3:2019's catalogue id and /standard/<id>.html is
// ISO's convention, confirmed by a human opening ISO_27001_URL — see the full reasoning there. iso.org
// 403s every automated client, so no fetch can confirm this one and a 403 is not evidence of a dead
// link. Do not redo that search.
// @source-status: form-verified 2026-09-25
export const ISO_14064_3_URL = 'https://www.iso.org/standard/66455.html'

// ── Thresholds ───────────────────────────────────────────────────────────────────────────────────
// The UK government's environmental reporting guidelines, which contain the SECR guidance itself.
// VERIFIED 200 on 25 Sep 2026. Chosen over /guidance/measuring-and-reporting-environmental-impacts
// (also 200) because that page is general business guidance and this one is the SECR publication.
// @source-status: resolves 2026-09-25
export const SECR_GUIDANCE_URL =
  'https://www.gov.uk/government/publications/environmental-reporting-guidelines-including-mandatory-greenhouse-gas-emissions-reporting-guidance'

// ⚠️ WAS THE COMMISSION'S DORA PAGE, AND THAT PAGE IS GONE. Checked 25 Sep 2026: the
// finance.ec.europa.eu implementing-and-delegated-acts path returned 404, and so did the obvious
// successor path. This is now the EUR-Lex ELI URI for Regulation (EU) 2022/2554 itself (verified 200),
// chosen over EIOPA's live summary page for three reasons: an ELI URI is stable by design, it is the
// legal text rather than a supervisor's reading of it, and it matches how lib/cs3d.ts cites directives.
// Renamed from DORA_COMMISSION_URL, because it is no longer the Commission's.
// A Commission topic page is exactly the kind of link that moves; a consolidated ELI URI is not.
// @source-status: resolves 2026-09-25
export const DORA_REGULATION_URL =
  'https://eur-lex.europa.eu/eli/reg/2022/2554/oj'

// ── STANDARDS BODIES ─────────────────────────────────────────────────────────────────────────────

// The ISO catalogue entry for ISO/IEC 42001 (AI management systems).
// ✅ FORM-VERIFIED 25 Sep 2026, and that is as far as a fetch can go — see ISO_27001_URL below for the
// reasoning, which applies to every ISO link here: iso.org 403s automated clients, so a 403 is not
// evidence of a dead link. 81230 is an ISO catalogue id and /standard/<id>.html is ISO's convention,
// confirmed by a human opening the 27001 link. The earlier note here called the id form "more fragile
// than a slug"; the accurate statement is that the id PINS AN EDITION while a slug tracks the current
// one, and pinning is the safer default for a framework reference page.
// @source-status: form-verified 2026-09-25
export const ISO_42001_URL = 'https://www.iso.org/standard/81230.html'

// The ISO catalogue entry for ISO/IEC 27001.
// ✅ VERIFIED BY HUMAN CLICK, 25 Sep 2026: it resolves and serves the ISO/IEC 27001:2022 page. The
// slug form is a WORKING VANITY REDIRECT, not a mistake, and the earlier note here — that two shapes
// for one catalogue meant only one could be the convention — was wrong. Both are current, and they are
// stable in DIFFERENT WAYS:
//   /standard/27001        tracks whatever edition is current, and survives a revision
//   /standard/82875.html   the 2022 edition's catalogue id: pins that edition, and says WHICH one
// ⚠️ 82875 IS THE CANONICAL FALLBACK IF THE VANITY PATH EVER BREAKS. Recorded here so nobody has to
// find it again. Note ISO issues a NEW catalogue id per edition (27001:2013 was 54534), so an id form
// goes stale as a link to a withdrawn standard — which for a framework reference page is arguably the
// right behaviour, since it pins the edition the mapping was built against.
//
// ⚠️ A 403 FROM iso.org IS NOT EVIDENCE OF A DEAD LINK. It blocks automated clients at the edge, with
// or without full browser headers. Every ISO link in this file is therefore FORM-VERIFIED, not
// fetch-verified, and the form is confirmed by this one having been opened by hand.
// @source-status: verified 2026-09-25
export const ISO_27001_URL = 'https://www.iso.org/standard/27001'

// Intent: NIST's AI Risk Management Framework page.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const NIST_AI_RMF_URL = 'https://www.nist.gov/itl/ai-risk-management-framework'

// Intent: NIST's Cybersecurity Framework page. The cards reference CSF 2.0; this URL is version-less,
// so it will follow NIST forward — which is right for a framework page and wrong if the card ever
// needs to cite a specific version.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const NIST_CSF_URL = 'https://www.nist.gov/cyberframework'

// Intent: EcoVadis's own site, as the body operating the rating.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const ECOVADIS_URL = 'https://ecovadis.com'

// ── US STATE ─────────────────────────────────────────────────────────────────────────────────────

// Intent: California Civil Rights Department's pay data reporting portal — the filing surface, which
// is the right target for a card about an annual submission.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
// @source-status: resolves 2026-09-25
export const CA_PAY_DATA_URL = 'https://www.calcivilrights.ca.gov/paydatareporting/'

// ── ⚠️ OPEN: FOUR CARDS, ONE FRONT PAGE ──────────────────────────────────────────────────────────
//
// NOT COLLAPSED INTO A TIDY CONSTANT, DELIBERATELY. Collapsing would make the problem look solved.
//
// app/frameworks/page.tsx points FOUR cards at efrag.org's homepage — ESRS E1, CSRD / ESRS, ESRS S2
// and ESRS S1 — and TWO cards at globalreporting.org's homepage: GRI Standards and GRI 400 series.
// Each card NAMES A SPECIFIC STANDARD and then links to a front page, under the label "Official
// source ↗". Nothing is broken; every one returns 200. But a reader clicking "Official source" on the
// ESRS S1 card lands on EFRAG's front door and has to go looking for the thing the card just named.
//
// THAT IS THE SAME DEFECT AS THE TWO DEAD CARB LINKS, one degree milder: a link that resolves, looks
// authoritative, and does not point at what it claims to. It is exactly what a link checker cannot
// see, and it is why this file's header says the failure mode is not 404.
//
// THE RIGHT FIX IS SIX SPECIFIC URLs WE HAVE NOT SOURCED — a per-standard page for ESRS E1, S1 and
// S2, the CSRD/ESRS entry point, and the two GRI standard pages. Until someone sources them, these
// two constants are HONEST ABOUT BEING FRONT DOORS, and the names say so. Do not rename them to
// something that implies more.
// ⚠️ THE /en IS LOAD-BEARING. Checked 25 Sep 2026: the bare https://www.efrag.org returns 403 to any
// client without a full browser header set, while https://www.efrag.org/en returns 200. Four entries on
// app/frameworks/page.tsx depend on this one constant — CSRD/ESRS, ESRS E1, ESRS S1 and ESRS S2 — so it
// is the most-used source link on that page. Do not "tidy" the path segment away.
// @source-status: resolves 2026-09-25
export const EFRAG_HOME_URL = 'https://www.efrag.org/en'
// @source-status: resolves 2026-09-25
export const GRI_HOME_URL = 'https://www.globalreporting.org'

// Intent: GRI 305: Emissions (2016), the standard the GHG module's `gri` framework chip is built on.
// SEPARATE FROM GRI_HOME_URL, which is the organisation. lib/ghg/engine.ts:1538 cites 305-1, 305-2 and
// 305-3 by number, so a card naming GRI 305 needs the standard itself rather than the publisher: the
// home page cannot tell a reader which disclosures the mapping covers.
// ⚠️ A DIRECT PDF, AND THAT IS THE DOCUMENT. GRI publishes each standard as a PDF under /media/, so
// there is no HTML landing page for 305 to link instead.
// @source-status: verified 2026-09-26
export const GRI_305_URL = 'https://www.globalreporting.org/standards/media/1012/gri-305-emissions-2016.pdf'

// Intent: the SEC's adopting release for the cybersecurity disclosure rules, Release 33-11216, adopted
// 26 July 2023. The rulemaking page rather than a press release, because the release is what states the
// 8-K Item 1.05 and 10-K Item 106 requirements the Cyber module's controls are scored against.
// ⚠️ THE RULES HAD NO CONSTANT AT ALL UNTIL 26 SEP 2026, which is why app/frameworks/page.tsx carried no
// SEC entry while lib/obligations.ts:173 mapped `sec-cyber` to the Cyber module. The module claimed a
// framework the reference page could not describe.
// @source-status: verified 2026-09-26
export const SEC_CYBER_RULES_URL = 'https://www.sec.gov/rules-regulations/2023/07/s7-09-22'

// Intent: section 54 of the UK Modern Slavery Act 2015, "Transparency in supply chains", which is the
// provision that creates the statement duty. Not the Act's front page: the Act covers offences and
// victim protection, and s.54 is the only part the Supply Chain module addresses.
// @source-status: verified 2026-09-26
export const MODERN_SLAVERY_UK_S54_URL = 'https://www.legislation.gov.uk/ukpga/2015/30/section/54'

// Intent: the Australian Modern Slavery Act 2018, named in the framework card's body rather than carried
// as its href. ⚠️ ONE OBLIGATION, TWO JURISDICTIONS, AND THE Item TYPE HOLDS ONE href. Rather than change
// that shape for a single card, the UK section above is the link and Australia is named in the prose. If a
// third jurisdiction arrives, that is the point to reconsider, not this one.
// @source-status: verified 2026-09-26
export const MODERN_SLAVERY_AU_URL = 'https://www.legislation.gov.au/C2018A00153/latest/text'

// ── Forced Labour Reporting, UK and Australia (Stage A, 1 Oct 2026) ────────────────────────────────────
// Read in full on 1 Oct 2026 for lib/forcedLabour/uk/requirements.ts and lib/forcedLabour/au/requirements.ts,
// whose strings were checked word for word against the downloaded text. 'verified' below means that.

// Intent: SI 2015/1833, the Modern Slavery Act 2015 (Transparency in Supply Chains) Regulations 2015. Sets
// the s.54(2)(b) threshold (£36 million) and how total turnover is measured (reg. 3). Latest revised
// version; legislation.gov.uk showed no amendments to it.
// @source-status: verified 2026-10-01
export const UK_TISC_REGULATIONS_URL = 'https://www.legislation.gov.uk/uksi/2015/1833'

// Intent: the Home Office statutory guidance under s.54(9), "Transparency in supply chains: a practical
// guide". The collection page, which carries the current version and its change history (last updated
// 1 Dec 2025). The text was read from its accessible HTML version.
// @source-status: verified 2026-10-01
export const UK_TISC_GUIDANCE_URL = 'https://www.gov.uk/government/publications/transparency-in-supply-chains-a-practical-guide'

// Intent: GOV.UK "Publish an annual modern slavery statement": sign-off, timing and the registry, as the
// Home Office describes them to organisations. Last updated 25 Apr 2024.
// @source-status: verified 2026-10-01
export const UK_MSS_PUBLISH_GUIDANCE_URL = 'https://www.gov.uk/guidance/publish-an-annual-modern-slavery-statement'

// Intent: GOV.UK "Add your modern slavery statement to the statement registry", the registry's guidance.
// @source-status: verified 2026-10-01
export const UK_MSS_REGISTRY_GUIDANCE_URL = 'https://www.gov.uk/guidance/add-your-modern-slavery-statement-to-the-statement-registry'

// Intent: the UK modern slavery statement registry service itself. Opened, not quoted: what it requires
// is recorded from the guidance page above.
// @source-status: resolves 2026-10-01
export const UK_MSS_REGISTRY_URL = 'https://modern-slavery-statement-registry.service.gov.uk/'

// Intent: the Immigration and Asylum Bill (Bill 105, 2026-27), which would amend s.54. ⚠️ THE PARLIAMENT
// BILLS API RECORD, NOT THE PUBLIC PAGE: bills.parliament.uk and publications.parliament.uk return 403 or a
// Cloudflare challenge to an automated client, so the stages were read here on 1 Oct 2026. The bill's own
// text could not be read from either host; see lib/forcedLabour/pendingReforms.ts.
// @source-status: verified 2026-10-01
export const UK_IMMIGRATION_ASYLUM_BILL_URL = 'https://bills-api.parliament.uk/api/v1/Bills/4254'

// Intent: the Home Office impact assessment for the bill (published 30 Jun 2026). Measure 16 lists the
// s.54 changes. An impact assessment describes intent; it is not the bill.
// @source-status: verified 2026-10-01
export const UK_IMMIGRATION_ASYLUM_BILL_IA_URL = 'https://www.gov.uk/government/publications/immigration-and-asylum-bill-2026-impact-assessment'

// Intent: the Regulatory Policy Committee's opinion on that impact assessment (published 14 Aug 2026).
// @source-status: verified 2026-10-01
export const UK_IMMIGRATION_ASYLUM_BILL_RPC_URL = 'https://www.gov.uk/government/publications/rpc-opinion-impact-of-immigration-and-asylum-bill'

// Intent: "Commonwealth Modern Slavery Act 2018: Guidance for Reporting Entities" (May 2023), from the
// Modern Slavery Statements Register's resources. ⚠️ ag.gov.au, the Department's own site, timed out on
// every attempt on 1 Oct 2026; the register is the Department's and serves the same document.
// @source-status: verified 2026-10-01
export const AU_MSA_GUIDANCE_URL = 'https://modernslaveryregister.gov.au/resources/Commonwealth_Modern_Slavery_Act_Guidance.pdf'

// Intent: supplementary guidance, principal governing body approval (March 2026): no delegation of approval.
// @source-status: verified 2026-10-01
export const AU_MSA_PGB_GUIDANCE_URL =
  'https://modernslaveryregister.gov.au/resources/MODERN_SLAVERY_ACT_SUPPLEMENTARY_GUIDANCE_-_Principal_Governing_Body_Approval_-_2026.pdf'

// Intent: supplementary guidance, signature of a responsible member (March 2026).
// @source-status: verified 2026-10-01
export const AU_MSA_SIGNATURE_GUIDANCE_URL =
  'https://modernslaveryregister.gov.au/resources/MODERN_SLAVERY_ACT_SUPPLEMENTARY_GUIDANCE_-_Signature_of_Responsible_Member__2026.pdf'

// Intent: the register's submission process overview (August 2025): one PDF, up to 400MB.
// @source-status: verified 2026-10-01
export const AU_MSS_SUBMISSION_URL = 'https://modernslaveryregister.gov.au/resources/MSS_Submission_Overview.pdf'

// Intent: the Modern Slavery Statements Register (s.18 of the Act), where statements are lodged and published.
// @source-status: resolves 2026-10-01
export const AU_MSS_REGISTER_URL = 'https://modernslaveryregister.gov.au/'

// Intent: the SASB Standards, now maintained by the ISSB under the IFRS Foundation, which is why this is
// an ifrs.org URL and not sasb.org. app/dashboard/people/page.tsx:285 offers "SASB Human Capital" as a
// selectable framework, so the claim is about the human-capital topics and not the full set of 77
// industry standards.
// @source-status: verified 2026-09-26
export const SASB_STANDARDS_URL = 'https://www.ifrs.org/issued-standards/sasb-standards/'

// Intent: the Fighting Against Forced Labour and Child Labour in Supply Chains Act, S.C. 2023, c. 9 (the
// bill number S-211 is what everyone calls it, and what lib/deals/assessment.ts:578 stores as the
// framework name). Section 2 carries the "entity" definition the Deals threshold test is built from.
// ⚠️ THE JUSTICE LAWS PAGE, NOT A SUMMARY. The size limbs are numbers in the definition, so the test's
// citation has to reach the definition itself.
// The same page carries s.9 (which entities Part 2 applies to), s.10 (control) and s.11 (the annual
// report), which lib/s211/requirements.ts transcribes. Read again on 30 Sep 2026, when it showed "Act
// current to 2026-09-21 and last amended on 2024-01-01".
// @source-status: verified 2026-09-30
export const CANADA_S211_URL = 'https://laws-lois.justice.gc.ca/eng/acts/F-10.6/page-1.html'

// Intent: Public Safety Canada's "Guidance for entities" on preparing a report under the same Act. It is
// the page lib/s211/requirements.ts is transcribed from: the example attestation and its signature
// lines, the mandatory information a report must contain (the steps taken, and requirements (a) to
// (g)), and the two-step test for who is an entity and who must report.
// ⚠️ GUIDANCE, NOT THE STATUTE. It restates sections 2 and 11; CANADA_S211_URL above is the Act. The
// page showed "Date modified: 2025-12-18" when read; a later date there means the transcription in
// lib/s211/requirements.ts has to be compared with it again.
// @source-status: verified 2026-09-30
export const S211_GUIDANCE_URL =
  'https://www.publicsafety.gc.ca/cnt/cntrng-crm/frcd-lbr-cndn-spply-chns/prpr-rprt-en.aspx'

// Intent: the International Reporting Template on Modern Slavery, Forced Labour and Child Labour, which
// the governments of Canada, the United Kingdom and Australia developed together and Public Safety
// Canada publishes. It groups the three countries' reporting requirements into seven areas and names
// the provision of each country's Act behind each area. lib/s211/requirements.ts transcribes the seven
// area headings and one sentence on goal plans.
// ⚠️ OPTIONAL, AND NOT THE ACT. The guidance calls it an "optional template". It asks for things the
// Canadian Act does not (services as well as goods, the number of incidents found, training given to
// suppliers), so nothing in it is to be presented as a Canadian requirement.
// The page showed "Date modified: 2026-07-28" and the template "Version 1" of July 2025 when read.
// @source-status: verified 2026-09-30
export const S211_TEMPLATE_URL =
  'https://www.publicsafety.gc.ca/cnt/cntrng-crm/frcd-lbr-cndn-spply-chns/ntrntnl-rprtng-frcd-lbr-chld-lbr-tmplt-en.aspx'
