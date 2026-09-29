import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

// ─────────────────────────────────────────────────────────────────────────────
// THE EM-DASH RATCHET.
//
// ⚠️ WHY A RATCHET AND NOT A BAN. The copy rule is that no em dash appears in customer-facing text, and
// on 27 Sep 2026 the tree had 1,084 of them in rendered strings across 86 files. A test that simply
// forbade them would have been red on a clean checkout, which is how a test gets deleted. So this asserts
// the SHAPE of the remaining work instead:
//
//   · a file NOT listed in SWEEP_BUDGET must have ZERO. The five groups already swept are locked here, and
//     any new em dash in clean copy fails.
//   · a listed file must have AT MOST its recorded number. Gaining one fails.
//   · a listed file that has FEWER than recorded also fails, with a message to lower the number — so
//     progress is written down rather than silently absorbed, and the budget only ever ratchets down.
//   · a listed file that reaches ZERO must be REMOVED from the list, which fails until someone does it.
//
// THE NUMBERS ARE A TO-DO LIST, NOT A TARGET. Every sweep commit lowers one, and the file is finished when
// SWEEP_BUDGET is empty.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..')
const DASH = '—'

/**
 * A whole string literal that OPENS with an em dash is a QUOTED BULLET, not our punctuation.
 *
 * ⚠️ THIS IS THE ONE PERMANENT EXEMPTION THAT IS SHAPE-BASED RATHER THAN LOCATION-BASED, and it earns it.
 * lib/cbam/boundaries.ts reproduces Annex II to Regulation (EU) 2023/956 verbatim, and the Regulation's
 * own text uses an em dash to open each listed process: "— all processes emitting CO2 from process
 * materials…". Changing it would misquote the instrument.
 *
 * ⚠️ IT USED TO BE THE REGEX /['"`]\s*—/ AGAINST COMMENT-STRIPPED TEXT, AND THAT MATCHED FAR MORE THAN
 * ANNEX II. A quote character followed by an em dash occurs wherever a dash follows a closing quote in
 * prose, and — the expensive part — it matched every `'—'` empty-value glyph in the tree, so the ratchet
 * could not see a single one of them. Fourteen in lib/ghg/engine.ts alone were invisible to it.
 *
 * ⚠️ AND IT IS NOW SCOPED TO THE FILE, BECAUSE THE SHAPE ALONE IS NOT THE THING. Ten literals elsewhere
 * open with an em dash and are OUR prose, appended to another string at render time: "— not answered",
 * "— no reason recorded", "— excluded from all totals". A shape-only rule exempted all ten. They are
 * counted now, which is why four budgets went up in the rebaseline.
 */
const ANNEX_II_FILE = 'lib/cbam/boundaries.ts'
const quotedBullet = (rel: string, p: Piece): boolean =>
  rel === ANNEX_II_FILE && p.whole && /^\s*—/.test(p.text) && p.text.trim() !== DASH

/**
 * A whole literal that IS the em dash is an empty-value glyph: a CSV's blank cell, or "no value" on
 * screen. Counted separately from prose because it is a different fix — the vocabulary in
 * lib/ghg/workingsCells.ts — and because a punctuation sweep must not be able to "fix" one by deleting it.
 */
const emptyValueGlyph = (p: Piece): boolean => p.whole && p.text.trim() === DASH

/**
 * A string assigned to a property named `legacyLabel` is a LOOKUP KEY FOR DATA ALREADY STORED, not copy.
 *
 * ⚠️ IT IS THE ONLY EXEMPTION THAT PROTECTS TEXT NOBODY WILL EVER SEE, which is what earns it. The 104 of
 * these in lib/supply-chain/templates.ts are the questionnaire's option wordings as they stood before the
 * sweep of 27 Sep 2026. Rows in supplier_responses written before that hold them, every
 * supplier_assurance_raw frozen into a scope3_category_snapshot holds them, and db/sql/supplier-options/
 * maps FROM them. optionValue() matches them and returns the CURRENT label, so what a customer reads is
 * the swept wording — the dash survives only as a key.
 *
 * ⚠️ "REWRITE THE KEY TOO" IS THE MISTAKE THIS PREVENTS. Sweeping one would not tidy a page; it would
 * orphan every historic answer and turn a verifier's snapshot line into 'unrecognised'.
 *
 * Asserted below to exist, to be confined to templates.ts, and to match the `label` beside it under the
 * sweep's own convention — so the exemption cannot be used to hide a wording nobody has swept.
 */
