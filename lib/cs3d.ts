// lib/cs3d.ts
// SINGLE SOURCE for EU CS3D (Corporate Sustainability Due Diligence Directive) application dates
// and size thresholds.
//
// WHAT CHANGED. Article 37(1) of Directive (EU) 2024/1760 was replaced by Directive (EU) 2026/470
// (Omnibus I) art. 4(22). First application is 26 July 2029, with member-state transposition by
// 26 July 2028. Verified against primary source 10 August 2026.
//
// ONE TIER, NOT THREE. 2026/470 also ELIMINATED the two lower phase-in tiers, so there is no longer a
// staged entry by size: a company is in scope or it is not, from a single date. Copy written against
// the phase-in ("large companies first") described a structure that no longer exists.
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

// Article 16 public reporting, which is a LATER and DIFFERENT date from application. A company in
// scope from 26 July 2029 does not publish under art. 16 for a financial year that began before this.
// Kept as prose because "financial years starting on or after" is the operative part: a calendar date
// alone invites a reader to think the first report is due in January 2030.
export const CS3D_ARTICLE_16_FROM = 'financial years starting on or after 1 January 2030'

// ⚠️ THE COMMISSION'S IMPLEMENTATION GUIDELINES ARE DUE BEFORE THIS DATE AND ARE NOT PUBLISHED. They
// matter to a supplier more than the directive text does, because they will shape how an in-scope
// customer words the request that lands on them. Kept here so no surface can state the date without
// passing through the file that also records its status. docs/backlog.md carries the review trigger.
export const CS3D_GUIDELINES_DUE = '26 July 2027'

// The amending instrument's own dates. Not obligations on anybody, but the page names the source for
// every date it states, the way app/cbam/page.tsx does, and a reader checking EUR-Lex needs these.
export const CS3D_OMNIBUS_PUBLISHED = '26 February 2026'
export const CS3D_OMNIBUS_IN_FORCE = '18 March 2026'

export const CS3D_CITATION = 'Directive (EU) 2024/1760 as amended by (EU) 2026/470'

// The two instruments separately, for a sources table that gives each one its own row and role. The
// combined CS3D_CITATION above stays the right thing to use inline, mid-sentence.
export const CS3D_REGIME_CITATION = 'Directive (EU) 2024/1760'
export const CS3D_OMNIBUS_CITATION = 'Directive (EU) 2026/470'

// The two limbs of the art. 2(1)(a) EU-company route, as prose. The authoritative machine-readable
// form is THRESHOLD_TESTS['CS3D'] in lib/deals/assessment.ts, which carries them as numbers with
// per-limb `basis` and `comparison` — these strings exist for copy, and must not be used to decide
// anything. Routes (b) group parentage and (c) franchising/licensing are NOT expressed here or there.
export const CS3D_EMPLOYEE_THRESHOLD = 'more than 5,000 employees'
export const CS3D_TURNOVER_THRESHOLD = 'more than EUR 1.5bn net worldwide turnover'

// ⚠️ "MORE THAN", NOT "AT LEAST", AND THE DIFFERENCE IS ONE EMPLOYEE IN A MACHINE TEST. Secondary
// sources disagree: some render art. 2(1) as "at least 5,000". The Council press release says "more
// than 5,000 employees and above EUR 1.5 billion net turnover", the original art. 2(1)(a) used "more
// than 1000 employees", and THRESHOLD_TESTS['CS3D'] in lib/deals/assessment.ts uses comparison 'gt'
// to match. All three agree with each other, which is why this stands. Nobody here has read the
// amended article on EUR-Lex; docs/backlog.md carries that as pending. If it turns out to be "at
// least", this string, both `basis` strings and the 'gt' comparison change together, or the copy and
// the assessment will disagree about a company with exactly 5,000 employees.

// The non-EU route, art. 2(2). The measure is different, not just the geography: turnover GENERATED
// IN THE EU rather than net WORLDWIDE turnover, and there is no employee limb. Copy that says "5,000
// employees and EUR 1.5bn" describes only the EU route and silently mis-states the other.
export const CS3D_NON_EU_TURNOVER_THRESHOLD = 'more than EUR 1.5bn turnover generated in the EU'

// ⚠️ THE LIMIT THAT MATTERS MOST TO A SUPPLIER, AND THE REASON THIS MODULE IS WORTH BUYING RATHER
// THAN FEARING. An in-scope company may not simply demand everything from everyone: for business
// partners below 5,000 employees it may seek information only where that information is not publicly
// available and is necessary to address a salient issue. So a small supplier's answer to "why are you
// asking me this?" is a real question with a real limit behind it.
export const CS3D_VALUE_CHAIN_CONTACT_LIMIT =
  'A company in scope may seek information from a business partner with fewer than 5,000 employees ' +
  'only where that information is not publicly available and is necessary to address a salient issue.'

// Routes (b) group parentage and (c) franchising or licensing. ⚠️ NAMED SO NOBODY THINKS THE SIZE
// LIMBS ARE THE WHOLE TEST, and worded so nothing implies this platform evaluates them: it does not.
// THRESHOLD_TESTS['CS3D'] carries exhaustive: false and CS3D_ROUTE_NOT_MET_REASON for exactly this.
// Any copy using this must not put it where a reader would read it as a test we apply.
export const CS3D_OTHER_ROUTES_NOTE =
  'Scope can also be reached through group parentage and through franchising or licensing ' +
  'arrangements, which this platform does not assess.'
