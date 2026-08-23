// lib/csrd.ts
// SINGLE SOURCE for what the repo says about CSRD scope and reporting dates.
//
// WHY THIS FILE EXISTS. On 23 August 2026 two ThemisIQ pages stated the law differently.
// /materiality carried a hand-typed card headed "Wave 2 · 2026" saying large EU companies "file
// their first ESRS reports starting in 2026 for FY2025 data; Wave 2 listed SMEs follow for FY2026".
// /impact-materiality, written later, said the first reports cover FY2027 and are published in 2028
// and that listed SMEs have been removed from mandatory scope entirely. A customer reading both in
// one session got two accounts of when they must report and whether they are in scope at all.
// The IFRS S2 side of the SAME CARD did not drift, because it reads IFRS_S2_STATUS_SENTENCE from
// lib/ifrsS2.ts. The CSRD side drifted because it was prose nobody owned. That asymmetry is the
// whole argument for this file.
// ANY SURFACE STATING A CSRD SCOPE THRESHOLD OR REPORTING DATE IMPORTS FROM HERE.
//
// ⚠️ ONE DOCUMENTED COPY REMAINS, AND A CONSTANT DOES NOT CLOSE IT BY ITSELF.
// app/impact-materiality/page.tsx states these facts in flowing prose at the paragraphs beginning
// "EU companies are in scope with…", "Non-EU companies are caught on…" and "2028 isn't far away…",
// and in its first footnote. That prose is deliberately written and interpolating it through
// constants would damage it, so it is NOT wired to this file. It is instead RECORDED here: if a
// value below changes, those four passages change with it. This reduces two independent sources to
// one authority plus one known copy. It does not make the copy disappear.
//
// ⚠️ NO CSRD_CITATION. The Directive's own number appears NOWHERE in this codebase, and typing one
// from memory into the file whose entire job is preventing drift would be the wrong way to open it.
// Lisa is verifying it against a primary source; it lands then, not before. ESRS_SET1_CITATION
// below IS safe — it is already cited four times in app/dashboard/materiality/report/page.tsx.
//
// SCOPE. DISPLAY STRINGS ONLY, the same split lib/ifrsS2.ts and lib/sb253.ts keep. Whether CSRD
// reaches a given company is an applicability question, decided by /assess and THRESHOLD_TESTS.
// Nothing here is read to decide it. Note also that lib/obligations.ts has NO CSRD entry, by a
// documented decision — no module covers ESRS G1 — and this file does not change that.

// As-of stamp. Every sentence below is true as at this date and not asserted beyond it. Any surface
// printing one of them should be able to print this too.
export const CSRD_AS_OF = 'as at August 2026'

// Why the as-of matters more here than for a settled instrument.
export const CSRD_REVISION_NOTE =
  'Both CSRD scope and the ESRS standards were revised during 2026, and guidance for non-EU groups '
  + 'is still in development.'

// The dateless label, for a slot too small to carry a sentence. The IFRS_S2_SHORT role: it names
// the instrument's posture and no number, so it cannot go stale between revisions.
export const CSRD_SHORT = 'EU law · double materiality required'

// ⚠️ "BOTH, NOT EITHER" IS LOAD-BEARING AND STAYS IN THE STRING. The two-limb test is the single
// most commonly misread thing about CSRD scope, and a company over one limb and under the other is
// exactly the reader this sentence exists for.
export const CSRD_EU_SCOPE_SENTENCE =
  'EU companies are in scope with more than 1,000 employees and more than €450 million in net '
  + 'turnover — both, not either.'

export const CSRD_FIRST_REPORT_SENTENCE =
  'Companies already reporting continue; everyone else who remains in scope reports for financial '
  + 'year 2027, published in 2028.'

// Stated as its own sentence rather than folded into scope, because it is a REMOVAL. A reader who
// was told in 2024 that listed SMEs were in scope needs to see the change, not a list they are
// silently missing from.
export const CSRD_LISTED_SME_SENTENCE =
  'Listed SMEs have been removed from mandatory scope entirely.'

// ⚠️ "BROADLY" AND "A THRESHOLD OF ITS OWN" ARE DELIBERATE HEDGES, NOT SLOPPY WRITING. The non-EU
// test turns on EU footprint rather than global size, the subsidiary/branch limb has its own
// figures, and the rules are not final. A sentence that stated this crisply would be stating more
// than is known.
export const CSRD_NON_EU_SENTENCE =
  'Non-EU companies are caught on EU footprint rather than global size — broadly, more than €450 '
  + 'million of net turnover generated in the EU, plus an EU subsidiary or branch above a threshold '
  + 'of its own. Timing runs later and the rules are still being finalised.'

// What CSRD requires, as distinct from when. Safe to print without the as-of stamp: this is the
// definition of the obligation, not its timetable.
//
// ⚠️ THE DIRECTIVE ONLY. This sentence used to end "across all ten ESRS topical standards", which
// is ESRS STRUCTURE attributed to CSRD inside a constant named for CSRD — two instruments fused in
// the one place most likely to be copied out. lib/ifrsS2.ts records the repo being burned by this
// exact conflation once already: naming the EU as an IFRS S2 adopter was wrong because "CSRD
// requires ESRS, a different instrument this repo distinguishes everywhere else". The halves also
// rot on different schedules — ESRS was revised during 2026 and its topical structure is what a
// revision touches; the Directive's double-materiality requirement was not. Split, so one edit
// cannot silently move the other. ESRS_TEN_TOPICS_SENTENCE below carries the structural half.
export const CSRD_DOUBLE_MATERIALITY_SENTENCE =
  'CSRD requires double materiality — the topics that affect the entity financially, and those the '
  + 'entity affects.'

// ── ESRS, not CSRD. Kept adjacent because surfaces usually print both, and separate because they
//    are different instruments on different revision cycles. ────────────────────────────────────

// The standards, not the Directive. Verified: cited at app/dashboard/materiality/report/page.tsx:303
// and again at :733 and :752.
export const ESRS_SET1_CITATION = 'Commission Delegated Regulation (EU) 2023/2772'

// The topical structure. Ten = E1–E5 environmental (5) + S1–S4 social (4) + G1 governance (1).
export const ESRS_TEN_TOPICS_SENTENCE =
  'ESRS Set 1 organises those topics into ten topical standards — E1–E5 environmental, S1–S4 '
  + 'social, and G1 governance.'
