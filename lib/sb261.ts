// lib/sb261.ts
// SINGLE SOURCE for the California SB 261 posture — and the posture is the whole fact here, because
// THERE IS NO DATE TO CARRY.
//
// SB 261's first-report deadline of 1 January 2026 is not in effect and nothing has replaced it.
// That is not a rulemaking in progress, the way it is for SB 253 — it is a court order. On
// 18 November 2025 the Ninth Circuit granted an injunction pending appeal barring enforcement of
// SB 261, and declined to extend it to SB 253. So there is deliberately NO SB261_FIRST_REPORT_DATE:
// no date exists, and a constant holding '' or 'not set' would be a value present and wrong — the
// same failure ObligationPrice in lib/obligations.ts was made a discriminated union to prevent.
//
// ✅ VERIFIED AGAINST PRIMARY SOURCES, 12 August 2026 — the Ninth Circuit order of 18 November 2025
// in Chamber of Commerce v. Sanchez, No. 25-5327, and CARB's SB 261 docket page. The docket page
// independently confirms the order, the case number, and CARB's decision not to enforce §38533 for
// the 1 January 2026 deadline — so the sentence below is CARB's own account, not a paraphrase of
// secondary reporting.
//
// ⚠️ THE PERISHABLE CLAIM IS "HAS NOT RULED", and it perishes differently from anything in
// lib/sb253.ts. The court heard argument on 9 January 2026 and can rule ANY DAY — no rulemaking, no
// comment period, no advance signal. An SB 253 date moves through a 15-day notice and OAL approval,
// so it is visible before it lands and a stale value is wrong by a margin. Here a stale "has not
// ruled" is a claim about a live case that may have been decided that morning, and it would be read
// as current. RE-CHECK THE DOCKET before relying on this file, not merely before promoting it.
//
// WHY THIS FILE EXISTS. The posture lived as FOUR SPELLINGS across three files: 'Enforcement paused
// — no new date set' in the /assess timing cell, 'SB 261 · enforcement paused' on the pricing tag,
// 'Enforcement paused (appeal pending)' in the climate-risk Status column, and "California's SB 261
// appeal are all in motion" in the disclaimer under that same table. The long-form account existed
// in exactly ONE string literal on ONE page, so three of the four surfaces stated a posture no
// reader could check. WORSE, the framework directory card described SB 261 as 'biennial climate
// risk reporting aligned to TCFD' WITH NO POSTURE AT ALL — an ordinary recurring duty asserted for
// a statute whose enforcement is barred, on the page a reader consults to learn what a regime is.
// ANY SURFACE NAMING THE SB 261 POSTURE IMPORTS FROM HERE.
//
// NOTE ON SCOPE. DISPLAY STRINGS ONLY. Whether SB 261 reaches a given company is decided by the
// /assess gate — `hasCA && revUSD >= 500_000_000` — which carries both limbs: the $500m revenue
// figure and the California nexus. Neither is restated here, and nothing here is read to decide
// applicability. Same split lib/sb253.ts keeps against THRESHOLD_TESTS['SB 253'].

// The instrument. SB 261 is the bill number, not the law — §38533 is what a reader checks, and it
// appeared exactly once in the repo before this file. The slot it serves is any surface naming the
// regime without an obligation attached, above all the framework directory card, which today names
// no instrument at all. lib/sb253.ts's SB253_CITATION is exported and imported by nothing; that is
// the outcome to avoid here, not the precedent to follow.
export const SB261_CITATION = 'California Health & Safety Code §38533 (SB 261)'

// The case IS the instrument for the posture, the way a directive number is for CS3D — the pause
// exists because of this order and nothing else. Separate from the sentence below so a surface with
// room for an attribution but not a paragraph can cite the authority rather than gesture at "an
// appeal".
export const SB261_CASE = 'Chamber of Commerce v. Sanchez, No. 25-5327 (9th Cir.)'

// The docket. SB261_STATUS_SENTENCE tells a reader voluntary filing is live; this is where it
// happens, and the two must not drift apart. Verified live 12 August 2026 — the previous link on
// the framework directory card had rotted to a 404, which is why this is a constant and not a
// literal at the call site. NOTE THE WINDOW: CARB states submittals run 1 December 2025 to
// 31 December 2026. After that date the sentence's claim that CARB "keeps a public docket" needs
// re-checking, and this URL may outlive the fact it asserts.
export const SB261_DOCKET_URL = 'https://ww2.arb.ca.gov/public-comments/climate-related-financial-risk-reports-sb-261-docket'

// The full posture, for any surface with room for a sentence. Lifted VERBATIM from the /assess
// `what` string, minus its opening threshold sentence (applicability, not posture — see the scope
// note) and minus the leading citation clause, which SB261_CITATION now carries. States what the
// court did, what it did NOT do, that the old deadline is dead, that no ruling has issued, that no
// replacement date exists, and what a company can still do — so a reader can judge how much to rely
// on it rather than being handed the word "paused" and left to guess what it means.
export const SB261_STATUS_SENTENCE =
  'On 18 November 2025 the Ninth Circuit granted an injunction pending appeal barring enforcement of SB 261 — Chamber of Commerce v. Sanchez, No. 25-5327 — and declined to extend it to SB 253. The 1 January 2026 deadline is not in effect. The court heard argument on 9 January 2026 and has not ruled. If SB 261 is upheld, CARB has not said when a new deadline would fall. CARB keeps a public docket for companies that choose to file in the meantime.'

// THE SAME POSTURE AT TWO WIDTHS, and the two are the whole short-form vocabulary. SB261_SHORT is
// the chip or tag form, for a slot that must also carry the regime's name. SB261_TABLE_STATUS is
// the Status-column form, sized against siblings reading 'In force (scope simplified by Omnibus)',
// 'Rules expected from FY2027' and 'Live & expanding' — wider than a tag, narrower than a sentence,
// and it must say that the pause has no end date because every sibling in that column states one.
//
// A SURFACE NEEDING MORE THAN EITHER USES SB261_STATUS_SENTENCE. It does not invent a third form.
// Four spellings is what this file was created to end, and a fifth arrives the same way the first
// four did — a slot that fit neither existing string, filled in place.
export const SB261_SHORT = 'SB 261 · enforcement paused'

export const SB261_TABLE_STATUS = 'Enforcement paused — appeal pending, no new date'
