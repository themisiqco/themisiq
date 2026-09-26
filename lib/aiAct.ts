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

// ── THE DATES THAT DID NOT MOVE ──────────────────────────────────────────────────────────────────
// Added 26 Sep 2026, for the same reason the two above exist. They were literals in copy on
// app/ai-governance/page.tsx, which is the defect this file's own header names: "ANY SURFACE NAMING AN
// AI ACT HIGH-RISK DATE IMPORTS FROM HERE. A literal in copy is the defect." These are not high-risk
// dates, but a page that carries the high-risk dates ALONE tells a reader they have until 2027 when
// parts of the Regulation already bind them, so the two sets travel together and belong in one file.
// Wording verified against app/methodology/page.tsx's verifier-facing statement, which is itself
// checked against the amendment.
export const AI_ACT_PROHIBITIONS_FROM = '2 February 2025'
export const AI_ACT_NEW_PROHIBITIONS_FROM = '2 December 2026'
export const AI_ACT_GPAI_FROM = '2 August 2025'

// ⚠️ A POSTURE, NOT A DATE, AND DELIBERATELY SO. The Article 50 transparency date is NOWHERE IN THIS
// REPO: every surface says only that those obligations "retain their original schedule", and nobody
// here has verified the date against the Regulation. A constant holding a guessed date would be worse
// than this string, because it would look sourced. If someone reads Article 113 and confirms it, replace
// this with AI_ACT_ARTICLE_50_FROM and a verification date, and update the sentence below.
export const AI_ACT_ARTICLE_50_POSTURE = 'retain their original schedule'

// One sentence for the whole "not everything moved" point, so a page does not compose four constants
// and get the emphasis wrong. Mirrors AI_ACT_HIGH_RISK_SENTENCE: copy renders it whole.
// ⚠️ INTERPOLATED FROM THE CONSTANTS ABOVE, NOT SPELLED OUT. A first draft of this wrote the dates into
// the string, which would have made this file itself the two-places-to-change problem it was created to
// end. Note AI_ACT_HIGH_RISK_SENTENCE below DOES spell its two dates: that string was verified against
// the primary source on 10 Aug 2026 and is left alone rather than refactored for symmetry, but it is the
// one thing in this file that still holds a date twice.
export const AI_ACT_ALREADY_APPLIES_SENTENCE =
  'Those are the high-risk dates, and they are not the whole Regulation. The Article 5 prohibitions have '
  + `applied since ${AI_ACT_PROHIBITIONS_FROM}, with the prohibitions added by the 2026 amendment `
  + `applying from ${AI_ACT_NEW_PROHIBITIONS_FROM}. Obligations for general-purpose AI have applied since `
  + `${AI_ACT_GPAI_FROM}, and the Article 50 transparency duties ${AI_ACT_ARTICLE_50_POSTURE}. So parts `
  + 'of the Act may already bind you even though the high-risk deadlines are years away.'

export const AI_ACT_CITATION = 'Regulation (EU) 2024/1689 as amended by (EU) 2026/1744'

// One sentence carrying BOTH dates and the citation, for copy that would otherwise name a single
// date. The two-date shape is load-bearing: a surface that states one date for "high-risk" is wrong
// for half its readers, and most of the surfaces this replaces did exactly that.
export const AI_ACT_HIGH_RISK_SENTENCE =
  'High-risk obligations apply from 2 December 2027 for stand-alone systems, and from 2 August 2028 where the AI is built into a product already covered by EU product-safety law (Regulation (EU) 2024/1689 as amended by (EU) 2026/1744).'
