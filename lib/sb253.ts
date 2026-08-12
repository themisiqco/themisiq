// lib/sb253.ts
// SINGLE SOURCE for the California SB 253 first-report date — and, as importantly, for the fact that
// THE DATE IS NOT SETTLED.
//
// IT HAS BEEN SET MORE THAN ONCE, AND NOTHING IS IN FORCE. The Board approved the initial regulation
// on 26 February 2026 — Title 17 CCR, Article 6, sections 96070-96077 — carrying a 10 August 2026
// first-report date, subject to Office of Administrative Law approval. CARB submitted it to OAL on
// 20 May 2026 and then WITHDREW it, to clarify certain requirements and to defer the date from
// 10 August to 10 November 2026. Modified text was published 27 July 2026 with public comment closing
// 11 August 2026; as of 12 August 2026 the package has not returned to OAL. So 10 August was never in
// force either — it died with the withdrawal — and 10 November 2026 is a PROPOSAL, not law. That is
// why SB253_DATE_STATUS exists and why every surface must carry it.
//
// ✅ VERIFIED AGAINST PRIMARY SOURCES, 12 August 2026 — CARB's Notice of Public Availability of
// Modified Text (15-Day Notice), published 27 July 2026, and CARB's rulemaking page for the California
// Corporate Greenhouse Gas Reporting and Climate-Related Financial Risk Disclosure Initial Regulation.
// Note the rulemaking page was itself stale when checked (last reviewed 29 December 2025) and still
// showed the Final Package pending at OAL, which the withdrawal had already overtaken — the 15-Day
// Notice is the governing record. Re-check before promoting any date here to final.
//
// WHY THIS FILE EXISTS. The date lived as eight prose literals in five spellings — 'November 10, 2026',
// 'Nov 10, 2026', 'Nov 10', 'November 10', '2026' — and as FIVE independent countdown blocks with
// THREE different hardcoded seeds (81, 81, 83), each asserting the date as a settled deadline counting
// down to it. One of those countdowns rendered in the site-wide nav, above CBAM and AI Governance
// content. All five clamped at zero or flipped branch, so the day after the date they would have read
// "0 days away" rather than reading as wrong. No surface cited an instrument for the date.
// ANY SURFACE NAMING THE SB 253 FIRST-REPORT DATE IMPORTS FROM HERE, AND NAMES THE POSTURE.
//
// NOTE ON SCOPE. The engine (THRESHOLD_TESTS['SB 253'] in lib/deals/assessment.ts) asserts the
// $1bn revenue THRESHOLD and no date at all — deliberately. Nothing here is used to decide
// applicability; these are display strings for copy.

export const SB253_FIRST_REPORT_DATE = '10 November 2026'

// 'proposed', never 'final', until CARB finalises and OAL approves. A surface that prints the date
// without this word states as settled a date that has already moved once, and an earlier date
// that was approved and then withdrawn before it ever took effect.
export const SB253_DATE_STATUS = 'proposed'

export const SB253_SCOPE3_FROM = '2027'

export const SB253_CITATION =
  'California Health & Safety Code §38532; CARB initial regulation (Title 17 CCR §§96070-96077) approved by the Board 26 February 2026, withdrawn from OAL review, modified text published 27 July 2026 — not yet approved'

// The statute alone, for a slot that needs the instrument but not its history — a directory card,
// a chip, a table cell. SB261_CITATION is the sibling and is deliberately the same shape.
export const SB253_STATUTE = 'California Health & Safety Code §38532 (SB 253)'

// The programme page. Verified live 12 August 2026. Note this is the PROGRAMME page, not the
// rulemaking page — the rulemaking page was stale when checked (last reviewed 29 December 2025)
// and still showed the Final Package pending at OAL, which the withdrawal had overtaken. The
// previous link on the framework directory card had rotted to a 404, which is why this is a
// constant and not a literal at the call site.
export const SB253_PROGRAMME_URL = 'https://ww2.arb.ca.gov/our-work/programs/california-corporate-greenhouse-gas-reporting-and-climate-related-financial-risk'

// The full posture, for any surface with room for a sentence. States what is proposed, what it covers,
// that it is not final, what remains outstanding, and that it has moved — so a reader can judge how
// much to rely on it rather than being handed a countdown.
export const SB253_STATUS_SENTENCE =
  'CARB has proposed 10 November 2026 for the first SB 253 report — Scope 1 and 2 for the prior fiscal year. The date is not final: the modified regulation closed public comment on 11 August 2026 and still requires OAL approval. An earlier date of 10 August 2026 was approved and then withdrawn before it took effect.'

// For a chip, tag or nav-width slot where the sentence will not fit. Carries the posture in the
// shortest honest form; if even this does not fit, the surface should name no date.
export const SB253_SHORT = 'SB 253 · 10 Nov 2026 proposed'

// Name-free posture, for a slot whose surrounding prose already names the regime — a directory
// card, a sentence, a table cell. SB253_SHORT carries the name and suits a chip standing alone;
// this one does not, and the two are not interchangeable. SB261_TABLE_STATUS is the sibling.
export const SB253_POSTURE = 'first report proposed for 10 November 2026, not yet final'

// For a slot whose siblings read 'Annual — July' / 'FY2024 (large EU companies)' / 'Jurisdiction
// dependent' — i.e. FRAMEWORKS.deadline in lib/ghg/engine.ts, rendered in the GHG export summary
// beside computed totals under the label "Deadline". Short by necessity, but it must still carry the
// posture: this was the only sibling naming a specific day, and it named it as settled.
export const SB253_FRAMEWORK_DEADLINE = '10 Nov 2026 — proposed, not final'
