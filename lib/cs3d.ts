// lib/cs3d.ts
// SINGLE SOURCE for EU CS3D (Corporate Sustainability Due Diligence Directive) application dates
// and size thresholds.
//
// WHAT CHANGED. Article 37(1) of Directive (EU) 2024/1760 was replaced by Directive (EU) 2026/470
// (Omnibus I) art. 4(22). First application is 26 July 2029, with member-state transposition by
// 26 July 2028. Verified against primary source 10 August 2026.
//
// 2026/470 ALSO RAISED THE SIZE THRESHOLDS — from more than 1,000 employees and EUR 450m net
// worldwide turnover to more than 5,000 employees and EUR 1.5bn. That matters as much as the date:
// copy that says "large companies must comply" was written against the old figures and now
// over-states scope by a factor of five on headcount.
//
// WHY THIS FILE EXISTS. The date said 2027 in EIGHT places across FOUR spellings — '· 2027',
// 'applies from 2027', '2027 (large companies)', "unit: '2027'" — spanning the supply-chain module,
// its marketing page and the PRICING page, while lib/deals/assessment.ts already carried 26 July 2029
// WITH its citation. The repo disagreed with itself by two years on a directive that introduces civil
// liability, and the corrected date was already present in one file. Nothing tied them together.
// ANY SURFACE NAMING A CS3D DATE OR THRESHOLD IMPORTS FROM HERE. A literal in copy is the defect.
//
// Dates are DISPLAY STRINGS, not Date objects, deliberately — every consumer renders them as prose,
// and this repo's countdown-to-a-moved-date defects all began with a Date in a marketing page.

export const CS3D_APPLIES_FROM = '26 July 2029'
export const CS3D_TRANSPOSITION = '26 July 2028'

export const CS3D_CITATION = 'Directive (EU) 2024/1760 as amended by (EU) 2026/470'

// The two limbs of the art. 2(1)(a) EU-company route, as prose. The authoritative machine-readable
// form is THRESHOLD_TESTS['CS3D'] in lib/deals/assessment.ts, which carries them as numbers with
// per-limb `basis` and `comparison` — these strings exist for copy, and must not be used to decide
// anything. Routes (b) group parentage and (c) franchising/licensing are NOT expressed here or there.
export const CS3D_EMPLOYEE_THRESHOLD = 'more than 5,000 employees'
export const CS3D_TURNOVER_THRESHOLD = 'more than EUR 1.5bn net worldwide turnover'