const legacyDataKey = (p: Piece): boolean => p.whole && p.property === 'legacyLabel'

/**
 * A key of LEGACY_STATE_BY_ANSWER in lib/scope3/supplierAssurance.ts is the same kind of thing as a
 * legacyLabel, and it is exempt for the same reason: it is DATA, matched against what a snapshot holds.
 *
 * ⚠️ IT CANNOT EVER BE SWEPT, WHICH IS WHY IT IS NOT A BUDGET. It was budgeted at 3 until 27 Sep 2026, as
 * though someone would one day get to it. Sweeping one would not tidy a page; it would stop a frozen
 * supplier_assurance_raw resolving and tell a verifier the supplier gave an off-list answer. A budget
 * says "not yet"; this says "never".
 */
const ASSURANCE_LEGACY_FILE = 'lib/scope3/supplierAssurance.ts'
const assuranceLegacyKey = (rel: string, p: Piece): boolean =>
  rel === ASSURANCE_LEGACY_FILE && p.whole && /^(Yes|No) — |^No measurement$/.test(p.text)

const EF_SOURCES_OBJECT = { file: 'lib/ghg/engine.ts', name: 'EF_SOURCES' }

/**
 * ⚠️ READ WITH THE TYPESCRIPT PARSER, NOT BY LINE, which is the whole of this commit. Only what a customer
 * can see is text: string literals, template pieces and JSX text. A comment is none of those, so nothing
 * has to be stripped and no scanner has to be trusted — the approach lib/scope3/scope3Copy.test.ts has
 * used since it was written, and which was right about app/dashboard/scope3/page.tsx when this file was
 * wrong about it.
 */
interface Piece { where: string; text: string; whole: boolean; pos: number; property?: string }

/**
 * ⚠️ AN ENTITY IN JSX TEXT IS AN EM DASH TO THE CUSTOMER, AND NEITHER COUNTER SAW ONE. `&mdash;` in JSX
 * text renders as —; 76 lines of this tree use it, including app/materiality/page.tsx, which was swept in
 * group 3 and read as clean afterwards. Decoded HERE and only for JsxText: inside a string literal
 * `&mdash;` renders as the six literal characters, so decoding it there would invent a dash that no
 * customer sees.
 */
