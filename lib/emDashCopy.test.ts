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
    .filter(p => !quotedBullet(file, p) && !emptyValueGlyph(p) && !legacyDataKey(p))
    .reduce((n, p) => n + (p.text.match(new RegExp(DASH, 'g')) ?? []).length, 0)
}

/**
 * ⚠️ PENDING A DECISION, NOT EXEMPT. These are excluded from the sweep because the decision to change them
 * has not been taken, NOT because an em dash is acceptable in them.
 *
 * ⚠️ THE THREE LEGAL PAGES HAVE LEFT THIS LIST, 27 Sep 2026. They carried document version numbers
 * (TIQ-PRV-001 · v2.2 and its siblings) and a consent version rows in purchase_consents point at, so a
 * punctuation edit raised a legal-record question rather than a copy one: does the version move, and does
 * a snapshot need a matching entry? Decided: the version does NOT move, and the amendment is recorded in
 * docs/policy-snapshots/README.md — a new file, so that no snapshot of a published version is edited. All
 * three are now at zero and held there by the unbudgeted-files test like any other page.
 *
 * THE EMAIL TEMPLATES in app/api/* remain: they are the same templates CLAUDE.md records as the
 * deliberately unmigrated brand gradient, so they are a known exception awaiting one decision rather than
 * many.
 *
 * A count is NOT asserted for what remains: the point is that nobody has looked yet, and pinning a number
 * would imply someone had.
 */
