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
// UNVERIFIED from the call site it replaces — moved, not validated. Collecting them into one file
// makes them checkable; it does not make them checked. A future reader must not read registry
// membership as a warrant. Each constant says which it is.
//
// NOTE ON SCOPE. LINKS ONLY — no dates, no thresholds, no posture. Those live with their regimes
// (lib/sb253.ts, lib/sb261.ts, lib/nis2.ts, lib/cs3d.ts, lib/aiAct.ts, lib/ifrsS2.ts), and a URL that
// documents a posture belongs there too, beside the reasoning it evidences. See the re-export note
// below, and the two deliberate exclusions:
//
//   · THE ECB FX REFERENCE PDF (lib/deals/assessment.ts, inside FX_SOURCE) STAYS WHERE IT IS. Its
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
export const GHG_PROTOCOL_URL = 'https://ghgprotocol.org'

// Intent: the IFRS Foundation's navigator entry for IFRS S2 specifically — the standard itself, not
// the ISSB landing page. If this ever resolves to a general sustainability index, it has drifted and
// the card's "Official source" claim is weaker than it reads.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const IFRS_S2_STANDARD_URL =
  'https://www.ifrs.org/issued-standards/ifrs-sustainability-standards-navigator/ifrs-s2-climate-related-disclosures/'

// Intent: TCFD's own site. NOTE FOR WHOEVER VERIFIES THIS ONE FIRST: the TCFD was disbanded in 2023
// and its monitoring passed to the ISSB, so this host is the likeliest in the whole file to have
// become an archive or a redirect. That would still return 200 — the exact failure this file's
// header is about. UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const TCFD_URL = 'https://www.fsb-tcfd.org/'

// Intent: CDP's own site, as the body running the disclosure system.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const CDP_URL = 'https://www.cdp.net'

// Intent: the SBTi's own site, as the body setting the target criteria.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const SBTI_URL = 'https://sciencebasedtargets.org'

// Intent: the Corporate Net-Zero Standard V2.0 CRITERIA document, which lib/sbti/params.ts cites as
// the provenance for its category thresholds and ACA rates. A versioned PDF, so it will move when
// V2.1 lands and the params file's figures change with it — check both together.
// UNVERIFIED: carried over from a provenance comment in lib/sbti/params.ts, not opened. NO RENDERED
// CONSUMER TODAY — it is here so a checker can reach it and so the citation has one home.
export const SBTI_NET_ZERO_STANDARD_URL =
  'https://files.sciencebasedtargets.org/production/files/Corporate-Net-Zero-Standard-V2-Criteria.pdf'

// Intent: the EPA's eGRID Power Profiler, which the GHG wizard links so a user can look up their own
// grid region. The one link in this file attached to a TOOL rather than to a text.
// UNVERIFIED: carried over from app/dashboard/ghg/page.tsx, not opened.
export const EPA_EGRID_POWER_PROFILER_URL = 'https://www.epa.gov/egrid/power-profiler'

// Intent: the EPA's landing page for the USEEIO environmentally-extended input-output models, cited
// by SPEND_EF_SOURCES.useeio_us in lib/emissionFactors/spend.ts as the provenance for US
// spend-based factors.
// VERIFIED 14 September 2026: opened. It resolves and describes the model ("melds data on economic
// transactions between 389 industry sectors"), but names NO current version, NO release date and NO
// sector classification — which is exactly why those three fields are null on that source record.
// The "Current Versions and Other Technical Resources" page it links, /land-research/
// useeio-technical-content, returned 404 on the same date.
export const EPA_USEEIO_URL =
  'https://www.epa.gov/land-research/us-environmentally-extended-input-output-useeio-models'

// ── EU INSTRUMENTS ───────────────────────────────────────────────────────────────────────────────

// Intent: the Commission's CSDDD (CS3D) policy page — the due-diligence directive's official landing
// page, not EUR-Lex. lib/cs3d.ts holds the citation and dates; this is where a reader goes to read
// around them. UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const CS3D_COMMISSION_URL =
  'https://commission.europa.eu/business-economy-euro/doing-business-eu/sustainability-due-diligence-responsible-business/corporate-sustainability-due-diligence_en'

