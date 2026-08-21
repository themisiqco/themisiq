// lib/disclaimer.ts
// ThemisIQ — the formal Important Notice. SINGLE SOURCE OF TRUTH for the legal disclaimer.
//
// Six paragraphs, moved here verbatim from four byte-identical copies (verified by md5 over the
// complete array literal before the move — no wording was reconciled, because there was nothing to
// reconcile). CLAUDE.md requires this text to stay in sync across every Category-A surface; it
// cannot drift now that there is one copy.
//
// WIRED — these import from here:
//   lib/assurancePdf.ts                              (assurance PDF, final page)
//   app/dashboard/climate-risk/report/page.tsx       (resilience report, Important Notice section)
//   app/dashboard/materiality/report/page.tsx        (CSRD / IFRS S2 report, Important Notice section)
//   app/api/assessment/submit/route.ts               (lead email, footer fine print)
//   lib/materiality/boardReportPdf.ts                (impact materiality report, back cover)
//
// NOT YET WIRED — three surfaces still hold this text as inline JSX, which is a different shape
// (paragraph elements with their own styling, not an array). Folding them in is a separate change:
//   app/methodology/page.tsx                         (public methodology page)
//   app/dashboard/ghg/page.tsx                       (GHG inline report)
//   app/dashboard/climate-risk/page.tsx              (TWO copies — one per mode's acknowledgment block)
// Until those are wired, an edit here reaches five of eight surfaces. Change all of them together.
//
// `readonly` is deliberate: a consumer must not be able to splice or reorder shared legal text.
// Every current consumer only reads it (.map / .forEach), so this costs nothing.

export const DISCLAIMER_PARAS: readonly string[] = [
  'This document and all outputs generated through the ThemisIQ platform are provided for informational, screening, planning, and prioritization purposes only. They do not constitute legal, regulatory, accounting, financial, assurance, investment, or other professional advice and do not, by themselves, satisfy any reporting, disclosure, filing, compliance, assurance, or certification obligation under IFRS, ISSB, CSRD, ESRS, SEC, California climate disclosure regulations, or any other framework or jurisdiction.',
  'Platform outputs are dependent upon information provided by users and other third-party sources. ThemisIQ Compliance Inc. does not independently verify such information and makes no representation or warranty, express or implied, regarding the completeness, accuracy, reliability, suitability, or fitness for a particular purpose of any output.',
  'Sustainability-related laws, regulations, standards, guidance, and interpretations continue to evolve. Users remain solely responsible for determining the applicability of regulatory requirements and for obtaining independent legal, accounting, assurance, and other professional advice where appropriate.',
  'Use of the platform does not create a professional-client, advisory, assurance, accounting, consulting, fiduciary, or legal relationship with ThemisIQ Compliance Inc.',
  'To the maximum extent permitted by law, ThemisIQ Compliance Inc., its directors, officers, employees, contractors, and affiliates shall not be liable for any direct, indirect, incidental, consequential, special, punitive, or economic damages arising from the use of, or reliance upon, any platform output.',
  'ThemisIQ is a software platform and is not an accredited assurance provider, certification body, or regulatory authority.',
]