const PENDING_DECISION: readonly string[] = []
const PENDING_DECISION_PREFIX = 'app/api/'   // every email template

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
 * ⚠️ app/assess (50) FOLLOWED, AND ITS COPY SOURCES DID NOT. Every lib/ module the page takes copy from is
 * shared: lib/sb253 (3) with eight other pages, lib/nis2 (3) with /cyber, lib/ifrsS2 (1) with
 * /climate-risk. lib/obligations (23) looked /assess-only — its only importers are the page and the page's
 * own submit route — but that route renders an obligation's `name` into an EMAIL
 * (app/api/assessment/submit/route.ts:360), and the email templates are the pending decision above. All
 * four stay listed for the shared-lib group.
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
  'app/dashboard/ai-governance/page.tsx': 21,
  'app/dashboard/cbam/disclosures/page.tsx': 14,
  'app/dashboard/cbam/report/exportXlsx.ts': 10,
  'app/dashboard/cbam/report/page.tsx': 12,
  'app/dashboard/cbam/setup/page.tsx': 81,
  'app/dashboard/climate-risk/page.tsx': 35,
  'app/dashboard/climate-risk/report/page.tsx': 16,
  'app/dashboard/cyber/page.tsx': 6,
  'app/dashboard/deals/report/page.tsx': 2,
  'app/dashboard/ghg/page.tsx': 111,
  'app/dashboard/ghg/trends/page.tsx': 8,
  'app/dashboard/materiality/assessment/AssessmentForm.tsx': 12,
  'app/dashboard/materiality/assessment/new/page.tsx': 3,
  'app/dashboard/materiality/report/page.tsx': 27,
  'app/dashboard/materiality/survey/[id]/page.tsx': 4,
  'app/dashboard/materiality/survey/[id]/respondents/import/page.tsx': 12,
  'app/dashboard/materiality/survey/[id]/respondents/page.tsx': 8,
  'app/dashboard/materiality/survey/[id]/respondents/template/route.ts': 1,
  'app/dashboard/materiality/survey/[id]/results/page.tsx': 25,
  'app/dashboard/materiality/survey/[id]/scope/page.tsx': 4,
  'app/dashboard/materiality/survey/page.tsx': 8,
  'app/dashboard/materiality/worksheet/[id]/determinations/page.tsx': 14,
  'app/dashboard/materiality/worksheet/[id]/determine/page.tsx': 11,
  'app/dashboard/materiality/worksheet/[id]/iro-1/page.tsx': 2,
  'app/dashboard/materiality/worksheet/[id]/page.tsx': 18,
  'app/dashboard/materiality/worksheet/[id]/register/page.tsx': 1,
  'app/dashboard/materiality/worksheet/page.tsx': 3,
  'app/dashboard/page.tsx': 1,
  'app/dashboard/people/page.tsx': 13,
  'app/dashboard/reports/page.tsx': 1,
  'app/dashboard/sbti/page.tsx': 12,
  'app/dashboard/stakeholder/[id]/report/page.tsx': 4,
  'app/dashboard/supply-chain/page.tsx': 63,
  'app/dashboard/supply-chain/portal/[id]/page.tsx': 2,
  'app/dashboard/supply-chain/portal/[id]/supplier/[supplierId]/page.tsx': 1,
  'app/dashboard/supply-chain/portal/page.tsx': 1,
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
  'lib/cbam/cn.ts': 1,
  'lib/cbam/readiness.ts': 20,
  'lib/cbam/report/build.ts': 7,
  'lib/cbam/sefa.ts': 4,
  'lib/cbam/sefaCompute.ts': 1,
  'lib/emissionFactors/spend.ts': 1,
  'lib/emissionFactors/spendAdjustment.ts': 1,
  'lib/flag/estimate.ts': 9,
  'lib/ghg/comparability.ts': 1,
  'lib/ghg/conciergeDocTypes.ts': 2,
  'lib/ghg/engine.ts': 64,
  'lib/ghg/factorEditions.ts': 2,
  'lib/ghg/loadSeries.ts': 1,
  'lib/ghg/series.ts': 4,
  'lib/ifrsS2.ts': 1,
  'lib/materiality.ts': 8,
  'lib/materiality/boardReport.ts': 17,
  'lib/materiality/boardReportPdf.ts': 6,
  'lib/materiality/impactContext.ts': 5,
  'lib/materiality/iro1.ts': 6,
  'lib/materiality/register.ts': 5,
  'lib/materiality/respondentImport.ts': 9,
  'lib/materiality/severity.ts': 1,
  'lib/materiality/severityScale.ts': 6,
  'lib/materiality/versionAgreement.ts': 3,
  'lib/nis2.ts': 3,
  'lib/obligations.ts': 23,
  'lib/order/invoice.ts': 3,
  'lib/sb253.ts': 3,
  'lib/sbti.ts': 9,
  'lib/scope3/supplierAssurance.ts': 3,
  // 107 -> 3 on 27 Sep 2026 with no answer orphaned: 104 were option LABELS, now swept to the comma
  // convention, with the old wording kept beside each as a legacyLabel data key (exempt above). The three
  // left are QUESTION labels, which are ordinary copy and still to sweep.
  'lib/supply-chain/templates.ts': 3,
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
    .filter(f => !f.startsWith(PENDING_DECISION_PREFIX))
    .filter(f => !(PENDING_DECISION as readonly string[]).includes(f))
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

  it('the pending-decision list is empty, and the prefix still covers the email templates', () => {
    // ⚠️ ASSERTED EMPTY RATHER THAN DELETED. The list is the shape of the remaining exemption, and a page
    // added back to it has to be a deliberate edit here with the reason above it. The three legal pages
    // left on 27 Sep 2026; see docs/policy-snapshots/README.md for the amendment that let them.
    expect([...PENDING_DECISION]).toEqual([])
    expect(PENDING_DECISION_PREFIX).toBe('app/api/')
    // The templates the prefix covers do still carry em dashes, so the exemption is live rather than
    // vestigial. If this fails because they are clean, delete the prefix and the filter that uses it.
    const templates = walk('app/api').filter(f => !f.includes('.test.'))
    expect(templates.some(f => renderedDashes(f) > 0),
      'no app/api/ file carries an em dash any more').toBe(true)
    // And the legal pages are held at zero by the unbudgeted-files test above, not by an exemption.
    for (const f of ['app/privacy/page.tsx', 'app/terms/page.tsx', 'app/refund-policy/page.tsx']) {
      expect(renderedDashes(f), `${f} has gained an em dash back`).toBe(0)
      expect(SWEEP_BUDGET[f], `${f} must not have a budget`).toBeUndefined()
    }
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
