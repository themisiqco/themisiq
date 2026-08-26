// lib/disclaimer.ts
// ThemisIQ — the formal Important Notice. SINGLE SOURCE OF TRUTH for the legal disclaimer.
//
// Six paragraphs, moved here verbatim from four byte-identical copies (verified by md5 over the
// complete array literal before the move — no wording was reconciled, because there was nothing to
// reconcile). CLAUDE.md requires this text to stay in sync across every Category-A surface; it
// cannot drift now that there is one copy.
//
// ⚠️ PARAGRAPH 1 TAKES A PURPOSE; PARAGRAPHS 2-6 DO NOT, AND MUST NOT.
// Added 22 Aug 2026. One phrase — "informational, screening, planning, and prioritization" — was
// asserted of every output on every surface, and it was wrong on three of them. The assurance
// package's own COVER says it exists "to support third-party verification under ISO 14064-3 /
// ISAE 3410"; its final page called itself a screening. The materiality assessment report records
// determinations against ESRS 1 and states that a material topic becomes a disclosure obligation;
// it called itself a screening too. A document that contradicts itself about what it is has a
// worse problem than one that overstates.
//
// ⚠️ THE PARAMETER REPLACES ONE SPAN AND NOTHING ELSE. Everything after "purposes only" in
// paragraph 1, and all of paragraphs 2-6, are shared and identical for every purpose. That is
// where the drift risk lives, and disclaimer.test.ts asserts the tail is byte-identical across
// every purpose so a future edit cannot quietly make one surface's liability wording differ.
//
// ⚠️ THE PURPOSE IS REQUIRED, AND THERE IS NO DEFAULT. A default would let a new surface inherit
// "screening" silently, which is precisely how this defect arose: the constant was extracted from
// four screening-era copies and three verifier-grade surfaces then picked it up without anyone
// being asked what their document was. The compile error a new caller gets is the point — it
// arrives while they are writing the document, when they know the answer.
//
// WIRED — these call disclaimerParas():
//   lib/assurancePdf.ts                              (assurance PDF, final page)
//   app/dashboard/climate-risk/report/page.tsx       (resilience report, Important Notice section)
//   app/dashboard/materiality/report/page.tsx        (CSRD / IFRS S2 report, Important Notice section)
//   app/api/assessment/submit/route.ts               (lead email, footer fine print)
//   lib/materiality/boardReportPdf.ts                (materiality assessment report, back cover)
//   app/dashboard/deals/report/page.tsx              (ESG deal due-diligence report, Important Notice)
//   app/dashboard/ghg/page.tsx                       (GHG inline report — wired 22 Aug 2026)
//
// NOT YET WIRED — two surfaces still hold this text as inline JSX, which is a different shape
// (paragraph elements with their own styling, not an array). Folding them in is a separate change:
//   app/methodology/page.tsx                         (public methodology page)
//   app/dashboard/climate-risk/page.tsx              (TWO copies — one per mode's acknowledgment block)
// Both carry the 'screening' phrase, which is correct for them and unchanged by this work — so
// they are byte-correct whether wired or not. An edit here reaches SEVEN of NINE surfaces; the
// two above must be changed by hand alongside it.
//
// ⚠️ THE COUNT IN THIS HEADER WAS WRONG UNTIL 22 AUG 2026 — it named five wired surfaces and said
// "five of eight", omitting app/dashboard/deals/report/page.tsx, which has imported this since it
// was written. A comment asserting something untrue about the reach of shared legal text is its
// own defect: it is the thing a future editor counts before deciding whether they have finished.
//
// `readonly` is deliberate: a consumer must not be able to splice or reorder shared legal text.
// Every current consumer only reads it (.map / .forEach), so this costs nothing.

/**
 * What the document carrying this notice IS. Closed union, not a string: a free-text parameter
 * would let a call site invent prose inside shared legal text, which is no longer shared legal
 * text. Adding a member is a deliberate act with a phrase written here, beside the sentence.
 */
export type DisclaimerPurpose =
  /** Look, plan, rank. The screening-grade surfaces, most of which use the word themselves. */
  | 'screening'
  /** Documents an inventory and supports a verification SOMEBODY ELSE performs. */
  | 'verification_support'
  /** Worked up to feed a disclosure the organisation will publish. */
  | 'disclosure_preparation'

export const PURPOSE_PHRASE: Record<DisclaimerPurpose, string> = {
  screening: 'informational, screening, planning, and prioritization',
  verification_support: 'informational, documentation, and verification-support',
  disclosure_preparation: 'informational and disclosure-preparation',
}

/** Everything before the purpose span. */
const PARA_1_HEAD =
  'This document and all outputs generated through the ThemisIQ platform are provided for '

/** Everything after the purpose span. Shared by every purpose, verbatim. */
const PARA_1_TAIL =
  ' purposes only. They do not constitute legal, regulatory, accounting, financial, assurance, investment, or other professional advice and do not, by themselves, satisfy any reporting, disclosure, filing, compliance, assurance, or certification obligation under IFRS, ISSB, CSRD, ESRS, SEC, California climate disclosure regulations, or any other framework or jurisdiction.'

/** Paragraphs 2-6. Identical for every purpose — the parameter does not reach them. */
const SHARED_PARAS: readonly string[] = [
  'Platform outputs are dependent upon information provided by users and other third-party sources. ThemisIQ Compliance Inc. does not independently verify such information and makes no representation or warranty, express or implied, regarding the completeness, accuracy, reliability, suitability, or fitness for a particular purpose of any output.',
  'Sustainability-related laws, regulations, standards, guidance, and interpretations continue to evolve. Users remain solely responsible for determining the applicability of regulatory requirements and for obtaining independent legal, accounting, assurance, and other professional advice where appropriate.',
  'Use of the platform does not create a professional-client, advisory, assurance, accounting, consulting, fiduciary, or legal relationship with ThemisIQ Compliance Inc.',
  'To the maximum extent permitted by law, ThemisIQ Compliance Inc., its directors, officers, employees, contractors, and affiliates shall not be liable for any direct, indirect, incidental, consequential, special, punitive, or economic damages arising from the use of, or reliance upon, any platform output.',
  'ThemisIQ is a software platform and is not an accredited assurance provider, certification body, or regulatory authority.',
]

/** The six paragraphs, with paragraph 1's purpose span set for the calling surface. */
export function disclaimerParas(purpose: DisclaimerPurpose): readonly string[] {
  return [
    `${PARA_1_HEAD}${PURPOSE_PHRASE[purpose]}${PARA_1_TAIL}`,
    ...SHARED_PARAS,
  ]
}
