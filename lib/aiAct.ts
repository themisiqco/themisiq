// lib/aiAct.ts
// SINGLE SOURCE for EU AI Act high-risk application dates.
//
// WHAT CHANGED. High-risk obligations were 2 August 2026 (Article 6(2) / Annex III, stand-alone) and
// 2 August 2027 (Article 6(1) / Annex I, embedded in regulated products) until Regulation (EU)
// 2026/1744 art. 40 REPLACED Article 113(3)(c) of Regulation (EU) 2024/1689, moving them to
// 2 December 2027 and 2 August 2028 respectively. Published OJ 24 July 2026, in force 27 July 2026.
// Verified against primary source 10 August 2026.
//
// WHY THIS FILE EXISTS. The dates lived as SEVEN INDEPENDENT LITERALS in FOUR SPELLINGS
// ('August 2, 2026', 'Aug 2, 2026', 'August 2 2026', 'August 2026') across four files, plus two
// hand-copied `new Date('2026-08-02')` countdown blocks. Nothing tied them together, so a deferral
// enacted SIX DAYS BEFORE the deadline changed none of them: the public page kept counting down to a
// date that had moved, and the countdown clamped to "0 days" rather than reading as broken.
// ANY SURFACE NAMING AN AI ACT HIGH-RISK DATE IMPORTS FROM HERE. A literal in copy is the defect.
//
// WHAT DID NOT MOVE — do not let this file's existence imply the whole Regulation shifted:
//   • Article 5 prohibitions — already in force since 2 February 2025, unchanged. The NEW Article 5
//     prohibitions introduced by 2026/1744 apply from 2 December 2026.
//   • GPAI (general-purpose AI) obligations — in force since 2 August 2025, unchanged.
//   • Article 50 transparency obligations — original schedule, unchanged.
//
// Dates are DISPLAY STRINGS, not Date objects, deliberately: every consumer today renders them as
// prose, and the two countdown blocks this replaces are what made a passed date read as urgency. A
// consumer that genuinely needs to compare against today should derive its own Date and say in
// comment why a countdown is the right shape for it.

export const AI_ACT_HIGH_RISK_STANDALONE = '2 December 2027'
export const AI_ACT_HIGH_RISK_EMBEDDED = '2 August 2028'

export const AI_ACT_CITATION = 'Regulation (EU) 2024/1689 as amended by (EU) 2026/1744'

// One sentence carrying BOTH dates and the citation, for copy that would otherwise name a single
// date. The two-date shape is load-bearing: a surface that states one date for "high-risk" is wrong
// for half its readers, and most of the surfaces this replaces did exactly that.
export const AI_ACT_HIGH_RISK_SENTENCE =
  'High-risk obligations apply from 2 December 2027 for stand-alone systems, and from 2 August 2028 where the AI is built into a product already covered by EU product-safety law (Regulation (EU) 2024/1689 as amended by (EU) 2026/1744).'
