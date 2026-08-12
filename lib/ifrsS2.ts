// lib/ifrsS2.ts
// SINGLE SOURCE for what the repo says about IFRS S2 adoption — and the first thing it says is that
// A BARE COUNT IS NOT AN ANSWER, because the question it answers was never stated.
//
// IFRS S2 is not law. The ISSB issues a standard; each jurisdiction decides whether to adopt it, on
// what timetable, and whether voluntarily or mandatorily. So "IFRS S2 applies to you" is never a
// fact about the standard — it is a fact about where you report, and it differs per jurisdiction.
// Every constant below is shaped by that: none of them asserts a duty, because none of them can.
//
// ✅ VERIFIED AGAINST PRIMARY SOURCES, 12 August 2026 — the IFRS Foundation's jurisdictional
// profiles, and S&P Global's ISSB adoption tracking as of 22 April 2026.
//
// ⚠️ THE COUNT ANSWERS A QUESTION AND MUST SAY WHICH. As of April 2026, 28 jurisdictions had adopted
// the ISSB standards on a voluntary or mandatory basis, with a further 12 planning to. The IFRS
// Foundation SEPARATELY counts 36 that have adopted, otherwise used, or are in the process of
// adopting. Both figures are correct; they count different things. So the repo's '30+' and '36+'
// were NOT two answers to one question — they were two different questions, neither of them stated,
// and a reader comparing two ThemisIQ pages had no way to tell that. THAT IS WHY A BARE NUMBER
// CANNOT FIX THIS: whichever number won, the page would still be answering a question it had not
// asked. IFRS_S2_ADOPTION_COUNT therefore carries its own qualifier and its own as-of date, and no
// surface may print a figure without them.
//
// ⚠️ NAMING JURISDICTIONS IS FRAGILE, AND THE OLD COPY SHOWS WHY. Each named jurisdiction is a
// SEPARATE CLAIM THAT ROTS SEPARATELY — a list of six is six maintenance obligations, not one. The
// previous /assess copy named the EU, UK, Australia, Canada, Singapore and Japan. On checking:
//   EU        — WRONG. The EU does not apply IFRS S2. CSRD requires ESRS, a different instrument
//               this repo distinguishes everywhere else; naming it here contradicted our own pages.
//   UK        — voluntary only, not an adopter in the operative sense (see the sentence below).
//   Canada    — voluntary only, same.
//   Singapore — unverified.
//   Japan     — unverified.
//   Australia — SURVIVES. Mandatory and running.
// ONE OF SIX HELD. A list that is five-sixths wrong is worse than no list, because each entry reads
// as checked. So the constants below name a jurisdiction only where the position was verified and
// is materially different — and IFRS_S2_STATUS_SENTENCE says what KIND of adoption each is, since
// "adopted" covering both a mandatory regime and a voluntary endorsement is how the old list misled.
//
// WHY THIS FILE EXISTS. The count lived as FOUR literals across four surfaces in TWO different
// values: '30+ jurisdictions' on /assess, /climate-ghg and /deals, and '36+ jurisdictions' on
// /climate-risk — with no shared constant, so nothing could notice they disagreed. A customer
// reading two ThemisIQ pages in one session saw two numbers for one claim. That is the same defect
// class as the SB 253 date in five spellings, and the same fix: one constant, carrying its own
// posture, imported everywhere.
// ANY SURFACE NAMING AN IFRS S2 ADOPTION COUNT OR ADOPTION POSTURE IMPORTS FROM HERE.
//
// NOTE ON SCOPE. DISPLAY STRINGS ONLY. Whether IFRS S2 reaches a given company is a JURISDICTION
// question, decided by the /assess gate and — separately, and inconsistently — by the Deals engine.
// See the open disagreement recorded at the foot of this file. Nothing here is read to decide
// applicability, and no threshold is restated. Same split lib/sb253.ts keeps against
// THRESHOLD_TESTS['SB 253'].

// The standard itself. Not a statute and not a citation to one — which is the point, and why this
// is the only "citation" constant in the repo that names an issuing body rather than a legislature.
// The slot it serves is any surface naming IFRS S2 as an instrument: a framework directory card, a
// findings label, a methodology note.
export const IFRS_S2_CITATION = 'IFRS S2 Climate-related Disclosures (ISSB, June 2023)'

// The count, WITH the question it answers and the date it answers it on. Never decomposed: a
// surface that wants "28" alone is asking for the figure that started this. If a slot cannot fit
// this string, it must use IFRS_S2_SHORT, which names no number at all.
export const IFRS_S2_ADOPTION_COUNT =
  '28 jurisdictions have adopted the ISSB standards on a voluntary or mandatory basis, with a further 12 planning to (April 2026)'

// The chip, tag or nav-width form — and it CARRIES NO NUMBER, deliberately. A number needs its
// qualifier and its as-of date to mean anything, and neither fits a chip; a chip reading
// 'IFRS S2 · 28 jurisdictions' would reintroduce the exact ambiguity this file exists to end, in
// the slot least able to caveat it. What survives compression is the SHAPE of the fact — that
// adoption happens jurisdiction by jurisdiction — which is the part a reader needs to know before
// they can act on any number. Matches the wording already used in the climate-risk coverage table.
export const IFRS_S2_SHORT = 'IFRS S2 · adopted jurisdiction by jurisdiction'

// The full posture, for any surface with room for a paragraph. States that the standard is not law
// on its own, that adoption is per-jurisdiction, and WHAT KIND of adoption the three verified
// positions are — mandatory, voluntary-with-a-proposal, and not-applicable — because "adopted"
// flattening those three is how the old six-jurisdiction list misled. Ends by handing the question
// back to the reader, since this file cannot know where they report.
export const IFRS_S2_STATUS_SENTENCE =
  'IFRS S2 is not law by itself: the ISSB issues the standard and each jurisdiction decides whether and how to adopt it, so what you owe depends on where you report. Australia’s regime is mandatory and running. The UK has endorsed the standards as UK SRS S1 and S2, published 25 February 2026 for voluntary use, with the FCA proposing mandatory reporting for certain listed companies from 1 January 2027. The EU does not apply IFRS S2 — CSRD requires ESRS, which is interoperable with it but separate. Confirm the position in each jurisdiction where you report.'

// ── OPEN: THE TWO SURFACES DISAGREE ABOUT WHO IFRS S2 REACHES ────────────────────────────────────
//
// NOT RESOLVED HERE, and recorded so the next reader is not surprised.
//
// app/assess/page.tsx gates its IFRS S2 entry on
//     hasEU || hasUK || hasAU || jur.includes('canada') || jur.includes('apac')
// which EXCLUDES the USA and Global. lib/deals/assessment.ts:1175 emits `plain('IFRS S2')`
// UNCONDITIONALLY, commented "Investor baseline (expected regardless of jurisdiction)".
//
// So for a US target the Deals engine asserts IFRS S2 and /assess withholds it. Both readings are
// defensible — an investor baseline is a real thing and is not the same claim as a reporting duty —
// but they are different claims wearing one name, and nothing in either file says which is meant.
// Resolving it means deciding whether the token means "you must report under this" or "your
// investors will expect this", and that changes what at least one surface tells a customer.
//
// THIS FILE CANNOT SETTLE IT. It carries display strings; that is a logic question, and it belongs
// with whoever next touches the gate or THRESHOLD_TESTS.