// Intent: the Commission's AI Act regulatory-framework page. lib/aiAct.ts holds the citation and the
// two application dates. UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const EU_AI_ACT_URL = 'https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai'

// Intent: the Commission's NIS2 directive page. lib/nis2.ts holds the citation, the size test and the
// DORA carve-out — this is the general reference beside them.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const NIS2_COMMISSION_URL = 'https://digital-strategy.ec.europa.eu/en/policies/nis2-directive'

// ── Border carbon ────────────────────────────────────────────────────────────────────────────────
// The regulation itself, as an ELI URI. VERIFIED 200 on 25 Sep 2026. Preferred over the Commission's
// topic page for the same reason as DORA below: an ELI URI is stable by design and is the legal text.
export const CBAM_REGULATION_URL = 'https://eur-lex.europa.eu/eli/reg/2023/956/oj'

// The Commission's CBAM page, which is where the implementing regulations, sector rules and default
// values actually live — the regulation alone does not carry them. VERIFIED 200 on 25 Sep 2026.
// ⚠️ NOTE THE PATH HAS NO /taxation SEGMENT. The obvious
// taxation-customs.ec.europa.eu/taxation/carbon-border-adjustment-mechanism_en returns 404; the live
// path is one level shallower. Checked, not assumed.
export const CBAM_COMMISSION_URL = 'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en'

// ── Assurance ────────────────────────────────────────────────────────────────────────────────────
// ISO 14064-3:2019, the GHG validation and verification standard the assurance pack is assembled for.
// ✅ FORM-VERIFIED 25 Sep 2026. 66455 is ISO 14064-3:2019's catalogue id and /standard/<id>.html is
// ISO's convention, confirmed by a human opening ISO_27001_URL — see the full reasoning there. iso.org
// 403s every automated client, so no fetch can confirm this one and a 403 is not evidence of a dead
// link. Do not redo that search.
export const ISO_14064_3_URL = 'https://www.iso.org/standard/66455.html'

// ── Thresholds ───────────────────────────────────────────────────────────────────────────────────
// The UK government's environmental reporting guidelines, which contain the SECR guidance itself.
// VERIFIED 200 on 25 Sep 2026. Chosen over /guidance/measuring-and-reporting-environmental-impacts
// (also 200) because that page is general business guidance and this one is the SECR publication.
export const SECR_GUIDANCE_URL =
  'https://www.gov.uk/government/publications/environmental-reporting-guidelines-including-mandatory-greenhouse-gas-emissions-reporting-guidance'

// ⚠️ WAS THE COMMISSION'S DORA PAGE, AND THAT PAGE IS GONE. Checked 25 Sep 2026: the
// finance.ec.europa.eu implementing-and-delegated-acts path returned 404, and so did the obvious
// successor path. This is now the EUR-Lex ELI URI for Regulation (EU) 2022/2554 itself (verified 200),
// chosen over EIOPA's live summary page for three reasons: an ELI URI is stable by design, it is the
// legal text rather than a supervisor's reading of it, and it matches how lib/cs3d.ts cites directives.
// Renamed from DORA_COMMISSION_URL, because it is no longer the Commission's.
// A Commission topic page is exactly the kind of link that moves; a consolidated ELI URI is not.
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
export const ISO_27001_URL = 'https://www.iso.org/standard/27001'

// Intent: NIST's AI Risk Management Framework page.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const NIST_AI_RMF_URL = 'https://www.nist.gov/itl/ai-risk-management-framework'

// Intent: NIST's Cybersecurity Framework page. The cards reference CSF 2.0; this URL is version-less,
// so it will follow NIST forward — which is right for a framework page and wrong if the card ever
// needs to cite a specific version.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const NIST_CSF_URL = 'https://www.nist.gov/cyberframework'

// Intent: EcoVadis's own site, as the body operating the rating.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
export const ECOVADIS_URL = 'https://ecovadis.com'

// ── US STATE ─────────────────────────────────────────────────────────────────────────────────────

// Intent: California Civil Rights Department's pay data reporting portal — the filing surface, which
// is the right target for a card about an annual submission.
// UNVERIFIED: carried over from app/frameworks/page.tsx, not opened.
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
export const EFRAG_HOME_URL = 'https://www.efrag.org/en'
export const GRI_HOME_URL = 'https://www.globalreporting.org'