const decodeJsxEntities = (t: string): string =>
  t.replace(/&mdash;/g, DASH).replace(/&#8212;/g, DASH).replace(/&#x2014;/gi, DASH)

function pieces(rel: string): Piece[] {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true,
    rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: Piece[] = []
  const visit = (n: ts.Node) => {
    let text: string | null = null
    let whole = false
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { text = n.text; whole = true }
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text
    else if (ts.isJsxText(n)) text = decodeJsxEntities(n.text)
    if (text !== null) {
      // The property this literal initialises, where it is one: how a data key is told from copy.
      const parent = n.parent
      const property = parent && ts.isPropertyAssignment(parent) ? parent.name.getText() : undefined
      out.push({ where: `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`, text, whole,
                 pos: n.getStart(), property })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** The character range of a top-level declaration, so a location-based exemption follows it if it moves. */
function declarationRange(rel: string, name: string): [number, number] | null {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let found: [number, number] | null = null
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name) {
      found = [n.getStart(), n.getEnd()]
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

/**
 * Em dashes in RENDERED copy: prose only. Whole-literal glyphs, Annex II bullets and the EF_SOURCES
 * citations are each excluded for their own stated reason, and every exclusion is asserted live below.
 */
export function renderedDashes(file: string): number {
  const ef = file === EF_SOURCES_OBJECT.file
    ? declarationRange(file, EF_SOURCES_OBJECT.name)
    : null
  return pieces(file)
    .filter(p => !(ef && p.pos >= ef[0] && p.pos <= ef[1]))
    .filter(p => !quotedBullet(file, p) && !emptyValueGlyph(p) && !legacyDataKey(p)
             && !assuranceLegacyKey(file, p))
    .reduce((n, p) => n + (p.text.match(new RegExp(DASH, 'g')) ?? []).length, 0)
}

/**
 * ⚠️ THERE IS NO EXEMPTION LIST ANY MORE, and the two that existed are recorded here because both were
 * argued for at length before they were retired.
 *
 * THE THREE LEGAL PAGES left on 27 Sep 2026. They carry document version numbers and a consent version
 * that purchase_consents rows point at, so a punctuation edit raised a legal-record question rather than
 * a copy one. Decided: the version does not move, and the amendment is recorded in
 * docs/policy-snapshots/README.md.
 *
 * THE EMAIL TEMPLATES, exempt by the path prefix `app/api/`, left on 27 Sep 2026 too. Six email-building
 * routes are swept, and lib/obligations.ts with them, because its statute names travel into the internal
 * notification email and the page and the email must read the same. What is left under app/api/ is NOT
 * email copy and is budgeted below, file by file, with the reason.
 *
 * Every file in app/ and lib/ is now covered by the same two rules: zero, or a budget that only shrinks.
 */

/**
 * The remaining sweep, file by file, with the count each one still carries.
 *
 * LOWER A NUMBER WHEN YOU SWEEP A FILE. Remove the line when it reaches zero.
 *
 * ⚠️ REBASELINED 28 SEP 2026 AND THE TOTAL WENT UP: 1,012 across 80 files became 1,128 across 83. NOT ONE
 * EM DASH WAS ADDED. Reading the text with the TypeScript parser instead of matching bytes on
 * comment-stripped lines found two populations the old counter could not see:
 *
 *   · `\u2014` WRITTEN AS AN ESCAPE. app/security/page.tsx spelled every one of its dashes that way, so it
 *     read as clean through the group-2 sweep. Also app/dashboard/ghg/page.tsx, which still does.
 *   · `&mdash;` IN JSX TEXT, which renders as an em dash. app/materiality/page.tsx was swept in group 3
 *     and still had 16 of them; app/calculate-emissions/page.tsx went from 1 to 62, almost all entities.
 *
 * ⚠️ AND THE FOUR FILES THAT FOUND WERE FINISHED THE SAME DAY: app/security (7), app/materiality (16),
 * app/advisory (1) and app/calculate-emissions (62) are swept and have left this list. Their entries are
 * gone, not zeroed — the ratchet's own rule. The two blind spots above are what the guard now sees, which
 * is why those files could be finished at all.
 *
 * ⚠️ app/assess (50) FOLLOWED, AND MOST OF ITS COPY SOURCES DID NOT. Every lib/ module the page takes copy
 * from is shared: lib/sb253 (3) with eight other pages, lib/nis2 (3) with /cyber, lib/ifrsS2 (1) with
 * /climate-risk. Those three stay listed for the shared-lib group.
 *
 * ⚠️ THE DASHBOARDS, 28 Sep 2026: 533 dashes swept across 34 screens, and 25 budget lines deleted.
 * 34 are left, and NONE of them is prose anybody has yet to get to:
 *   · app/dashboard/cbam/report/exportXlsx.ts (10) writes XLSX cells. Exports group, unread here.
 *   · SIX SIT IN A CSS COMMENT inside a print-<style> template literal: climate-risk/report (2),
 *     materiality/report (2), deals/report (2) — the same page-break comment, copied three times. The
 *     parser counts them because a template literal is text, and it is right to: it cannot know that
 *     a CSS comment inside a <style> reaches nobody. They are budgeted rather than exempted so the
 *     decision stays visible; an exemption would need its own assertion, and nobody has argued for one.
 *   · ONE IS PROSE AND STAYS ANYWAY: the coverage-resolution note at app/dashboard/ghg/page.tsx:3433.
 *     It is PERSISTED in coverage_resolutions and reprinted to verifiers through rowNoteOf on
 *     /verify/[token], and every resolution already recorded carries the dash. Sweeping the generator
 *     would put both forms into one audit trail while changing no stored record. applyResolutions
 *     reads straddleChoice and the dates, never the note, so nothing about the figure depends on it.
 *   · EIGHTEEN ARE NOT SENTENCE PUNCTUATION, so none of the four patterns applies. In each the dash
 *     has no space before it INSIDE ITS OWN LITERAL, which is what tells them apart mechanically:
 *       an empty-value glyph carrying a label — '— not answered', '— could not judge',
 *         '— mt Scope 2', '— excluded from all totals' (ghg 2, determinations 4, results 1)
 *       a placeholder bracketed by two dashes — '— none (unevidenced) —', '— not set —'
 *         (cbam/setup 2, respondents/import 2)
 *       an ornament prefixing a byline or a button — '— {contributor}', '— {label}',
 *         '— {NO_VISIBILITY_LABEL}' (determinations 2, results 1)
 *       a qualifier whose spacing comes from a SIBLING node, so the punctuation cannot be written into
 *         this literal at all (people 2, worksheet/[id] 1, results 1)
 *     The first two want the Not provided / Not applicable vocabulary in lib/ghg/workingsCells.ts, and
 *     the operator cell has to keep agreeing with the verifier cell beside it, so they are a vocabulary
 *     commit and not a punctuation one.
 *
 * ⚠️ WHAT THE DASHBOARD GROUP HAD TO PROVE, and it is not what the AST check proves. Three strings
 * reached logic through an indirection no syntactic test sees:
 *   · app/dashboard/ai-governance/page.tsx builds `${name} ${purpose} ${decision_type}`.toLowerCase()
 *     at :133 and keyword-matches it for the AI Act risk level. 14 library entries' classifier text
 *     changed; all 51 keywords were re-tested across all 34 entries and NO classification moved.
 *   · app/dashboard/supply-chain/page.tsx pushes the COUNTRY_RISK / SECTOR_RISK labels into
 *     risk_factors, which IS written to supply_chain_registers — but :191 says those four fields are
 *     recomputed on load, never read, so the stored copy is not an input. Display and the CSV only.
 *   · the 46 risk labels take a BRACKETED qualifier, not a colon, because their consumer already
 *     prefixes one: `Country risk: ${label}` would read "Country risk: Critical: labour rights, safety".
 *     "Critical (labour rights, safety)" composes. The same form is used for the '— required' and
 *     '— optional' field markers that follow a question mark, where a colon is ungrammatical.
 * A colon can also move a FIRST-COLON SPLIT. The only two consumers in the tree read
 * CANONICAL_S211 — CANADA_S211_JURISDICTION_CAVEAT, already colon-first and pinned by its own test —
 * so nothing in this group feeds one. Check again before introducing a colon into shared copy.
 *
 * ⚠️ THE SHARED lib/ COPY WENT NEXT, 27 Sep 2026: 73 dashes across 22 modules, and 19 budget lines with
 * them. What is left in lib/ is there for a reason, not for want of a sweep:
 *   · THREE MODULES KEPT A DASH THE SWEEP HAD ALREADY TAKEN, and were put back the same day. Reachability
 *     from a PDF is not the test; being PRINTED by one is, and these are:
 *       lib/materiality/severityScale.ts (1) worksheetSubtopicHeading, printed at boardReportPdf.ts:850
 *         and :922. It renders on app/impact/[token] too, so it cannot be split by surface: one function,
 *         one string, and the PDF half decides.
 *       lib/materiality/register.ts (3) NEVER_IN_SURVEY_SCOPE_DETAIL and the TRIGGERS_INACTIVE reason,
 *         printed at boardReportPdf.ts:1049 and :1055. THRESHOLD_NOTE is the one register string that
 *         reaches a screen only, and it stayed swept. The detail is ALSO half of a grouping key at
 *         boardReportPdf.ts:1042 — both sides come from this constant in the same process, so a rewrite
 *         does not break the grouping, but a `detail` that is keyed on is not display copy.
 *       lib/ghg/comparability.ts (1) magnitudeText, and this one is not about a PDF at all. Its output is
 *         STORED, in ghg_inventories.comparability_disclosure.observations, and compared against a
 *         recompute at the next save (comparability.ts:655). The capture is rehydrated from the stored
 *         record on page load (app/dashboard/ghg/page.tsx:859) precisely so the next save notices drift —
 *         so changing the generator would set observationsChanged on every inventory answered before the
 *         change, and show a verifier the "what was shown / what it says now" divergence block for a
 *         comma. docs/item-3-comparability-disclosure.md quotes the sentence, and comparability.test.ts
 *         asserts it eight times; all three move together or not at all.
 *   · lib/ghg/engine.ts (64), lib/assurancePdf.ts (3), lib/auditTrailNotice.ts (3),
 *     lib/materiality/boardReport.ts (17), lib/materiality/boardReportPdf.ts (6),
 *     lib/cbam/report/build.ts (7), lib/cbam/sefa.ts (4), lib/cbam/sefaCompute.ts (1) all feed a PDF or
 *     an XLSX, where a line break is a layout decision. They are the exports group.
 *   · lib/cbam/boundaries.ts (17) sits beside a verbatim quotation of Annex II, and its own prose has to
 *     be told from the instrument's line by line.
 *   · lib/cbam/readiness.ts (20) has not been read for quoted regulation text yet.
 *   · lib/flag/estimate.ts (9) is imported by NOTHING but its own test, so its copy reaches no surface.
 *     Sweeping it would be tidying text no customer can see; it is listed so the question stays open.
 *   · lib/scope3/supplierAssurance.ts left the budget entirely: its three were match targets, and they
 *     are exempt above rather than pending.
 *
 * ⚠️ AND BEFORE THAT, THE EMAILS, 27 Sep 2026, WHICH TOOK lib/obligations (23) WITH THEM. It was held back one
 * commit because an obligation's `name` travels into the internal notification email; once the templates
 * stopped being exempt, holding it back stopped making sense — the page and the email now read the same
 * statute pairs, with the colon convention /assess uses. 32 dashes across six email-building routes went
 * with it, and app/api/assessment/submit/route.ts lost a substring(0, 50) that had been cutting statute
 * names mid-word.
 *
 * Both were invisible to a byte match and are counted now, which is the point of the change. A file whose
 * number rose gained nothing: it was always wrong.
 */
/**
 * Whole-literal '—' empty-value glyphs left in the tree, counted 27 Sep 2026.
 *
 * ⚠️ AN EQUALITY, NOT A CEILING, AND IT SHOULD ONLY EVER FALL. The old QUOTED_BULLET exempted every one of
 * these, so the ratchet could not see them at all; the GHG workings table's 24 were found by reading the
 * code rather than by any guard. Their fix is a VOCABULARY — 'Not provided', 'Not applicable',
 * 'Not quantified' in lib/ghg/workingsCells.ts — not a punctuation edit, which is why they are counted
 * apart from the sweep budget. Lower this when a surface adopts the words.
 */
const GLYPH_COUNT = 73

const SWEEP_BUDGET: Record<string, number> = {
  // ⚠️ WHAT IS LEFT UNDER app/api/ IS READ BY NOBODY, 27 Sep 2026. The prefix exemption is gone; the six
  // email-building routes are swept, and so is every API message a caller actually renders — checked one
  // by one rather than assumed:
  //     /api/materiality and /api/materiality/resilience   → app/dashboard/climate-risk/page.tsx:466
  //                                                           setError(data.error ?? …)          SWEPT
  //     /api/cbam/report                                   → app/dashboard/cbam/report/page.tsx:197
  //                                                           setErr({ message: json.error … })  SWEPT
  //     /api/checkout                                      → lib/checkout.ts:69 alert(error …)   SWEPT
  //     /api/campaigns/[id]/scope3-cat1 uncovered[].reason  → app/dashboard/scope3/page.tsx:3597  SWEPT
  //
  // These five are what remains, and each is read by a machine, a log or nobody:
  //
  //   · TWO ARE MODEL PROMPTS, and CLAUDE.md treats one as a safety property: the concierge's prompt is
  //     what makes the extractor abstain rather than guess a consumption figure. A prompt is input to a
  //     model, not copy read by a person, and editing its punctuation is editing a model's instructions.
  'app/api/concierge/extract/route.ts': 11,
  'app/api/ghg-bot/route.ts': 19,
  //   · THREE ARE console.warn SERVER LOGS in the materiality routes: a reporting-period conflict and a
  //     partial topic-label resolve. They reach a log, never a screen.
  'app/api/materiality/resilience/route.ts': 3,
  'app/api/materiality/route.ts': 3,
  //   · ONE IS A RESPONSE FIELD NO CALLER READS: cbam/compute returns `warning` beside `unresolved`, and
  //     app/dashboard/cbam/setup does not render it (no `warning` reference in the file). Sweeping it
  //     would be sweeping text nobody has ever seen; it is listed so that changes when someone shows it.
  'app/api/cbam/compute/route.ts': 1,
  //   · ONE IS AN ADMIN API ERROR WITH NO UI CALLER: /api/admin/create-invoice is fetched from nowhere in
  //     app/ or lib/ — it is called directly — so its 400 message is read in a terminal, not a browser.
  'app/dashboard/cbam/report/exportXlsx.ts': 10,
  'app/dashboard/cbam/setup/page.tsx': 2,
  'app/dashboard/climate-risk/report/page.tsx': 2,
  'app/dashboard/ghg/page.tsx': 3,
  'app/dashboard/materiality/report/page.tsx': 2,
  'app/dashboard/materiality/survey/[id]/respondents/import/page.tsx': 2,
  'app/dashboard/materiality/survey/[id]/results/page.tsx': 3,
  'app/dashboard/materiality/worksheet/[id]/determinations/page.tsx': 6,
  'app/dashboard/materiality/worksheet/[id]/page.tsx': 1,
  'app/dashboard/people/page.tsx': 2,
  'app/deals/[token]/page.tsx': 6,
  'app/impact/[token]/page.tsx': 11,
  'app/order/page.tsx': 1,
  'app/supplier/[token]/page.tsx': 1,
  'app/survey/[token]/page.tsx': 11,
  'app/verify-cbam/[token]/page.tsx': 19,
  'app/verify/[token]/page.tsx': 14,
  'lib/assurancePdf.ts': 3,
  'lib/auditTrailNotice.ts': 3,
  'lib/cbam/boundaries.ts': 17,
  'lib/cbam/readiness.ts': 20,
  'lib/cbam/report/build.ts': 7,
  'lib/cbam/sefa.ts': 4,
  'lib/cbam/sefaCompute.ts': 1,
  'lib/flag/estimate.ts': 9,
  // Printed by a PDF, or stored and compared. Put back on 27 Sep 2026 after the shared-lib sweep had
  // already taken them; the reason each survives is in the header above, per file.
  'lib/ghg/comparability.ts': 1,
  'lib/ghg/engine.ts': 64,
  'lib/materiality/boardReport.ts': 17,
  'lib/materiality/boardReportPdf.ts': 6,
  'lib/materiality/register.ts': 3,
  'lib/materiality/severityScale.ts': 1,
  // 107 -> 3 on 27 Sep 2026 with no answer orphaned: 104 were option LABELS, now swept to the comma
  // convention, with the old wording kept beside each as a legacyLabel data key (exempt above). The three
  // left are QUESTION labels, which are ordinary copy and still to sweep.
}

/**
 * ⚠️ A HAND-ROLLED WALK, NOT globSync. `globSync` exists in node:fs at runtime and is NOT in the types
 * this repo compiles against, so the first version of this file passed vitest and then failed
 * `tsc --noEmit` with "Module 'node:fs' has no exported member 'globSync'". A green test run is not a
 * green build; npm run build is the authority.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(e.name)) out.push(rel)
  }
  return out
}

const sourceFiles = (): string[] =>
  [...walk('app'), ...walk('lib')]
    .map(f => relative('.', f))
    .filter(f => !f.includes('.test.'))
    .sort()

describe('no em dash reaches customer-facing copy, and the remaining budget only shrinks', () => {
  it('every file NOT in the budget has zero, so swept copy cannot regress', () => {
    const offenders = sourceFiles()
      .filter(f => !(f in SWEEP_BUDGET))
      .map(f => [f, renderedDashes(f)] as const)
      .filter(([, n]) => n > 0)
      .map(([f, n]) => `${f}: ${n}`)
    expect(offenders, offenders.length === 0 ? '' :
      `em dash in rendered copy in a file with no budget:\n  ${offenders.join('\n  ')}\n\n` +
      'Either remove it (the four patterns: label+qualifier → colon; mid-sentence aside → comma or two ' +
      'sentences; parenthetical pair → brackets; read-back or explanation → colon), or add the file to ' +
      'SWEEP_BUDGET with its count if it is a new surface that has not been swept yet.').toEqual([])
  })

  it('no budgeted file has gained one', () => {
    const grown = Object.entries(SWEEP_BUDGET)
      .map(([f, budget]) => [f, budget, renderedDashes(f)] as const)
      .filter(([, budget, actual]) => actual > budget)
      .map(([f, budget, actual]) => `${f}: budget ${budget}, found ${actual}`)
    expect(grown, grown.length === 0 ? '' :
      `em dashes ADDED to a file that was already over budget:\n  ${grown.join('\n  ')}`).toEqual([])
  })

  it('a swept file has its budget lowered, or is removed when it reaches zero', () => {
    // ⚠️ THE HALF THAT MAKES IT A RATCHET. Without this, sweeping a file leaves a budget nobody lowers, and
    // the number stops meaning anything — the same drift every stale count in this repo has suffered.
    const stale = Object.entries(SWEEP_BUDGET)
      .map(([f, budget]) => [f, budget, renderedDashes(f)] as const)
      .filter(([, budget, actual]) => actual < budget)
      .map(([f, budget, actual]) => actual === 0
        ? `${f}: now ZERO — delete this line from SWEEP_BUDGET`
        : `${f}: budget ${budget}, now ${actual} — lower it to ${actual}`)
    expect(stale, stale.length === 0 ? '' :
      `the budget is out of date, which is progress that has not been written down:\n  ${stale.join('\n  ')}`)
      .toEqual([])
  })

  it('the files that were exempt are now covered by the ordinary rules', () => {
    // ⚠️ THE EXEMPTIONS ARE GONE, SO THIS CHECKS THEY DID NOT TAKE THEIR FILES WITH THEM. A deleted
    // exemption that also dropped its files from the scan would look identical to a finished sweep.
    for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx', 'app/refund-policy/page.tsx']) {
      expect(renderedDashes(f), `${f} has gained an em dash back`).toBe(0)
      expect(SWEEP_BUDGET[f], `${f} must not have a budget`).toBeUndefined()
    }
    const api = sourceFiles().filter(f => f.startsWith('app/api/'))
    expect(api.length, 'app/api/ is no longer scanned at all').toBeGreaterThan(20)
    // The six email-building routes are swept and hold no budget; what remains under app/api/ is not
    // email copy and is budgeted with its reason.
    for (const f of ['app/api/assessment/submit/route.ts', 'app/api/impact-invite/route.ts',
                     'app/api/order/quote-request/route.ts', 'app/api/supplier-invite/route.ts',
                     'app/api/survey-invite/route.ts', 'app/api/webhooks/stripe/route.ts']) {
      expect(renderedDashes(f), `${f} is an email route and must stay at zero`).toBe(0)
      expect(SWEEP_BUDGET[f], `${f} must not have a budget`).toBeUndefined()
    }
    expect(renderedDashes('lib/obligations.ts'), 'its names travel into the email').toBe(0)
  })

  it('the permanent exemptions are real, and neither reaches further than its reason', () => {
    // An exemption that matches nothing is a rule nobody relies on, and it would hide the day the quoted
    // text was reworded. An exemption that matches everywhere is worse: that is what the old
    // /['"`]\\s*—/ did.
    const bullets = pieces(ANNEX_II_FILE).filter(p => quotedBullet(ANNEX_II_FILE, p))
    expect(bullets.length, `Annex II bullet quotations have gone from ${ANNEX_II_FILE}`).toBeGreaterThan(0)

    // ⚠️ OUR OWN DASH-OPENING PROSE IS COUNTED, NOT EXEMPTED, which is what scoping the rule to one file
    // buys. These are appended to another string at render time, so they look like bullets and are not.
    const ours = sourceFiles()
      .filter(f => f !== ANNEX_II_FILE)
      .flatMap(f => pieces(f).filter(p => p.whole && /^\s*—/.test(p.text) && p.text.trim() !== DASH)
        .map(p => p.where))
    expect(ours.length, 'if this reaches zero, delete the scoping note above').toBeGreaterThan(0)
    for (const where of ours) {
      const file = where.slice(0, where.lastIndexOf(':'))
      expect(SWEEP_BUDGET[file], `${where} opens with an em dash and its file has no budget`)
        .toBeGreaterThan(0)
    }

    expect(declarationRange(EF_SOURCES_OBJECT.file, EF_SOURCES_OBJECT.name),
      'EF_SOURCES is no longer a top-level declaration the parser can find').not.toBeNull()
  })

  it('the legacy-label exemption is confined to templates.ts, and each key has a swept label beside it', () => {
    const keys = sourceFiles().flatMap(f => pieces(f).filter(legacyDataKey).map(p => ({ f, ...p })))
    expect(keys.length, 'no legacyLabel left: delete the exemption above').toBeGreaterThan(0)
    expect([...new Set(keys.map(k => k.f))], 'a legacyLabel outside the questionnaire definition')
      .toEqual(['lib/supply-chain/templates.ts'])
    // ⚠️ THE EXEMPTION CANNOT HIDE UNSWEPT COPY. Every option carrying a legacy key must show a current
    // label that HAS been swept, so the pair is "old wording kept as a key, new wording shown".
    const src = readFileSync(join(ROOT, 'lib/supply-chain/templates.ts'), 'utf8')
    for (const m of src.matchAll(/label: '((?:[^'\\]|\\.)*)', tone: '[a-z]+', legacyLabel: '((?:[^'\\]|\\.)*)'/g)) {
      expect(m[1], `the label beside legacyLabel '${m[2]}' still carries an em dash`).not.toContain(DASH)
      expect(m[2], `legacyLabel '${m[2]}' does not differ from its label`).not.toBe(m[1])
    }
  })

  it('the empty-value glyph is counted separately, not swept', () => {
    // ⚠️ THE OLD EXEMPTION HID THESE, WHICH IS WHY THEY ARE ASSERTED RATHER THAN MERELY EXCLUDED. A whole
    // literal that IS an em dash is a blank cell, and its fix is the vocabulary in
    // lib/ghg/workingsCells.ts — not a punctuation edit. Counting them here keeps the number visible.
    const glyphs = sourceFiles().flatMap(f => pieces(f).filter(emptyValueGlyph).map(p => p.where))
    expect(glyphs.length, `empty-value glyphs left in the tree:\n  ${glyphs.join('\n  ')}`)
      .toBe(GLYPH_COUNT)
  })
})
